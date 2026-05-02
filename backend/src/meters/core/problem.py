"""RFC-7807 (problem+json) Fehler-Responses.

Routes raisen ``ProblemError(status_code=..., title=..., detail=...)`` und
bekommen damit eine konsistent strukturierte JSON-Antwort. ``install_problem_handlers``
fängt zusätzlich Standard-HTTP-Exceptions und Pydantic-Validierungsfehler ab,
damit auch die im gleichen Format ausgeliefert werden.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_MEDIA_TYPE = "application/problem+json"


class ProblemError(Exception):
    """Domain-Fehler, der als RFC-7807 Problem ausgegeben wird."""

    def __init__(
        self,
        *,
        status_code: int,
        title: str,
        detail: str | None = None,
        type_: str = "about:blank",
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(detail or title)
        self.status_code = status_code
        self.title = title
        self.detail = detail
        self.type = type_
        self.extra = extra or {}


def _problem_response(
    request: Request,
    *,
    status_code: int,
    title: str,
    detail: str | None = None,
    type_: str = "about:blank",
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    payload: dict[str, Any] = {
        "type": type_,
        "title": title,
        "status": status_code,
        "instance": str(request.url.path),
    }
    if detail:
        payload["detail"] = detail
    if extra:
        payload.update(extra)
    return JSONResponse(payload, status_code=status_code, media_type=PROBLEM_MEDIA_TYPE)


def install_problem_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemError)
    async def _problem_handler(request: Request, exc: ProblemError) -> JSONResponse:
        return _problem_response(
            request,
            status_code=exc.status_code,
            title=exc.title,
            detail=exc.detail,
            type_=exc.type,
            extra=exc.extra,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _problem_response(
            request,
            status_code=exc.status_code,
            title=exc.detail if isinstance(exc.detail, str) else "HTTP Error",
            detail=None if isinstance(exc.detail, str) else str(exc.detail),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return _problem_response(
            request,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            title="Validation failed",
            detail="Request body or parameters did not satisfy the schema.",
            extra={"errors": exc.errors()},
        )
