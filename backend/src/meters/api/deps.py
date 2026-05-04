"""FastAPI-Dependencies, die in mehreren Routen wiederverwendet werden.

``get_current_user`` wertet das Session-Cookie aus und schlägt nach dem User
in der DB. ``require_admin`` setzt obendrauf die Rollenprüfung. ``client_ip``
liest ``X-Forwarded-For`` **nur**, wenn ``settings.trust_proxy=True`` —
sonst kann jeder Client den Header fälschen und damit den Rate-Limiter
umgehen sowie das Audit-Log mit beliebigen IPs füttern.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends, Request
from sqlalchemy.orm import Session as DbSession

from meters.core.config import settings
from meters.core.problem import ProblemError
from meters.core.security import SESSION_COOKIE_NAME
from meters.db import get_session
from meters.models import User, UserRole
from meters.services import auth as auth_service

DbDep = Annotated[DbSession, Depends(get_session)]


# Endpoints, die ein User mit ``force_password_change=True`` aufrufen darf,
# bevor er sein Passwort gewechselt hat. Alles andere wird mit 403 abgelehnt
# (CLAUDE.md: "beim ersten Login geändert werden muss").
_ALLOWED_PATHS_DURING_FORCE_PW_CHANGE = (
    "/api/v1/auth/me",
    "/api/v1/auth/change-password",
    "/api/v1/auth/logout",
)


def get_current_user(
    request: Request,
    db: DbDep,
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> User:
    if not session_token:
        raise ProblemError(status_code=401, title="Unauthorized")
    resolved = auth_service.resolve_session(db, token=session_token)
    if resolved is None:
        raise ProblemError(status_code=401, title="Unauthorized")
    user, _session = resolved
    request.state.session = _session
    if user.force_password_change and request.url.path not in _ALLOWED_PATHS_DURING_FORCE_PW_CHANGE:
        raise ProblemError(
            status_code=403,
            title="Password change required",
            detail="Bitte ändere zuerst dein Passwort unter /auth/change-password.",
            extra={"force_password_change": True},
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> User:
    if user.role is not UserRole.ADMIN:
        raise ProblemError(
            status_code=403,
            title="Forbidden",
            detail="Diese Aktion erfordert Admin-Rechte.",
        )
    return user


AdminUser = Annotated[User, Depends(require_admin)]


def client_ip(request: Request) -> str | None:
    if settings.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
