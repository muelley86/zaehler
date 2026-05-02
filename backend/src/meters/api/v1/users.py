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
from meters.models import AuditAction, AuditEntityType, User
from meters.schemas import (
    PasswordResetRequest,
    PasswordResetResponse,
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
