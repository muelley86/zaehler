"""Benutzer-Verwaltung (admin-only).

Anlegen, Auflisten, Aktualisieren (Rolle/E-Mail/Aktiv-Flag), Passwort-Reset
und Sessions widerrufen. Recorder-Konten haben keinen Zugriff auf diese
Endpunkte. Beim Anlegen wird ``force_password_change`` gesetzt — der neue
Benutzer muss beim ersten Login ein eigenes Passwort vergeben.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, status
from sqlalchemy import select

from meters.api.deps import AdminUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.core.security import hash_password
from meters.models import (
    AuditAction,
    AuditEntityType,
    MeasuringPoint,
    User,
    UserMeasuringPointAccess,
    UserRole,
)
from meters.schemas import (
    PasswordResetRequest,
    PasswordResetResponse,
    UserAccessRead,
    UserAccessUpdate,
    UserCreate,
    UserRead,
    UserUpdate,
)
from meters.services import auth as auth_service
from meters.services.audit import record

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
def list_users(db: DbDep, _admin: AdminUser) -> list[UserRead]:
    users = list(db.scalars(select(User).order_by(User.username)))
    return [UserRead.model_validate(u) for u in users]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> UserRead:
    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing is not None:
        raise ProblemError(status_code=409, title="Username already taken")

    user = User(
        username=payload.username,
        email=payload.email,
        role=payload.role,
        password_hash=hash_password(payload.initial_password),
        is_active=True,
        force_password_change=True,
        can_assign_qr_tokens=payload.can_assign_qr_tokens,
    )
    db.add(user)
    db.flush()
    record(
        db,
        user_id=admin.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.USER,
        entity_id=user.id,
        diff={"username": payload.username, "role": payload.role.value},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(user)
    return UserRead.model_validate(user)


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> UserRead:
    user = db.get(User, user_id)
    if user is None:
        raise ProblemError(status_code=404, title="User not found")

    diff: dict[str, object] = {}
    if payload.email is not None and payload.email != user.email:
        diff["email"] = {"from": user.email, "to": payload.email}
        user.email = payload.email
    if payload.role is not None and payload.role is not user.role:
        diff["role"] = {"from": user.role.value, "to": payload.role.value}
        user.role = payload.role
    if payload.is_active is not None and payload.is_active != user.is_active:
        diff["is_active"] = {"from": user.is_active, "to": payload.is_active}
        user.is_active = payload.is_active
    if (
        payload.can_assign_qr_tokens is not None
        and payload.can_assign_qr_tokens != user.can_assign_qr_tokens
    ):
        diff["can_assign_qr_tokens"] = {
            "from": user.can_assign_qr_tokens,
            "to": payload.can_assign_qr_tokens,
        }
        user.can_assign_qr_tokens = payload.can_assign_qr_tokens

    if diff:
        record(
            db,
            user_id=admin.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.USER,
            entity_id=user.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    db.commit()
    db.refresh(user)
    return UserRead.model_validate(user)


@router.post("/{user_id}/reset-password", response_model=PasswordResetResponse)
def reset_password(
    user_id: int,
    payload: PasswordResetRequest,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> PasswordResetResponse:
    user = db.get(User, user_id)
    if user is None:
        raise ProblemError(status_code=404, title="User not found")
    user.password_hash = hash_password(payload.new_password)
    user.force_password_change = True
    auth_service.revoke_all_for_user(db, user_id=user.id, ip_address=client_ip(request))
    record(
        db,
        user_id=admin.id,
        action=AuditAction.PASSWORD_RESET,
        entity_type=AuditEntityType.USER,
        entity_id=user.id,
        diff={"reset_by_admin": True},
        ip_address=client_ip(request),
    )
    db.commit()
    return PasswordResetResponse(user_id=user.id)


@router.post("/{user_id}/sessions/revoke", status_code=204)
def revoke_sessions(
    user_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise ProblemError(status_code=404, title="User not found")
    auth_service.revoke_all_for_user(db, user_id=user.id, ip_address=client_ip(request))
    record(
        db,
        user_id=admin.id,
        action=AuditAction.LOGOUT,
        entity_type=AuditEntityType.USER,
        entity_id=user.id,
        diff={"forced": True},
        ip_address=client_ip(request),
    )
    db.commit()


# ---------------------------------------------------------------------------
# Per-Recorder MP-Zugriff (Feature B)
# ---------------------------------------------------------------------------


@router.get("/{user_id}/measuring-points", response_model=UserAccessRead)
def get_user_access(
    user_id: int,
    db: DbDep,
    _admin: AdminUser,
) -> UserAccessRead:
    """Listet die MP-IDs auf, auf die der User Zugriff hat.

    Für Admin-User wird die komplette MP-Liste zurückgegeben (impliziter
    Vollzugriff). Für Recorder kommen die expliziten Grants.
    """
    user = db.get(User, user_id)
    if user is None:
        raise ProblemError(status_code=404, title="User not found")
    if user.role is UserRole.ADMIN:
        ids = list(db.scalars(select(MeasuringPoint.id).order_by(MeasuringPoint.id)))
    else:
        ids = list(
            db.scalars(
                select(UserMeasuringPointAccess.measuring_point_id)
                .where(UserMeasuringPointAccess.user_id == user_id)
                .order_by(UserMeasuringPointAccess.measuring_point_id)
            )
        )
    return UserAccessRead(user_id=user_id, measuring_point_ids=ids)


@router.put("/{user_id}/measuring-points", response_model=UserAccessRead)
def set_user_access(
    user_id: int,
    payload: UserAccessUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> UserAccessRead:
    """Ersetzt die Access-Liste des Users durch das übergebene Set.

    Idempotent: Server berechnet Diff zur aktuellen Menge, fügt fehlende
    Einträge hinzu, entfernt nicht mehr enthaltene und schreibt für jede
    Veränderung einen Audit-Eintrag.

    Lehnt 422 ab, wenn:
    - der Ziel-User nicht existiert,
    - der Ziel-User Admin ist (für Admins ist die Tabelle bedeutungslos),
    - eine der angegebenen MP-IDs nicht existiert.
    """
    user = db.get(User, user_id)
    if user is None:
        raise ProblemError(status_code=404, title="User not found")
    if user.role is UserRole.ADMIN:
        raise ProblemError(
            status_code=422,
            title="Cannot grant access to admin",
            detail=(
                "Admin-Benutzer haben automatisch Zugriff auf alle Messstellen — "
                "explizite Zuweisungen sind nicht zulässig."
            ),
        )

    requested = set(payload.measuring_point_ids)

    # Existenz aller MPs prüfen, bevor wir etwas ändern.
    if requested:
        existing_ids = set(
            db.scalars(
                select(MeasuringPoint.id).where(MeasuringPoint.id.in_(requested))
            )
        )
        unknown = sorted(requested - existing_ids)
        if unknown:
            raise ProblemError(
                status_code=422,
                title="Unknown measuring point ids",
                detail=f"Folgende Messstellen existieren nicht: {unknown}",
                extra={"unknown_ids": unknown},
            )

    current = set(
        db.scalars(
            select(UserMeasuringPointAccess.measuring_point_id).where(
                UserMeasuringPointAccess.user_id == user_id
            )
        )
    )
    to_add = sorted(requested - current)
    to_remove = sorted(current - requested)

    ip = client_ip(request)
    for mp_id in to_add:
        db.add(
            UserMeasuringPointAccess(
                user_id=user_id,
                measuring_point_id=mp_id,
                granted_by_user_id=admin.id,
            )
        )
        record(
            db,
            user_id=admin.id,
            action=AuditAction.ACCESS_GRANTED,
            entity_type=AuditEntityType.USER,
            entity_id=user_id,
            diff={"measuring_point_id": mp_id},
            ip_address=ip,
        )
    if to_remove:
        db.query(UserMeasuringPointAccess).filter(
            UserMeasuringPointAccess.user_id == user_id,
            UserMeasuringPointAccess.measuring_point_id.in_(to_remove),
        ).delete(synchronize_session=False)
        for mp_id in to_remove:
            record(
                db,
                user_id=admin.id,
                action=AuditAction.ACCESS_REVOKED,
                entity_type=AuditEntityType.USER,
                entity_id=user_id,
                diff={"measuring_point_id": mp_id},
                ip_address=ip,
            )
    db.commit()

    return UserAccessRead(user_id=user_id, measuring_point_ids=sorted(requested))
