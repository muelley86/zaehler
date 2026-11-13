"""Request-Body-Limit vor Auth und Parsing.

FastAPI/Starlette liest Multipart-Uploads und JSON-Bodies vollständig ein
(Multipart in einen Spool auf Platte, JSON in den RAM), BEVOR die
Auth-Dependency der Route läuft. Ohne eigenes Limit könnte damit jeder
Netz-Client — auch ohne Login — Platte und RAM des einzigen App-Prozesses
belegen (Security-Audit #7).

Diese reine ASGI-Middleware setzt deshalb ein Limit, bevor ein Byte gelesen
wird:

- Ohne gültige Session: höchstens ``ANONYMOUS_MAX_BODY_BYTES`` (Login und
  2FA-Verify sind wenige hundert Byte). Größere Bodies beantwortet die
  Middleware mit 401 statt 413 — der eigentliche Grund ist die fehlende
  Anmeldung (abgelaufene Sitzung beim Restore-Upload), nicht die Größe. Nur
  die Auth-Endpunkte selbst melden 413, dort ist "nicht angemeldet" normal.
- Mit gültiger Session: ``settings.request_max_body_bytes``, für den
  Restore-Upload ``settings.backup_max_upload_bytes``.

``Content-Length`` über dem Limit wird sofort abgelehnt. Bodies ohne
``Content-Length`` (chunked) werden beim Lesen mitgezählt und beim
Überschreiten abgebrochen. Die Session wird nur geprüft, wenn der Body
das anonyme Limit überschreiten kann — kleine Requests kosten keine
zusätzliche DB-Abfrage.
"""

from __future__ import annotations

import json

from starlette.concurrency import run_in_threadpool
from starlette.requests import HTTPConnection
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from meters.core.config import settings
from meters.core.problem import PROBLEM_MEDIA_TYPE
from meters.core.security import SESSION_COOKIE_NAME

ANONYMOUS_MAX_BODY_BYTES = 64 * 1024

_RESTORE_UPLOAD_PATH = "/api/v1/restore/upload"
_AUTH_PATH_PREFIX = "/api/v1/auth/"
_BODY_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class _BodyTooLargeError(Exception):
    pass


def _session_is_valid(token: str) -> bool:
    # Import hier, damit core/ beim Import nicht von services/ und db/ abhängt.
    from meters.db import SessionLocal
    from meters.services.auth import has_valid_session

    with SessionLocal() as db:
        return has_valid_session(db, token=token)


# Spielraum für Multipart-Rahmen und Formularfelder neben der Fotodatei.
_MULTIPART_OVERHEAD_BYTES = 1024 * 1024


def _authenticated_limit(path: str) -> int:
    if path == _RESTORE_UPLOAD_PATH:
        return settings.backup_max_upload_bytes
    # Ein per Installer erhöhtes Foto-Limit darf nicht am Body-Limit scheitern.
    return max(
        settings.request_max_body_bytes,
        settings.photo_max_upload_bytes + _MULTIPART_OVERHEAD_BYTES,
    )


async def _send_problem(send: Send, *, status: int, title: str, detail: str) -> None:
    body = json.dumps(
        {"type": "about:blank", "title": title, "status": status, "detail": detail},
        ensure_ascii=False,
    ).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", PROBLEM_MEDIA_TYPE.encode()),
                (b"content-length", str(len(body)).encode()),
                (b"connection", b"close"),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


async def _send_too_large(send: Send, limit: int) -> None:
    await _send_problem(
        send,
        status=413,
        title="Request too large",
        detail=f"Anfrage überschreitet das Limit von {limit // 1024} KiB.",
    )


async def _send_unauthorized(send: Send) -> None:
    await _send_problem(
        send,
        status=401,
        title="Unauthorized",
        detail="Nicht angemeldet oder Sitzung abgelaufen. Bitte neu anmelden.",
    )


async def _reject(send: Send, *, limit: int, unauthorized: bool) -> None:
    if unauthorized:
        await _send_unauthorized(send)
    else:
        await _send_too_large(send, limit)


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] not in _BODY_METHODS
            or not scope["path"].startswith("/api/")
        ):
            await self.app(scope, receive, send)
            return

        conn = HTTPConnection(scope)
        content_length = _parse_content_length(conn.headers.get("content-length"))
        if content_length is None and "transfer-encoding" not in conn.headers:
            # Weder Content-Length noch chunked → kein Body (RFC 9112 §6.3).
            await self.app(scope, receive, send)
            return

        path: str = scope["path"]
        limit = ANONYMOUS_MAX_BODY_BYTES
        authenticated = False
        if content_length is None or content_length > limit:
            token = conn.cookies.get(SESSION_COOKIE_NAME)
            if token:
                authenticated = await run_in_threadpool(_session_is_valid, token)
                if authenticated:
                    limit = _authenticated_limit(path)
        # Ohne Sitzung ist "zu groß" die falsche Auskunft — außer beim Login selbst.
        unauthorized = not authenticated and not path.startswith(_AUTH_PATH_PREFIX)
        if content_length is not None and content_length > limit:
            await _reject(send, limit=limit, unauthorized=unauthorized)
            return

        await self._call_counting(scope, receive, send, limit=limit, unauthorized=unauthorized)

    async def _call_counting(
        self, scope: Scope, receive: Receive, send: Send, *, limit: int, unauthorized: bool
    ) -> None:
        received = 0
        exceeded = False
        response_started = False

        async def counting_receive() -> Message:
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    exceeded = True
                    raise _BodyTooLargeError
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal response_started
            # Hat die App den Lese-Abbruch selbst in eine Antwort (400/500)
            # verwandelt, ersetzen wir sie durch das eigentliche 413.
            if exceeded:
                return
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, guarded_send)
        except _BodyTooLargeError:
            pass
        except Exception:
            if not exceeded:
                raise
        if exceeded and not response_started:
            await _reject(send, limit=limit, unauthorized=unauthorized)


def _parse_content_length(raw: str | None) -> int | None:
    if raw is None:
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value >= 0 else None
