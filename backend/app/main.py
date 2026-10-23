import json
import os
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from . import assist, auth, blood, sync
from .auth import current_user, hasher, session
from .db import Base, Change, Donor, DonorToken, Patient, PatientVersion, User, Visit, make_engine, make_sessionmaker, utcnow

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
    days_ago = lambda n: (datetime.now(timezone.utc) - timedelta(days=n)).isoformat().replace("+00:00", "Z")  # noqa: E731
    for p in _load("patients.json"):
        dob = p.pop("dob_days_ago", None)
        row = Patient(**p, date_of_birth=days_ago(dob)[:10] if dob is not None else None, phone=None, created_at=utcnow(),
                      updated_at=utcnow(), record_version=1)
        db.add(row)
        db.flush()
        db.add(PatientVersion(patient_id=row.id, version=1, snapshot={f: getattr(row, f) for f in sync.MUTABLE_PATIENT_FIELDS}))
        db.add(Change(entity_type="patient", entity_id=row.id, scope_id=row.scope_id))
    db.flush()
    scopes = {p["id"]: p["scope_id"] for p in _load("patients.json")}
    for v in _load("visits.json"):  # demo fever cluster, pregnancy and baby doses, dated relative to first start
        at = days_ago(v["days_ago"])
        obs = dict(v["observations"])
        if "lmp_days_ago" in obs:
            obs["lmp"] = days_ago(obs.pop("lmp_days_ago"))[:10]
        db.add(Visit(id=v["id"], patient_id=v["patient_id"], worker_id=v["worker_id"], visit_time=at, notes=v["notes"],
                     observations_json=json.dumps(obs), created_at=at))
        db.add(Change(entity_type="patient_visit", entity_id=v["id"], scope_id=scopes[v["patient_id"]]))
    contacts = _load("server/donor_contacts.json")
    for d in _load("donors.json"):
        db.add(Donor(id=d["id"], blood_group=d["blood_group"], latitude=d["approx_latitude"], longitude=d["approx_longitude"],
                     locality_label=d["locality_label"], contact=contacts.get(d["id"]), consent_status=d["consent_status"],
                     last_verified_at=d["last_verified_at"], registration_status=d["registration_status"]))
    db.commit()


def _add_missing_columns(engine):
    """create_all never alters an existing table: add columns that came later to a database made before them."""
    have = {c["name"] for c in inspect(engine).get_columns("patients")}
    with engine.begin() as conn:
        for col in ("date_of_birth", "abha_id"):
            if col not in have:
                conn.execute(text(f"ALTER TABLE patients ADD COLUMN {col} VARCHAR"))


def create_app() -> FastAPI:
    auth.secret()  # fail fast without a real secret
    engine = make_engine()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        Base.metadata.create_all(engine)  # ponytail: create_all, no migrations tool; add Alembic before the first schema change in production
        _add_missing_columns(engine)
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
