"""Reading — eine einzelne Zählerstand-Erfassung.

Pro Register beliebig viele Readings, eindeutig per ``reading_at``-Zeitstempel
(daher mehrere Erfassungen pro Tag möglich). Werte werden als String gespeichert
(``DecimalText``), um Float-Roundtrips bei SQLite zu vermeiden. ``created_at``
kommt aus ``TimestampMixin`` und ist UTC; ``reading_at`` ist die fachliche
Ablesezeit (vom User eingegeben, lokale Zeit).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin
from meters.db.types import DecimalText

if TYPE_CHECKING:
    from meters.models.register import Register
    from meters.models.user import User


class Reading(Base, TimestampMixin):
    __tablename__ = "reading"
    __table_args__ = (UniqueConstraint("register_id", "reading_at", name="uq_reading_register_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    register_id: Mapped[int] = mapped_column(
        ForeignKey("register.id", ondelete="CASCADE"), nullable=False, index=True
    )
    value: Mapped[Decimal] = mapped_column(DecimalText(32), nullable=False)
    reading_at: Mapped[datetime] = mapped_column(nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(String(500))
    photo_path: Mapped[str | None] = mapped_column(String(255))
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), index=True
    )

    register: Mapped[Register] = relationship("Register", back_populates="readings")
    created_by: Mapped[User | None] = relationship("User")
