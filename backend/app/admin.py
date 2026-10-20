"""Server-rendered admin for supervisors (PRD persona P4). Admin role only."""

from argon2.exceptions import VerifyMismatchError
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from starlette.requests import Request

from .auth import hasher, secret
from .db import AuditEvent, Donor, Patient, User, Visit


class AdminAuth(AuthenticationBackend):
    def __init__(self, engine_sessions, failures):
        super().__init__(secret_key=secret())
        self.sessions = engine_sessions
        self.failures = failures

    async def login(self, request: Request) -> bool:
        form = await request.form()
        name, address = str(form.get("username", "")).strip().lower(), request.client.host if request.client else ""
        with self.sessions() as db:
            user = db.scalar(select(User).where(User.username == name, User.role == "admin"))
            if not self.failures.attempt(name if user else None, address):
                return False
            try:
                ok = bool(user) and hasher.verify(user.password_hash, str(form.get("password", "")))
            except VerifyMismatchError:
                ok = False
        if ok:
            self.failures.succeeded(name, address)
            request.session.update({"admin": user.id})
        return ok

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return "admin" in request.session


class PatientAdmin(ModelView, model=Patient):
    column_list = [Patient.display_name, Patient.village, Patient.scope_id, Patient.record_version, Patient.needs_review, Patient.updated_at]
    column_searchable_list = [Patient.display_name, Patient.local_identifier]
    column_filters = [Patient.needs_review]
    can_delete = False


class VisitAdmin(ModelView, model=Visit):
    column_list = [Visit.visit_time, Visit.patient_id, Visit.worker_id, Visit.amends_visit_id, Visit.follow_up_at]
    can_create = can_edit = can_delete = False  # append-only


class DonorAdmin(ModelView, model=Donor):
    column_list = [Donor.blood_group, Donor.locality_label, Donor.consent_status, Donor.registration_status, Donor.last_verified_at]


class AuditAdmin(ModelView, model=AuditEvent):
    column_list = [AuditEvent.timestamp, AuditEvent.actor_id, AuditEvent.action, AuditEvent.entity_id, AuditEvent.result]
    can_create = can_edit = can_delete = False


class UserAdmin(ModelView, model=User):
    column_list = [User.username, User.display_name, User.role, User.scope, User.active]
    form_excluded_columns = [User.password_hash]
    can_delete = False


def mount_admin(app, engine):
    admin = Admin(app, engine, authentication_backend=AdminAuth(app.state.sessions, app.state.login_failures), title="MediSaathi admin")
    for view in (PatientAdmin, VisitAdmin, DonorAdmin, AuditAdmin, UserAdmin):
        admin.add_view(view)
