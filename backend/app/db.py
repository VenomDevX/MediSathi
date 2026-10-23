import os
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(String)
    display_name: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    scope: Mapped[list] = mapped_column(JSON, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    token_hash: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    expires_at: Mapped[str] = mapped_column(String)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    display_name: Mapped[str] = mapped_column(String)
    age_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sex: Mapped[str | None] = mapped_column(String, nullable=True)
    village: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    local_identifier: Mapped[str | None] = mapped_column(String, nullable=True)
    date_of_birth: Mapped[str | None] = mapped_column(String, nullable=True)
    abha_id: Mapped[str | None] = mapped_column(String, nullable=True)
    scope_id: Mapped[str] = mapped_column(String, index=True)
    created_by: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    updated_at: Mapped[str] = mapped_column(String)
    record_version: Mapped[int] = mapped_column(Integer, default=1)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    review_note: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    deleted_at: Mapped[str | None] = mapped_column(String, nullable=True)


class PatientVersion(Base):
    """Snapshot per version, so concurrent edits can be merged field by field (TRD §8.4)."""

    __tablename__ = "patient_versions"
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    snapshot: Mapped[dict] = mapped_column(JSON)


class Visit(Base):
    """Append-only (TRD §6.1)."""

    __tablename__ = "patient_visits"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    worker_id: Mapped[str] = mapped_column(String)
    amends_visit_id: Mapped[str | None] = mapped_column(String, nullable=True)
    amendment_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    visit_time: Mapped[str] = mapped_column(String)
    notes: Mapped[str] = mapped_column(Text, default="")
    observations_json: Mapped[str] = mapped_column(Text, default="{}")
    follow_up_at: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[str] = mapped_column(String)
    voided_at: Mapped[str | None] = mapped_column(String, nullable=True)


class Report(Base):
    """Structured fields only; images and OCR text stay on the device."""

    __tablename__ = "medical_reports"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    patient_id: Mapped[str | None] = mapped_column(String, nullable=True)
    file_hash: Mapped[str] = mapped_column(String)
    fields: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    record_version: Mapped[int] = mapped_column(Integer, default=1)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    actor_id: Mapped[str] = mapped_column(String, index=True)
    action: Mapped[str] = mapped_column(String)
    entity_type: Mapped[str | None] = mapped_column(String, nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String, nullable=True)
    timestamp: Mapped[str] = mapped_column(String)
    result: Mapped[str] = mapped_column(String)
    received_at: Mapped[str] = mapped_column(String, default=utcnow)


class Donor(Base):
    __tablename__ = "donors"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    blood_group: Mapped[str] = mapped_column(String, index=True)
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)
    locality_label: Mapped[str | None] = mapped_column(String, nullable=True)
    contact: Mapped[str | None] = mapped_column(String, nullable=True)
    consent_status: Mapped[str] = mapped_column(String)
    last_verified_at: Mapped[str | None] = mapped_column(String, nullable=True)
    registration_status: Mapped[str] = mapped_column(String, default="active")
    updated_at: Mapped[str] = mapped_column(String, default=utcnow)


class DonorToken(Base):
    """A self-registered donor's device key (hashed). Separate table so existing databases need no column migration."""

    __tablename__ = "donor_tokens"
    token_hash: Mapped[str] = mapped_column(String, primary_key=True)
    donor_id: Mapped[str] = mapped_column(ForeignKey("donors.id"), index=True)


class BloodRequest(Base):
    __tablename__ = "blood_requests"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String, unique=True)
    blood_group: Mapped[str] = mapped_column(String, index=True)
    locality_label: Mapped[str | None] = mapped_column(String, nullable=True)
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="open")
    created_at: Mapped[str] = mapped_column(String, default=utcnow)
    expires_at: Mapped[str] = mapped_column(String)


class DonorResponse(Base):
    """One answer per donor per request; the contact is shared only while accepted is true."""

    __tablename__ = "donor_responses"
    request_id: Mapped[str] = mapped_column(ForeignKey("blood_requests.id"), primary_key=True)
    donor_id: Mapped[str] = mapped_column(ForeignKey("donors.id"), primary_key=True)
    accepted: Mapped[bool] = mapped_column(Boolean)
    responded_at: Mapped[str] = mapped_column(String, default=utcnow)


class SyncOp(Base):
    """Unique operation ids make every push idempotent (TRD §8.4)."""

    __tablename__ = "sync_ops"
    operation_id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String)
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String, default=utcnow)


class Change(Base):
    """Ordered change log that `sync/pull` pages through by cursor, filtered by scope."""

    __tablename__ = "changes"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String)
    entity_id: Mapped[str] = mapped_column(String)
    scope_id: Mapped[str] = mapped_column(String, index=True)


def make_engine():
    url = os.environ.get("DATABASE_URL", "sqlite:///./medisaathi.db")
    if url == "sqlite://":  # in-memory, shared across threads (tests)
        return create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})
    return create_engine(url, pool_pre_ping=True)


def make_sessionmaker(engine):
    return sessionmaker(engine, expire_on_commit=False)
