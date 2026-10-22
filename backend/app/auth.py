import hashlib
import ipaddress
import json
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from urllib.request import urlopen

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
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


class SignUp(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9._-]+$")  # no ":", kept for google:<sub>
    password: str = Field(min_length=8, max_length=256)


class GoogleToken(BaseModel):
    id_token: str = Field(max_length=4096)


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


def _citizen(db: Session, username: str, display_name: str, password: str) -> User:
    user = User(id=f"u-{secrets.token_hex(8)}", username=username, password_hash=hasher.hash(password),
                display_name=display_name.strip(), role="citizen", scope=[])  # sign-up never grants a role or a scope
    db.add(user)
    db.commit()
    return user


@router.post("/signup")
def signup(body: SignUp, request: Request, db: Session = Depends(session)):
    """Citizens only: ASHA workers and coordinators carry a village scope, so an admin creates them."""
    # Every sign-up counts against the address's login limit (never refunded), so one address cannot mass-create accounts.
    if not request.app.state.login_failures.attempt("signup", request.client.host if request.client else "", exists=False):
        raise HTTPException(429, "too_many_attempts")
    name = body.username.lower()
    if db.scalar(select(User).where(User.username == name)):
        raise HTTPException(409, "username_taken")
    try:
        return _issue(db, _citizen(db, name, body.display_name, body.password))
    except IntegrityError:  # the same name signed up at the same moment
        raise HTTPException(409, "username_taken")


def _google_claims(token: str, client_id: str) -> dict | None:
    """Google checks the signature and expiry; we check it was issued to our app for a verified email."""
    try:
        with urlopen(f"https://oauth2.googleapis.com/tokeninfo?id_token={quote(token)}", timeout=5) as res:
            c = json.loads(res.read())
    except Exception:  # Google answers 400 for a bad or expired token
        return None
    ok = (c.get("aud") == client_id and c.get("iss") in ("accounts.google.com", "https://accounts.google.com")
          and c.get("email_verified") in (True, "true") and int(c.get("exp", 0)) > time.time() and c.get("sub"))
    return c if ok else None


@router.post("/google")
def google(body: GoogleToken, request: Request, db: Session = Depends(session)):
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(503, "google_sign_in_off")
    # Each bad token costs a call to Google, so failures count against the address like wrong passwords.
    address, failures = request.client.host if request.client else "", request.app.state.login_failures
    if not failures.attempt("google", address, exists=False):
        raise HTTPException(429, "too_many_attempts")
    claims = _google_claims(body.id_token, client_id)
    if not claims:
        raise HTTPException(401, "invalid_google_token")
    failures.succeeded("google", address)
    name = f"google:{claims['sub']}"  # sign-up names cannot contain ":", so this never meets a password account
    user = db.scalar(select(User).where(User.username == name))
    if not user:
        # random password nobody knows: the account is reachable only through Google
        user = _citizen(db, name, claims.get("name") or claims.get("email", "").split("@")[0] or "Google user", secrets.token_urlsafe(32))
    if not user.active:
        raise HTTPException(401, "invalid_credentials")
    return _issue(db, user)
