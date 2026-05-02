"""Authentifizierungs-Routen.

Enthält Login, Logout, ``/me`` (aktuell angemeldeter User) und
Passwort-Änderung. Login verwendet ein Server-seitiges Sessions-Modell
(Token in DB, Hash im httpOnly-Cookie) statt JWT, damit Sessions zentral
invalidiert werden können. Wiederholte Fehlversuche werden pro IP über
``services.rate_limit`` gedrosselt.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request, Response, status

from meters.api.deps import CurrentUser, DbDep, client_ip
from meters.core.config import settings
from meters.core.problem import ProblemError
from meters.core.security import SESSION_COOKIE_NAME, hash_password, verify_password
from meters.models import AuditAction, AuditEntityType
from meters.schemas import ChangePasswordRequest, LoginRequest, MeResponse
from meters.services import auth as auth_service
from meters.services.audit import record
from meters.services.rate_limit import login_limiter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=MeResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: DbDep,
) -> MeResponse:
    ip = client_ip(request) or "unknown"
    locked_for = login_limiter.check(ip)
    if locked_for is not None:
        raise ProblemError(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            title="Too many attempts",
            detail=f"Login gesperrt. Erneut versuchen in ~{int(locked_for)}s.",
        )

    user = auth_service.authenticate(db, username=payload.username, password=payload.password)
    if user is None:
        login_limiter.record_failure(ip)
        record(
            db,
            user_id=None,
            action=AuditAction.LOGIN_FAILED,
            entity_type=AuditEntityType.USER,
            entity_id=None,
            diff={"username": payload.username},
            ip_address=ip,
        )
        db.commit()
        raise ProblemError(status_code=401, title="Invalid credentials")

    login_limiter.record_success(ip)
    user_agent = request.headers.get("user-agent")
    _session, token = auth_service.issue_session(
        db, user=user, user_agent=user_agent, ip_address=ip
    )
    db.commit()
    db.refresh(user)

    samesite_value: Literal["lax", "strict", "none"] = (
        "strict" if settings.cookie_samesite == "strict" else "lax"
    )
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=60 * 60 * 24 * settings.session_lifetime_days,
        httponly=True,
        samesite=samesite_value,
        secure=settings.cookie_secure,
        path="/",
    )
    return MeResponse.model_validate(user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: DbDep, user: CurrentUser) -> Response:
    session = getattr(request.state, "session", None)
    if session is not None:
        auth_service.revoke_session(db, session=session, ip_address=client_ip(request))
        db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.status_code = 204
    return response


@router.get("/me", response_model=MeResponse)
def me(user: CurrentUser) -> MeResponse:
    return MeResponse.model_validate(user)


@router.post("/change-password", response_model=MeResponse)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: DbDep,
    user: CurrentUser,
) -> MeResponse:
    if not verify_password(payload.current_password, user.password_hash):
        raise ProblemError(status_code=400, title="Current password incorrect")
    if payload.current_password == payload.new_password:
        raise ProblemError(status_code=400, title="New password must differ")

    user.password_hash = hash_password(payload.new_password)
    user.force_password_change = False
    record(
        db,
        user_id=user.id,
        action=AuditAction.PASSWORD_RESET,
        entity_type=AuditEntityType.USER,
        entity_id=user.id,
        diff={"self_change": True},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(user)
    return MeResponse.model_validate(user)
