"""Blood requests without accounts (personal app).

Requesters and donors each hold a random device token; only its hash is stored. A request never
exposes who asked, and a donor's contact reaches a requester only after that donor accepts that
request. Every share is audited.
"""

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import _hash, session
from .db import AuditEvent, BloodRequest, Donor, DonorResponse, DonorToken, utcnow

REQUEST_DAYS = 3
Group = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]


class Place(BaseModel):
    blood_group: Group
    locality_label: str = Field(min_length=1, max_length=80)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)


class Registration(Place):
    contact: str = Field(min_length=3, max_length=40)
    consent: Literal[True]


class Ask(Place):
    note: str = Field("", max_length=300)


class Answer(BaseModel):
    accept: bool


def _token(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(401, "not_authenticated")
    return _hash(header[7:])


def current_donor(request: Request, db: Session = Depends(session)) -> Donor:
    row = db.get(DonorToken, _token(request))
    donor = row and db.get(Donor, row.donor_id)
    if not donor or donor.consent_status != "granted" or donor.registration_status != "active":
        raise HTTPException(401, "invalid_token")
    return donor


def _own_request(request_id: str, request: Request, db: Session) -> BloodRequest:
    row = db.get(BloodRequest, request_id)
    if not row or not secrets.compare_digest(row.token_hash, _token(request)):
        raise HTTPException(404, "not_found")
    return row


def _open(db: Session, request_id: str, group: str) -> BloodRequest:
    row = db.get(BloodRequest, request_id)
    if not row or row.status != "open" or row.expires_at < utcnow() or row.blood_group != group:
        raise HTTPException(404, "not_found")
    return row


router = APIRouter(prefix="/api/v1/blood")


@router.post("/donors", status_code=201)
def register(body: Registration, db: Session = Depends(session)):
    token = secrets.token_urlsafe(32)
    donor = Donor(id=f"d-{uuid.uuid4()}", blood_group=body.blood_group, latitude=body.latitude, longitude=body.longitude,
                  locality_label=body.locality_label, contact=body.contact.strip(), consent_status="granted",
                  last_verified_at=utcnow(), registration_status="active")
    db.add(donor)
    db.flush()
    db.add(DonorToken(token_hash=_hash(token), donor_id=donor.id))
    db.commit()
    return {"donor_id": donor.id, "token": token}


@router.post("/donors/me/withdraw", status_code=204)
def withdraw(donor: Donor = Depends(current_donor), db: Session = Depends(session)):
    donor.consent_status, donor.contact, donor.updated_at = "withdrawn", None, utcnow()
    db.commit()
    return Response(status_code=204)


@router.post("/requests", status_code=201)
def ask(body: Ask, db: Session = Depends(session)):
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(days=REQUEST_DAYS)).isoformat().replace("+00:00", "Z")
    row = BloodRequest(id=f"br-{uuid.uuid4()}", token_hash=_hash(token), blood_group=body.blood_group, locality_label=body.locality_label,
                       latitude=body.latitude, longitude=body.longitude, note=body.note.strip(), expires_at=expires)
    db.add(row)
    db.commit()
    return {"id": row.id, "token": token, "expires_at": expires}


@router.get("/requests/for-me")
def for_me(donor: Donor = Depends(current_donor), db: Session = Depends(session)):
    # ponytail: every open request for the donor's group; add a distance cut-off when requests span more than a district.
    rows = db.scalars(select(BloodRequest).where(BloodRequest.blood_group == donor.blood_group, BloodRequest.status == "open",
                                                 BloodRequest.expires_at >= utcnow()).order_by(BloodRequest.created_at.desc())).all()
    answers = {r.request_id: r.accepted for r in db.scalars(select(DonorResponse).where(DonorResponse.donor_id == donor.id))}
    return {"requests": [
        {"id": r.id, "blood_group": r.blood_group, "locality_label": r.locality_label,
         "approx_latitude": round(r.latitude, 2) if r.latitude is not None else None,
         "approx_longitude": round(r.longitude, 2) if r.longitude is not None else None,
         "note": r.note, "created_at": r.created_at, "expires_at": r.expires_at,
         "my_answer": None if r.id not in answers else "accepted" if answers[r.id] else "declined"}
        for r in rows
    ]}


@router.post("/requests/{request_id}/respond", status_code=204)
def respond(request_id: str, body: Answer, donor: Donor = Depends(current_donor), db: Session = Depends(session)):
    _open(db, request_id, donor.blood_group)
    db.merge(DonorResponse(request_id=request_id, donor_id=donor.id, accepted=body.accept, responded_at=utcnow()))
    if body.accept:
        db.add(AuditEvent(id=str(uuid.uuid4()), actor_id=donor.id, action="donor_contact_shared", entity_type="blood_request",
                          entity_id=request_id, timestamp=utcnow(), result="ok"))
    db.commit()
    return Response(status_code=204)


@router.get("/requests/{request_id}")
def status(request_id: str, request: Request, db: Session = Depends(session)):
    row = _own_request(request_id, request, db)
    accepted = db.execute(
        select(Donor, DonorResponse.responded_at).join(DonorResponse, DonorResponse.donor_id == Donor.id)
        .where(DonorResponse.request_id == row.id, DonorResponse.accepted, Donor.consent_status == "granted",
               Donor.registration_status == "active")
    ).all()
    return {
        "id": row.id, "blood_group": row.blood_group, "locality_label": row.locality_label, "note": row.note,
        "status": row.status, "created_at": row.created_at, "expires_at": row.expires_at,
        "donors": [{"locality_label": d.locality_label, "contact": d.contact, "accepted_at": at} for d, at in accepted],
    }


@router.post("/requests/{request_id}/close", status_code=204)
def close(request_id: str, request: Request, db: Session = Depends(session)):
    _own_request(request_id, request, db).status = "closed"
    db.commit()
    return Response(status_code=204)
