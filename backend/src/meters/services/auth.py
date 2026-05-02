"""Auth-Logik: Anmeldung, Sessions ausstellen/auflösen/widerrufen.

Sessions werden serverseitig in der DB gehalten; das Cookie enthält nur das
Token. ``resolve_session`` führt automatisch die rolling expiration durch —
bei jedem Aufruf läuft die Session-Frist neu an.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from meters.core.config import settings
from meters.core.problem import ProblemError
from meters.core.security import (
    generate_session_token,
    hash_session_token,
    verify_password,
)
from meters.models import AuditAction, AuditEntityType, Session, User
from meters.services.audit import record


def _utcnow() -> datetime:
    return datetime.now(UTC)


def authenticate(db: DbSession, *, username: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def issue_session(
    db: DbSession,
    *,
    user: User,
    user_agent: str | None,
    ip_address: str | None,
) -> tuple[Session, str]:
    token = generate_session_token()
    now = _utcnow()
    session = Session(
        user_id=user.id,
        token_hash=hash_session_token(token),
        expires_at=now + timedelta(days=settings.session_lifetime_days),
        last_seen_at=now,
        user_agent=user_agent[:255] if user_agent else None,
        ip_address=ip_address,
    )
    db.add(session)
    user.last_login_at = now
    record(
        db,
        user_id=user.id,
        action=AuditAction.LOGIN,
        entity_type=AuditEntityType.SESSION,
        entity_id=None,
        ip_address=ip_address,
    )
    db.flush()
    return session, token


def resolve_session(db: DbSession, *, token: str) -> tuple[User, Session] | None:
    session = db.scalar(select(Session).where(Session.token_hash == hash_session_token(token)))
    if session is None:
        return None
    now = _utcnow()
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= now:
        db.delete(session)
        return None
    user = session.user
    if not user.is_active:
        db.delete(session)
        return None
    # Sliding expiration
    session.last_seen_at = now
    session.expires_at = now + timedelta(days=settings.session_lifetime_days)
    return user, session


def revoke_session(db: DbSession, *, session: Session, ip_address: str | None) -> None:
    record(
        db,
        user_id=session.user_id,
        action=AuditAction.LOGOUT,
        entity_type=AuditEntityType.SESSION,
        entity_id=session.id,
        ip_address=ip_address,
    )
    db.delete(session)


def revoke_all_for_user(db: DbSession, *, user_id: int, ip_address: str | None) -> int:
    sessions = list(db.scalars(select(Session).where(Session.user_id == user_id)))
    for s in sessions:
        db.delete(s)
    record(
        db,
        user_id=user_id,
        action=AuditAction.LOGOUT,
        entity_type=AuditEntityType.SESSION,
        entity_id=None,
        diff={"revoked": len(sessions)},
        ip_address=ip_address,
    )
    return len(sessions)


def require_admin(user: User) -> None:
    from meters.models import UserRole

    if user.role is not UserRole.ADMIN:
        raise ProblemError(
            status_code=403,
            title="Forbidden",
            detail="Diese Aktion erfordert Admin-Rechte.",
        )
