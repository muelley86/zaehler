"""SQLAlchemy-Bootstrap: Engine, Session-Factory und Basis-Klassen.

Setzt beim ersten Verbindungsaufbau die SQLite-Pragmas (WAL-Modus für parallele
Schreibvorgänge, FK-Enforcement) und stellt ``get_session`` als FastAPI-
Dependency bereit. ``Base`` und ``TimestampMixin`` werden von allen Models
verwendet.
"""

from __future__ import annotations

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
    finally:
        cursor.close()


def get_session() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


__all__ = ["Base", "SessionLocal", "TimestampMixin", "engine", "get_session"]
