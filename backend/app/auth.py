import hashlib
import ipaddress
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import RefreshToken, User, utcnow

ACCESS_MINUTES = 15
REFRESH_DAYS = 30
hasher = PasswordHasher()
# Hash compared against when the username does not exist, so timing does not reveal valid usernames.
_DUMMY_HASH = hasher.hash("not-a-real-password")


def _network(address: str) -> str:
    """IPv6 hands one person a whole /64, so the /64 counts as one address. IPv4 clients seen through a dual-stack
    socket (::ffff:a.b.c.d) stay their own IPv4 address."""
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return address
    if ip.version == 4:
        return str(ip)
    if ip.ipv4_mapped:
        return str(ip.ipv4_mapped)
    return str(ipaddress.ip_network(f"{ip}/64", strict=False))


class LoginFailures:
    """Throttles password guessing. Every attempt is counted before the password is checked, under one lock, so
    parallel requests cannot slip past. Per 15 minutes, only failures count:
    - 20 per account, from anywhere. Kept only for accounts that exist, so this store is bounded by the number of
      accounts and is never evicted or refused: no flood can reopen guessing on a real account.
    - 5 per username per address (real or made up, so one address cannot tell which usernames exist), and 30 per
      address overall (so one attacker cannot lock the real user out, nor try
      many usernames). These live in a capped store; when it is full, attempts are still checked against what is
      there but not recorded, so a flood never blocks everyone."""

    # ponytail: in memory, per process; move to the database when running more than one server process.
    # Behind a reverse proxy every client shares one address: run uvicorn --proxy-headers --forwarded-allow-ips=<proxy>.
    PER_ADDRESS, PER_NAME, PER_ADDRESS_ALL, WINDOW, MAX_KEYS = 5, 20, 30, 15 * 60, 100_000

    def __init__(self):
        self.names: dict[str, list[float]] = {}
        self.other: dict[tuple, list[float]] = {}
        self.lock = threading.Lock()

    def _recent(self, store: dict, key, now: float) -> int:
        recent = [t for t in store.get(key, ()) if t > now - self.WINDOW]
        if recent:
            store[key] = recent
        else:
            store.pop(key, None)  # never store empty entries
        return len(recent)

    def attempt(self, name: str, address: str, exists: bool = True) -> bool:
        """Records one login attempt; False when it is over a limit. `exists`: the username is a real account."""
        now, address = time.monotonic(), _network(address)
        keys = [("address", address), ("pair", name, address)]
        with self.lock:
            if exists and self._recent(self.names, name, now) >= self.PER_NAME:
                return False
            if self._recent(self.other, keys[0], now) >= self.PER_ADDRESS_ALL:
                return False
            if self._recent(self.other, keys[1], now) >= self.PER_ADDRESS:
                return False
            if exists:
                self.names.setdefault(name, []).append(now)
            new = sum(k not in self.other for k in keys)
            if len(self.other) + new > self.MAX_KEYS:
                for k in list(self.other):
                    self._recent(self.other, k, now)
            if len(self.other) + new <= self.MAX_KEYS:
                for k in keys:
                    self.other.setdefault(k, []).append(now)
            return True

    def succeeded(self, account: str, address: str):
        """Only failures count: refund this attempt and clear this address's tries for the account."""
        address = _network(address)
        with self.lock:
            self.other.pop(("pair", account, address), None)
            for store, key in ((self.names, account), (self.other, ("address", address))):
                if store.get(key):
                    store[key].pop()
                    if not store[key]:
                        del store[key]


def secret() -> str:
    s = os.environ.get("MEDISAATHI_SECRET", "")
    if len(s) < 32:
        raise RuntimeError("Set MEDISAATHI_SECRET to a random string of at least 32 characters")
    return s


def session(request: Request):
    with request.app.state.sessions() as s:
        yield s


def current_user(request: Request, db: Session = Depends(session)) -> User:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(401, "not_authenticated")
    try:
        claims = jwt.decode(header[7:], secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid_token")
    user = db.get(User, claims["sub"])
    if not user or not user.active:
        raise HTTPException(401, "invalid_token")
    return user


def _issue(db: Session, user: User) -> dict:
    now = datetime.now(timezone.utc)
    access = jwt.encode({"sub": user.id, "role": user.role, "exp": now + timedelta(minutes=ACCESS_MINUTES)}, secret(), algorithm="HS256")
    refresh = secrets.token_urlsafe(32)
    db.add(RefreshToken(token_hash=_hash(refresh), user_id=user.id, expires_at=(now + timedelta(days=REFRESH_DAYS)).isoformat()))
    db.commit()
    return {
        "access_token": access,
        "refresh_token": refresh,
        "user": {"id": user.id, "display_name": user.display_name, "role": user.role, "assigned_scope": user.scope},
        "server_time": utcnow(),
    }


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class Credentials(BaseModel):
    username: str = Field(max_length=64)  # also keeps the login limiter's entries small
    password: str = Field(max_length=256)


class RefreshBody(BaseModel):
    refresh_token: str


router = APIRouter(prefix="/api/v1/auth")


@router.post("/login")
def login(body: Credentials, request: Request, db: Session = Depends(session)):
    name, address, failures = body.username.strip().lower(), request.client.host if request.client else "", request.app.state.login_failures
    user = db.scalar(select(User).where(User.username == name))
    if not failures.attempt(name, address, exists=bool(user)):
        raise HTTPException(429, "too_many_attempts")
    try:
        hasher.verify(user.password_hash if user else _DUMMY_HASH, body.password)
    except VerifyMismatchError:
        user = None
    if not user or not user.active:
        raise HTTPException(401, "invalid_credentials")
    failures.succeeded(name, address)
    return _issue(db, user)


@router.post("/refresh")
def refresh(body: RefreshBody, db: Session = Depends(session)):
    row = db.get(RefreshToken, _hash(body.refresh_token))
    if not row or row.revoked or row.expires_at < datetime.now(timezone.utc).isoformat():
        raise HTTPException(401, "invalid_refresh_token")
    row.revoked = True  # rotation: each refresh token works once
    user = db.get(User, row.user_id)
    if not user or not user.active:
        db.commit()
        raise HTTPException(401, "invalid_refresh_token")
    return _issue(db, user)


@router.post("/logout", status_code=204)
def logout(body: RefreshBody, db: Session = Depends(session)):
    row = db.get(RefreshToken, _hash(body.refresh_token))
    if row:
        row.revoked = True
        db.commit()
    return Response(status_code=204)
