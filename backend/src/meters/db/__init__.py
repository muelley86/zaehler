"""SQLAlchemy-Bootstrap: Engine, Session-Factory und Basis-Klassen.

Setzt beim ersten Verbindungsaufbau die SQLite-Pragmas (WAL-Modus für parallele
Schreibvorgänge, FK-Enforcement) und stellt ``get_session`` als FastAPI-
Dependency bereit. ``Base`` und ``TimestampMixin`` werden von allen Models
verwendet.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    sessionmaker,
)

from meters.core.config import settings

# Schwellwert in Sekunden, ab dem eine Query als "langsam" geloggt wird.
# 100 ms ist für ein lokales SQLite ein guter Indikator für problematische
# Queries (fehlender Index, N+1, Volltabellenscan auf großer Tabelle).
_SLOW_QUERY_THRESHOLD_S = 0.1
_logger = logging.getLogger("meters.db.slow_query")


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(default=_utcnow, nullable=False)


def _make_engine() -> Engine:
    connect_args: dict[str, Any] = {}
    if settings.database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    return create_engine(
        settings.database_url,
        connect_args=connect_args,
        future=True,
    )


engine: Engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


@event.listens_for(Engine, "connect")
def _set_sqlite_pragmas(dbapi_connection: Any, _: Any) -> None:
    """WAL-Modus + FK-Enforcement bei jeder neuen SQLite-Verbindung."""
    if not settings.database_url.startswith("sqlite"):
        return
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA synchronous=NORMAL")
        # Negative Werte = KiB statt Pages. -64000 = 64 MB Page-Cache;
        # bei 4-KB-Pages also ca. 16 000 Pages. Spürbar bei wiederholten
        # Lookups (Session-Validation, Reading-Listen) ohne nennenswerten
        # Speicherbedarf für einen Privathaushalt-Container.
        cursor.execute("PRAGMA cache_size=-64000")
    finally:
        cursor.close()


@event.listens_for(Engine, "before_cursor_execute")
def _record_query_start(
    _conn: Any,
    _cursor: Any,
    _statement: str,
    _parameters: Any,
    context: Any,
    _executemany: bool,
) -> None:
    """Startzeit pro Query merken, damit der After-Hook die Dauer messen kann."""
    context._meters_query_start = time.perf_counter()


@event.listens_for(Engine, "after_cursor_execute")
def _log_slow_query(
    _conn: Any,
    _cursor: Any,
    statement: str,
    parameters: Any,
    context: Any,
    _executemany: bool,
) -> None:
    """Queries über dem Schwellwert mit WARN loggen.

    Reine Diagnose-Hilfe ohne Auswirkung auf den Hot-Path: ``time.perf_counter``
    ist effektiv kostenlos. Mehrzeilige Statements werden auf eine Zeile
    reduziert, damit das Log-Format pro Eintrag eine Zeile bleibt.
    """
    started: float | None = getattr(context, "_meters_query_start", None)
    if started is None:
        return
    duration = time.perf_counter() - started
    if duration < _SLOW_QUERY_THRESHOLD_S:
        return
    one_line = " ".join(statement.split())
    if len(one_line) > 200:
        one_line = one_line[:197] + "..."
    _logger.warning(
        "slow query duration=%.3fs statement=%s params=%s",
        duration,
        one_line,
        parameters,
    )


def get_session() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


__all__ = ["Base", "SessionLocal", "TimestampMixin", "engine", "get_session"]
