"""HTTP-Middleware für Defense-in-Depth-Header und CSRF-Origin-Check.

* :func:`install_security_headers` setzt eine konservative Default-Policy
  (CSP, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, optional
  HSTS bei aktivem ``cookie_secure``).
* :func:`install_origin_check` lehnt mutating Requests ab, wenn der
  Origin-Header gesetzt ist und weder same-host noch in
  ``settings.allowed_origins`` enthalten ist — Defense-in-Depth zu
  ``SameSite=strict``.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from urllib.parse import urlparse

from fastapi import FastAPI
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from meters.core.config import settings

CallNext = Callable[[Request], Awaitable[Response]]

_MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

_PERMISSIONS_POLICY = (
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
    "magnetometer=(), microphone=(), payment=(), usb=()"
)


def _csp() -> str:
    # Self-hosted Fonts/Assets, ein Inline-Theme-Bootstrap-Skript wird über
    # das ``script-src 'unsafe-inline'``-Token erlaubt; ``style-src
    # 'unsafe-inline'`` wegen React-inline-style-Props (Glow-Hintergründe).
    parts = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        # OSM-Tiles für die Standort-Karte (LocationMap). Browser lädt
        # Tile-PNGs direkt von tile.openstreetmap.org, keine API von uns.
        "img-src 'self' data: https://*.tile.openstreetmap.org",
        "font-src 'self' data:",
        "connect-src 'self' https://*.tile.openstreetmap.org",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
    ]
    return "; ".join(parts)


def install_security_headers(app: FastAPI) -> None:
    @app.middleware("http")
    async def security_headers(request: Request, call_next: CallNext) -> Response:
        response = await call_next(request)
        response.headers.setdefault("Content-Security-Policy", _csp())
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Permissions-Policy", _PERMISSIONS_POLICY)
        if settings.cookie_secure:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


def install_origin_check(app: FastAPI) -> None:
    @app.middleware("http")
    async def origin_check(request: Request, call_next: CallNext) -> Response:
        if request.method in _MUTATING_METHODS and request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin and not _origin_allowed(origin, request):
                return JSONResponse(
                    status_code=403,
                    content={
                        "type": "about:blank",
                        "title": "Forbidden origin",
                        "status": 403,
                        "detail": "Origin nicht erlaubt für mutating Request.",
                    },
                    media_type="application/problem+json",
                )
        return await call_next(request)


def _origin_allowed(origin: str, request: Request) -> bool:
    try:
        parsed = urlparse(origin)
    except ValueError:
        return False
    if not parsed.netloc:
        return False
    request_host = request.headers.get("host")
    if request_host and parsed.netloc == request_host:
        return True
    return origin in settings.allowed_origins
