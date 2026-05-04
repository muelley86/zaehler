"""Authentifizierungs-Routen.

Login, Logout, ``/me``, Passwort-Änderung sowie der zweistufige
TOTP-Flow:

1. ``POST /auth/login`` mit Username/Passwort.
   * User ohne 2FA: setzt direkt ein Session-Cookie und liefert
     ``LoginResponse(requires_2fa=False, me=...)``.
   * User mit 2FA: legt eine ``PendingTotpChallenge`` an und liefert
     ``LoginResponse(requires_2fa=True, challenge_token=...)`` — kein
     Cookie. Der Frontend-Step-2 ruft dann ``POST /auth/2fa/verify``.

Sessions werden weiterhin server-seitig gehalten; rate-limit + audit
greifen unverändert.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request, Response, status

from meters.api.deps import CurrentUser, DbDep, client_ip
from meters.core.config import settings
from meters.core.problem import ProblemError
from meters.core.security import SESSION_COOKIE_NAME, hash_password, verify_password
from meters.models import AuditAction, AuditEntityType
from meters.schemas import (
    BackupCodesResponse,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    TotpActivateRequest,
    TotpActivateResponse,
    TotpDisableRequest,
    TotpSetupResponse,
    TotpStatusResponse,
    TotpVerifyRequest,
)
from meters.services import auth as auth_service
from meters.services import totp as totp_service
from meters.services.audit import record
from meters.services.rate_limit import login_limiter, username_limiter

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
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


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: DbDep,
) -> LoginResponse:
    ip = client_ip(request) or "unknown"
    username_key = payload.username.strip().lower()
    locked_for = login_limiter.check(ip)
    if locked_for is None:
        locked_for = username_limiter.check(username_key)
    if locked_for is not None:
        raise ProblemError(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            title="Too many attempts",
            detail=f"Login gesperrt. Erneut versuchen in ~{int(locked_for)}s.",
        )

    user = auth_service.authenticate(db, username=payload.username, password=payload.password)
    if user is None:
        login_limiter.record_failure(ip)
        username_limiter.record_failure(username_key)
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
    username_limiter.record_success(username_key)

    user_agent = request.headers.get("user-agent")

    if user.totp_enabled and user.totp_secret:
        # Zwischenschritt: TOTP-Code verlangen.
        _challenge, challenge_token = totp_service.create_pending_challenge(
            db, user=user, user_agent=user_agent, ip_address=ip
        )
        db.commit()
        return LoginResponse(requires_2fa=True, challenge_token=challenge_token)

    # Direkter Login (kein 2FA).
    _session, token = auth_service.issue_session(
        db, user=user, user_agent=user_agent, ip_address=ip
    )
    db.commit()
    db.refresh(user)
    _set_session_cookie(response, token)
    return LoginResponse(requires_2fa=False, me=MeResponse.model_validate(user))


@router.post("/2fa/verify", response_model=MeResponse)
def verify_2fa(
    payload: TotpVerifyRequest,
    request: Request,
    response: Response,
    db: DbDep,
) -> MeResponse:
    ip = client_ip(request) or "unknown"
    resolved = totp_service.resolve_pending_challenge(db, token=payload.challenge_token)
    if resolved is None:
        raise ProblemError(status_code=401, title="Challenge expired or unknown")
    user, challenge = resolved

    if not user.totp_secret or not user.totp_enabled:
        # Sicherheits-Failsafe: User hat 2FA in der Zwischenzeit deaktiviert.
        totp_service.consume_pending_challenge(db, challenge=challenge)
        db.commit()
        raise ProblemError(status_code=400, title="TOTP not enabled")

    code = payload.code.strip()
    success = totp_service.verify_totp(user.totp_secret, code)
    audit_action = AuditAction.LOGIN
    diff: dict[str, object] | None = None
    # Backup-Code-Variante (16 Hex-Zeichen, optional mit Trennstrich).
    if not success and totp_service.consume_backup_code(db, user=user, code=code):
        success = True
        audit_action = AuditAction.BACKUP_CODE_USED
        diff = {"remaining": totp_service.remaining_backup_codes(db, user=user)}

    if not success:
        username_limiter.record_failure(user.username.lower())
        record(
            db,
            user_id=user.id,
            action=AuditAction.TOTP_FAILED,
            entity_type=AuditEntityType.USER,
            entity_id=user.id,
            ip_address=ip,
        )
        db.commit()
        raise ProblemError(status_code=401, title="Invalid TOTP code")

    totp_service.consume_pending_challenge(db, challenge=challenge)
    # Login final erfolgreich: Username-Bucket leeren, sodass die Failure-Counter
    # vom 1FA-Step nicht in eine spätere Sperre umschlagen.
    username_limiter.record_success(user.username.lower())
    user_agent = request.headers.get("user-agent")
    _session, token = auth_service.issue_session(
        db, user=user, user_agent=user_agent, ip_address=ip
    )
    if audit_action == AuditAction.BACKUP_CODE_USED:
        record(
            db,
            user_id=user.id,
            action=audit_action,
            entity_type=AuditEntityType.USER,
            entity_id=user.id,
            diff=diff,
            ip_address=ip,
        )
    db.commit()
    db.refresh(user)
    _set_session_cookie(response, token)
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


# ---------------------------------------------------------------------------
# 2FA-Self-Service-Endpoints
# ---------------------------------------------------------------------------


@router.get("/2fa/status", response_model=TotpStatusResponse)
def totp_status(db: DbDep, user: CurrentUser) -> TotpStatusResponse:
    return TotpStatusResponse(
        enabled=user.totp_enabled,
        backup_codes_remaining=totp_service.remaining_backup_codes(db, user=user),
    )


@router.post("/2fa/setup", response_model=TotpSetupResponse)
def totp_setup(db: DbDep, user: CurrentUser) -> TotpSetupResponse:
    """Erzeugt ein neues, **nicht aktiviertes** Secret und gibt QR + URI zurück.

    Das Secret wird sofort an ``user.totp_secret`` geschrieben (so muss
    der Frontend nichts speichern), aber ``totp_enabled`` bleibt False —
    erst ``/2fa/activate`` mit gültigem Code aktiviert es.
    """
    if user.totp_enabled:
        raise ProblemError(
            status_code=400,
            title="TOTP already enabled",
            detail="Erst deaktivieren, dann neu einrichten.",
        )
    secret = totp_service.generate_secret()
    user.totp_secret = secret
    db.commit()
    uri = totp_service.provisioning_uri(secret=secret, username=user.username)
    return TotpSetupResponse(
        secret=secret,
        provisioning_uri=uri,
        qr_png_base64=totp_service.qr_png_base64(uri),
    )


@router.post("/2fa/activate", response_model=TotpActivateResponse)
def totp_activate(
    payload: TotpActivateRequest,
    request: Request,
    db: DbDep,
    user: CurrentUser,
) -> TotpActivateResponse:
    if user.totp_enabled:
        raise ProblemError(status_code=400, title="TOTP already enabled")
    if not user.totp_secret:
        raise ProblemError(
            status_code=400,
            title="No TOTP setup pending",
            detail="Vorher /2fa/setup aufrufen.",
        )
    if not totp_service.verify_totp(user.totp_secret, payload.code):
        raise ProblemError(status_code=400, title="Invalid TOTP code")
    user.totp_enabled = True
    backup_codes = totp_service.issue_backup_codes(db, user=user)
    record(
        db,
        user_id=user.id,
        action=AuditAction.TOTP_ENABLED,
        entity_type=AuditEntityType.USER,
        entity_id=user.id,
        ip_address=client_ip(request),
    )
    db.commit()
    return TotpActivateResponse(backup_codes=backup_codes)


@router.post("/2fa/disable", response_model=MeResponse)
def totp_disable(
    payload: TotpDisableRequest,
    request: Request,
    db: DbDep,
    user: CurrentUser,
) -> MeResponse:
    if not verify_password(payload.current_password, user.password_hash):
        raise ProblemError(status_code=400, title="Current password incorrect")
    if user.totp_enabled:
        # Bei aktivem 2FA verlangen wir zusätzlich einen gültigen Code (oder
        # einen Backup-Code) — verhindert Bypass durch entwendetes Cookie.
        if not payload.code:
            raise ProblemError(status_code=400, title="TOTP code required")
        secret = user.totp_secret
        ok = bool(secret) and totp_service.verify_totp(secret or "", payload.code)
        if not ok and not totp_service.consume_backup_code(db, user=user, code=payload.code):
            raise ProblemError(status_code=400, title="Invalid TOTP / backup code")

    user.totp_enabled = False
    user.totp_secret = None
    for bc in list(user.backup_codes):
        db.delete(bc)
    record(
        db,
        user_id=user.id,
        action=AuditAction.TOTP_DISABLED,
        entity_type=AuditEntityType.USER,
        entity_id=user.id,
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(user)
    return MeResponse.model_validate(user)


@router.post("/2fa/backup-codes/regenerate", response_model=BackupCodesResponse)
def regenerate_backup_codes(
    db: DbDep,
    user: CurrentUser,
) -> BackupCodesResponse:
    if not user.totp_enabled:
        raise ProblemError(status_code=400, title="TOTP not enabled")
    codes = totp_service.issue_backup_codes(db, user=user)
    db.commit()
    return BackupCodesResponse(backup_codes=codes)
