"""The only client write path (TRD §3.2 rule 11): idempotent push, scoped incremental pull."""

from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import current_user, session
from .db import AuditEvent, Change, Patient, PatientVersion, Report, SyncOp, User, Visit, utcnow

MAX_OPS = 200


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PatientIn(Strict):
    id: str
    display_name: str
    age_years: int | None = None
    sex: Literal["F", "M", "O"] | None = None
    village: str | None = None
    phone: str | None = None
    local_identifier: str | None = None
    scope_id: str
    created_by: str
    created_at: str


class PatientPatch(Strict):
    id: str
    display_name: str | None = None
    age_years: int | None = None
    sex: Literal["F", "M", "O"] | None = None
    village: str | None = None
    phone: str | None = None
    local_identifier: str | None = None


class VisitIn(Strict):
    id: str
    patient_id: str
    worker_id: str
    amends_visit_id: str | None = None
    amendment_reason: str | None = None
    visit_time: str
    notes: str = ""
    observations_json: str = "{}"
    follow_up_at: str | None = None
    created_at: str
    voided_at: str | None = None


class ReportIn(Strict):
    id: str
    patient_id: str | None = None
    file_hash: str
    fields: list[dict[str, Any]]
    created_by: str
    created_at: str


class ReportPatch(Strict):
    id: str
    patient_id: str | None = None
    fields: list[dict[str, Any]]


class AuditIn(Strict):
    id: str
    actor_id: str
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    timestamp: str
    result: str


class Operation(BaseModel):
    operation_id: str
    entity_type: str
    entity_id: str
    operation: Literal["create", "update"]
    base_version: int | None = None
    payload: dict[str, Any]


class PushBody(BaseModel):
    operations: list[Operation]


class Rejected(Exception):
    def __init__(self, code: str):
        self.code = code


MUTABLE_PATIENT_FIELDS = ("display_name", "age_years", "sex", "village", "phone", "local_identifier")


def _snapshot(p: Patient) -> dict:
    return {f: getattr(p, f) for f in MUTABLE_PATIENT_FIELDS}


def _require_scope(user: User, scope_id: str):
    if scope_id not in user.scope:
        raise Rejected("out_of_scope")


def _patient_in_scope(db: Session, user: User, patient_id: str) -> Patient:
    p = db.get(Patient, patient_id)
    if not p or p.deleted_at:
        raise Rejected("not_found")
    _require_scope(user, p.scope_id)
    return p


def _log(db: Session, entity_type: str, entity_id: str, scope_id: str):
    db.add(Change(entity_type=entity_type, entity_id=entity_id, scope_id=scope_id))


def _report_scope(db: Session, r: Report) -> str:
    p = db.get(Patient, r.patient_id) if r.patient_id else None
    return p.scope_id if p else f"user:{r.created_by}"


def _apply(db: Session, user: User, op: Operation) -> dict:
    """Applies one operation. Returns the result fields; raises Rejected for invalid ones."""
    now = utcnow()
    try:
        if op.entity_type == "patient" and op.operation == "create":
            data = PatientIn(**op.payload)
            _require_scope(user, data.scope_id)
            if db.get(Patient, data.id):
                raise Rejected("already_exists")
            p = Patient(**data.model_dump(exclude={"created_by"}), created_by=user.id, updated_at=now, record_version=1)
            db.add(p)
            db.flush()
            db.add(PatientVersion(patient_id=p.id, version=1, snapshot=_snapshot(p)))
            _log(db, "patient", p.id, p.scope_id)
            return {"status": "accepted", "entity_id": p.id, "record_version": 1}

        if op.entity_type == "patient" and op.operation == "update":
            patch = PatientPatch(**op.payload).model_dump(exclude_unset=True, exclude={"id"})
            p = _patient_in_scope(db, user, op.entity_id)
            base = db.get(PatientVersion, (p.id, op.base_version)) if op.base_version else None
            if not base:
                raise Rejected("invalid_base_version")
            current = _snapshot(p)
            server_changed = {f for f in MUTABLE_PATIENT_FIELDS if current[f] != base.snapshot[f]}
            clashes = {f: v for f, v in patch.items() if f in server_changed and v != current[f]}
            for f, v in patch.items():
                if f not in clashes:
                    setattr(p, f, v)
            status = "accepted"
            if clashes:
                # Never last-write-wins on clinical identity data: keep the server value, flag for a supervisor.
                p.needs_review = True
                p.review_note = {"submitted_by": user.id, "submitted_at": now, "proposed": clashes}
                status = "conflict"
            p.record_version += 1
            p.updated_at = now
            db.add(PatientVersion(patient_id=p.id, version=p.record_version, snapshot=_snapshot(p)))
            _log(db, "patient", p.id, p.scope_id)
            return {"status": status, "entity_id": p.id, "record_version": p.record_version}

        if op.entity_type == "patient_visit" and op.operation == "create":
            data = VisitIn(**op.payload)
            p = _patient_in_scope(db, user, data.patient_id)
            if data.amends_visit_id:
                amended = db.get(Visit, data.amends_visit_id)
                if not amended or amended.patient_id != p.id:
                    raise Rejected("invalid_amendment")
            if db.get(Visit, data.id):
                raise Rejected("already_exists")
            db.add(Visit(**data.model_dump(exclude={"worker_id"}), worker_id=user.id))
            _log(db, "patient_visit", data.id, p.scope_id)
            return {"status": "accepted", "entity_id": data.id, "record_version": 1}

        if op.entity_type == "medical_report" and op.operation == "create":
            data = ReportIn(**op.payload)
            if data.patient_id:
                _patient_in_scope(db, user, data.patient_id)
            if db.get(Report, data.id):
                raise Rejected("already_exists")
            r = Report(**data.model_dump(exclude={"created_by"}), created_by=user.id, record_version=1)
            db.add(r)
            _log(db, "medical_report", r.id, _report_scope(db, r))
            return {"status": "accepted", "entity_id": r.id, "record_version": 1}

        if op.entity_type == "medical_report" and op.operation == "update":
            data = ReportPatch(**op.payload)
            r = db.get(Report, op.entity_id)
            if not r or r.created_by != user.id and _report_scope(db, r) not in user.scope:
                raise Rejected("not_found")
            if data.patient_id:
                _patient_in_scope(db, user, data.patient_id)
            if op.base_version != r.record_version:
                return {"status": "conflict", "entity_id": r.id, "record_version": r.record_version}
            r.fields, r.patient_id = data.fields, data.patient_id
            r.record_version += 1
            _log(db, "medical_report", r.id, _report_scope(db, r))
            return {"status": "accepted", "entity_id": r.id, "record_version": r.record_version}

        if op.entity_type == "audit_event" and op.operation == "create":
            data = AuditIn(**op.payload)
            if db.get(AuditEvent, data.id):
                raise Rejected("already_exists")
            db.add(AuditEvent(**data.model_dump(exclude={"actor_id"}), actor_id=user.id))
            return {"status": "accepted", "entity_id": data.id, "record_version": 1}
    except ValidationError:
        raise Rejected("invalid")
    raise Rejected("unknown_entity")


router = APIRouter(prefix="/api/v1/sync")


def _stored(op: Operation, row: SyncOp, user: User) -> dict:
    """An operation id already used: its result, but only to the user who pushed it."""
    if row.user_id == user.id:
        return row.result
    return {"operation_id": op.operation_id, "status": "rejected", "entity_id": op.entity_id, "record_version": None,
            "error_code": "operation_id_taken", "server_time": utcnow()}


@router.post("/push")
def push(body: PushBody, user: User = Depends(current_user), db: Session = Depends(session)):
    results = []
    for op in body.operations[:MAX_OPS]:
        stored = db.get(SyncOp, op.operation_id)
        if stored:
            results.append(_stored(op, stored, user))
            continue
        try:
            outcome = _apply(db, user, op)
        except Rejected as e:
            db.rollback()
            outcome = {"status": "rejected", "entity_id": op.entity_id, "record_version": None, "error_code": e.code}
        result = {"operation_id": op.operation_id, "error_code": None, **outcome, "server_time": utcnow()}
        db.add(SyncOp(operation_id=op.operation_id, user_id=user.id, result=result))
        try:
            db.commit()
        except IntegrityError:  # same operation pushed concurrently: return the stored result
            db.rollback()
            result = _stored(op, db.get(SyncOp, op.operation_id), user)
        results.append(result)
    return {"results": results}


def _entity(db: Session, entity_type: str, entity_id: str) -> dict | None:
    model = {"patient": Patient, "patient_visit": Visit, "medical_report": Report}[entity_type]
    row = db.get(model, entity_id)
    if not row:
        return None
    data = {c.name: getattr(row, c.name) for c in row.__table__.columns}
    data.pop("review_note", None)
    return data


@router.get("/pull")
def pull(cursor: int = 0, limit: int = 500, user: User = Depends(current_user), db: Session = Depends(session)):
    scopes = [*user.scope, f"user:{user.id}"]
    rows = db.scalars(
        select(Change).where(Change.seq > cursor, Change.scope_id.in_(scopes)).order_by(Change.seq).limit(min(limit, 1000))
    ).all()
    latest: dict[tuple[str, str], int] = {}
    for c in rows:
        latest[(c.entity_type, c.entity_id)] = c.seq
    changes = []
    for (entity_type, entity_id), _ in sorted(latest.items(), key=lambda kv: kv[1]):
        entity = _entity(db, entity_type, entity_id)
        if entity:
            changes.append({"entity_type": entity_type, "entity": entity})
    return {"changes": changes, "cursor": rows[-1].seq if rows else cursor, "has_more": len(rows) == min(limit, 1000)}
