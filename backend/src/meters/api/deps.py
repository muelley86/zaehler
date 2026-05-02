"""FastAPI-Dependencies, die in mehreren Routen wiederverwendet werden.

``get_current_user`` wertet das Session-Cookie aus und schlägt nach dem User
in der DB. ``require_admin`` setzt obendrauf die Rollenprüfung. ``client_ip``
ermittelt die echte Client-IP unter Berücksichtigung von X-Forwarded-For
(wichtig hinter dem Reverse-Proxy).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends, Request
from sqlalchemy.orm import Session as DbSession

from meters.core.problem import ProblemError
from meters.core.security import SESSION_COOKIE_NAME
from meters.db import get_session
from meters.models import User, UserRole
from meters.services import auth as auth_service

DbDep = Annotated[DbSession, Depends(get_session)]


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
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
