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
    from meters.models.reading_photo import ReadingPhoto
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
    # Fotos liegen seit der 1->N-Umstellung in ``reading_photo`` (bis zu 6 je
    # Erfassung). Die fruehere Einzel-Spalte ``photo_path``/``photo_lat``/
    # ``photo_lon`` bleibt in der DB bestehen (nicht mehr gemappt), wird aber
    # nicht mehr beschrieben — Bereinigung in einer spaeteren Migration.
    # NOT NULL erzwingt CLAUDE.md-Invariante "wird IMMER gesetzt".
    # ondelete=SET NULL kombiniert mit NOT NULL ist effektives RESTRICT:
    # ein User-Hard-Delete scheitert, solange noch Readings dranhängen.
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=False, index=True
    )

    register: Mapped[Register] = relationship("Register", back_populates="readings")
    created_by: Mapped[User] = relationship("User")
    photos: Mapped[list[ReadingPhoto]] = relationship(
        "ReadingPhoto",
        back_populates="reading",
        cascade="all, delete-orphan",
        order_by="ReadingPhoto.sort_index",
    )
