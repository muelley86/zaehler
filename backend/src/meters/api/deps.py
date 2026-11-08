"""FastAPI-Dependencies, die in mehreren Routen wiederverwendet werden.

``get_current_user`` wertet das Session-Cookie aus und schlägt nach dem User
in der DB. ``require_admin`` setzt obendrauf die Rollenprüfung. ``client_ip``
liest ``X-Forwarded-For`` **nur**, wenn ``settings.trust_proxy=True`` —
sonst kann jeder Client den Header fälschen und damit den Rate-Limiter
umgehen sowie das Audit-Log mit beliebigen IPs füttern.
"""

from __future__ import annotations

import ipaddress
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

# Endpoints, die ein Admin mit erzwungener — aber noch nicht eingerichteter —
# 2FA aufrufen darf, damit er TOTP überhaupt aktivieren kann. Alles andere →
# 403 mit ``require_totp_setup`` (Frontend leitet zur Einrichtung um).
_ALLOWED_PATHS_DURING_TOTP_SETUP = (
    "/api/v1/auth/me",
    "/api/v1/auth/logout",
    "/api/v1/auth/2fa/status",
    "/api/v1/auth/2fa/setup",
    "/api/v1/auth/2fa/activate",
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
    if (
        settings.require_totp_for_admin
        and user.role is UserRole.ADMIN
        and not user.totp_enabled
        and request.url.path not in _ALLOWED_PATHS_DURING_TOTP_SETUP
    ):
        raise ProblemError(
            status_code=403,
            title="2FA setup required",
            detail="Als Admin musst du zuerst die Zwei-Faktor-Authentisierung einrichten.",
            extra={"require_totp_setup": True},
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


def require_billing(user: CurrentUser) -> User:
    """Abrechnungsmodul: Admin oder Benutzer mit dem Merkmal ``can_billing``.

    Die kaufmaennische Abteilung soll abrechnen koennen, ohne Vollzugriff auf die Verwaltung zu
    haben; Erfasser ohne das Merkmal sehen das Modul nicht.
    """
    if user.role is not UserRole.ADMIN and not user.can_billing:
        raise ProblemError(
            status_code=403,
            title="Forbidden",
            detail="Diese Aktion erfordert die Berechtigung fuer die Abrechnung.",
        )
    return user


BillingUser = Annotated[User, Depends(require_billing)]


def client_ip(request: Request) -> str | None:
    """Tatsächliche Client-IP — bei METERS_TRUST_PROXY aus X-Forwarded-For,
    sonst aus der direkten Verbindung.

    Der Header wird gegen ``ipaddress.ip_address`` validiert. Damit landen
    fehlerhaft konfigurierte Proxies oder manipulierte Header nicht im
    Audit-Log oder den Rate-Limit-Buckets.

    Ausgewertet wird das rechteste Element, das kein vertrauenswürdiger Proxy
    ist (s. ``_rightmost_untrusted_hop``) — nicht das linke, das bei
    anhängenden Proxies vom Client stammt.

    Optionales Proxy-Pinning: ist ``METERS_TRUSTED_PROXY_IPS`` gesetzt, wird
    ``X-Forwarded-For`` NUR ausgewertet, wenn die unmittelbare Verbindungs-IP
    in dieser Allowlist steht. So kann ein Angreifer, der die App (z. B. im
    ``proxy-other``-Modus) auch direkt erreicht, den Header nicht faelschen.
    Leere Allowlist = bisheriges Verhalten.
    """
    direct = request.client.host if request.client else None
    if settings.trust_proxy:
        pinned_ok = (not settings.trusted_proxy_ips) or (
            direct is not None and direct in settings.trusted_proxy_ips
        )
        if pinned_ok:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                candidate = _rightmost_untrusted_hop(forwarded)
                if candidate is not None:
                    return candidate
    return direct


def _rightmost_untrusted_hop(forwarded: str) -> str | None:
    """Rechtestes ``X-Forwarded-For``-Element, das kein vertrauenswürdiger
    Proxy ist.

    Reverse-Proxies HÄNGEN die Verbindungs-IP an einen vom Client
    mitgeschickten Header an (nginx/NPM ``$proxy_add_x_forwarded_for``) —
    alles links davon kann der Client frei wählen. Ein ersetzender Proxy
    (``$remote_addr``) liefert genau ein Element; das Ergebnis ist dasselbe.
    Ungültiges Element → ``None`` (Fallback auf die direkte IP).
    """
    for hop in reversed(forwarded.split(",")):
        candidate = hop.strip()
        try:
            ipaddress.ip_address(candidate)
        except ValueError:
            return None
        if candidate not in settings.trusted_proxy_ips:
            return candidate
    return None
