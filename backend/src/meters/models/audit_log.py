"""AuditLog — protokolliert sämtliche Schreib-Operationen am Datenbestand.

Jeder erfolgreiche Create/Update/Delete (durch User oder System) erzeugt
einen Eintrag mit JSON-Diff. Lesezugriffe werden NICHT protokolliert.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from meters.db import Base, TimestampMixin
from meters.models._enums import AuditAction, AuditEntityType


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_log"
    # Index auf created_at — die Listenansicht sortiert nach created_at
    # DESC LIMIT 200, ohne Index waere das ein Volltabellenscan.
    __table_args__ = (Index("ix_audit_log_created_at", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[AuditAction] = mapped_column(
        SAEnum(AuditAction, name="audit_action", native_enum=False, length=32),
        nullable=False,
    )
    entity_type: Mapped[AuditEntityType] = mapped_column(
        SAEnum(AuditEntityType, name="audit_entity_type", native_enum=False, length=32),
        nullable=False,
    )
    entity_id: Mapped[int | None] = mapped_column(Integer, index=True)
    diff: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    ip_address: Mapped[str | None] = mapped_column(String(45))
