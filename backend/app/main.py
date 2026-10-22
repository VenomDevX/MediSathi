import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import assist, auth, blood, sync
from .auth import current_user, hasher, session
from .db import Base, Change, Donor, DonorToken, Patient, PatientVersion, User, make_engine, make_sessionmaker, utcnow

CONTENT = Path(__file__).resolve().parents[2] / "content"


def _load(name: str):
    return json.loads((CONTENT / name).read_text(encoding="utf8"))


def seed(db: Session):
    """Loads the synthetic demo data from content/ on first start. Never real people."""
    if db.scalar(select(User).limit(1)):
        return
    if not os.environ.get("DEMO_PASSWORD"):
        raise RuntimeError("Set DEMO_PASSWORD for the seeded demo accounts (including admin)")
    password = hasher.hash(os.environ["DEMO_PASSWORD"])
    for u in _load("users.json"):
        db.add(User(id=u["id"], username=u["id"].removeprefix("u-"), password_hash=password, display_name=u["display_name"], role=u["role"], scope=u["assigned_scope"]))
    db.add(User(id="u-admin", username="admin", password_hash=password, display_name="Admin", role="admin", scope=[]))
    for p in _load("patients.json"):
        row = Patient(**p, phone=None, created_at=utcnow(), updated_at=utcnow(), record_version=1)
        db.add(row)
        db.flush()
        db.add(PatientVersion(patient_id=row.id, version=1, snapshot={f: getattr(row, f) for f in sync.MUTABLE_PATIENT_FIELDS}))
        db.add(Change(entity_type="patient", entity_id=row.id, scope_id=row.scope_id))
    contacts = _load("server/donor_contacts.json")
    for d in _load("donors.json"):
        db.add(Donor(id=d["id"], blood_group=d["blood_group"], latitude=d["approx_latitude"], longitude=d["approx_longitude"],
                     locality_label=d["locality_label"], contact=contacts.get(d["id"]), consent_status=d["consent_status"],
                     last_verified_at=d["last_verified_at"], registration_status=d["registration_status"]))
    db.commit()


def create_app() -> FastAPI:
    auth.secret()  # fail fast without a real secret
    engine = make_engine()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        Base.metadata.create_all(engine)  # ponytail: create_all, no migrations tool; add Alembic before the first schema change in production
        with app.state.sessions() as db:
            seed(db)
        yield

    app = FastAPI(title="MediSaathi API", version="1.0.0", lifespan=lifespan)
    app.state.sessions = make_sessionmaker(engine)
    app.state.login_failures = auth.LoginFailures()
    origins = os.environ.get("CORS_ORIGINS", "http://localhost:3100,http://localhost:4200,http://localhost:5173,http://localhost:4173,capacitor://localhost,http://localhost,https://localhost")
    app.add_middleware(CORSMiddleware, allow_origins=origins.split(","), allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
    app.include_router(auth.router)
    app.include_router(sync.router)
    app.include_router(blood.router)
    app.include_router(assist.router)

    @app.get("/api/v1/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/v1/donors/directory")
    def directory(user: User = Depends(current_user), db: Session = Depends(session)):
        """Full snapshot of consenting donors. Coordinates rounded to ~1 km; contacts only for coordinators (PRD BL-05, BL-11)."""
        # Self-registered donors (with a device token) consented to share only per accepted request, never via this list.
        self_registered = select(DonorToken.donor_id)
        rows = db.scalars(select(Donor).where(Donor.consent_status == "granted", Donor.registration_status == "active",
                                              Donor.id.not_in(self_registered))).all()
        coordinator = user.role == "coordinator"
        return {
            "synced_at": utcnow(),
            "donors": [
                {
                    "id": d.id, "blood_group": d.blood_group,
                    "approx_latitude": round(d.latitude, 2) if d.latitude is not None else None,
                    "approx_longitude": round(d.longitude, 2) if d.longitude is not None else None,
                    "locality_label": d.locality_label, "consent_status": d.consent_status,
                    "registration_status": d.registration_status, "last_verified_at": d.last_verified_at,
                    "contact": d.contact if coordinator else None,
                }
                for d in rows
            ],
        }

    @app.get("/api/v1/guidance/manifest")
    def guidance_manifest(user: User = Depends(current_user)):
        return _load("manifest.json")

    from .admin import mount_admin

    mount_admin(app, engine)
    return app


app = create_app() if os.environ.get("MEDISAATHI_SECRET") else None
