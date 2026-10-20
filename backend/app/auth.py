import hashlib
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
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import RefreshToken, User, utcnow

ACCESS_MINUTES = 15
REFRESH_DAYS = 30
hasher = PasswordHasher()
# Hash compared against when the username does not exist, so timing does not reveal valid usernames.
_DUMMY_HASH = hasher.hash("not-a-real-password")


class LoginFailures:
    """Throttles password guessing. Every attempt is counted before the password is checked, under one lock, so
    parallel requests cannot slip past. Limits per 15 minutes: 5 tries per username from one address, 20 per username
    from all addresses (so one attacker cannot lock the real user out), and 30 tries per address across all usernames.
    A full store refuses new entries rather than forgetting live ones."""

    # ponytail: in memory, per process; move to the database when running more than one server process.
    # Behind a reverse proxy every client shares one address: run uvicorn --proxy-headers --forwarded-allow-ips=<proxy>.
    PER_ADDRESS, PER_NAME, PER_ADDRESS_ALL, WINDOW, MAX_KEYS = 5, 20, 30, 15 * 60, 100_000

    def __init__(self):
        self.seen: dict[tuple, list[float]] = {}
        self.lock = threading.Lock()

    def _recent(self, key: tuple, now: float) -> int:
        recent = [t for t in self.seen.get(key, ()) if t > now - self.WINDOW]
        if recent:
            self.seen[key] = recent
        else:
            self.seen.pop(key, None)  # never store empty entries
        return len(recent)

    def attempt(self, name: str, address: str) -> bool:
        """Records one login attempt; False when it is over a limit."""
        now = time.monotonic()
        keys = (("name", name), ("pair", name, address), ("address", address))
        with self.lock:
            by_name, by_pair, by_address = (self._recent(k, now) for k in keys)
            if by_pair >= self.PER_ADDRESS or by_name >= self.PER_NAME or by_address >= self.PER_ADDRESS_ALL:
                return False
            new = sum(k not in self.seen for k in keys)
            if len(self.seen) + new > self.MAX_KEYS:
                for k in list(self.seen):
                    self._recent(k, now)
                if len(self.seen) + new > self.MAX_KEYS:
                    return False  # fail closed: never drop a live counter to make room
            for k in keys:
                self.seen.setdefault(k, []).append(now)
            return True

    def succeeded(self, name: str, address: str):
        """Only failures count: refund this attempt and clear this address's tries for the name."""
        with self.lock:
            self.seen.pop(("pair", name, address), None)
            for k in (("name", name), ("address", address)):
                if self.seen.get(k):
                    self.seen[k].pop()
                    if not self.seen[k]:
                        del self.seen[k]


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
    username: str
    password: str


class RefreshBody(BaseModel):
    refresh_token: str


router = APIRouter(prefix="/api/v1/auth")


@router.post("/login")
def login(body: Credentials, request: Request, db: Session = Depends(session)):
    name, address, failures = body.username.strip().lower(), request.client.host if request.client else "", request.app.state.login_failures
    if not failures.attempt(name, address):
        raise HTTPException(429, "too_many_attempts")
    user = db.scalar(select(User).where(User.username == name))
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
