import hashlib
import os
import secrets
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
    """Locks a username after repeated wrong passwords, so a password cannot be guessed online."""

    # ponytail: in memory, per process; move to the database when running more than one server process.
    LIMIT, WINDOW = 10, 15 * 60

    def __init__(self):
        self.seen: dict[str, list[float]] = {}

    def locked(self, name: str) -> bool:
        cutoff = time.monotonic() - self.WINDOW
        self.seen[name] = [t for t in self.seen.get(name, []) if t > cutoff]
        return len(self.seen[name]) >= self.LIMIT

    def failed(self, name: str):
        self.seen.setdefault(name, []).append(time.monotonic())

    def cleared(self, name: str):
        self.seen.pop(name, None)


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
    name, failures = body.username.strip().lower(), request.app.state.login_failures
    if failures.locked(name):
        raise HTTPException(429, "too_many_attempts")
    user = db.scalar(select(User).where(User.username == name))
    try:
        hasher.verify(user.password_hash if user else _DUMMY_HASH, body.password)
    except VerifyMismatchError:
        user = None
    if not user or not user.active:
        failures.failed(name)
        raise HTTPException(401, "invalid_credentials")
    failures.cleared(name)
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
