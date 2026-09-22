"""MeasuringPointNote — Freitext-Notiz zu einer Messstelle.

Mehrere Notizen je Messstelle; jede haelt fest, wer sie wann angelegt hat.
Notizen werden nicht bearbeitet, nur geloescht (Ersteller oder Admin) — so
bleibt nachvollziehbar, was wer notiert hat.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:
    from meters.models.measuring_point import MeasuringPoint
    from meters.models.user import User

NOTE_MAX_LENGTH = 500


class MeasuringPointNote(Base, TimestampMixin):
    __tablename__ = "measuring_point_note"

    id: Mapped[int] = mapped_column(primary_key=True)
    measuring_point_id: Mapped[int] = mapped_column(
        ForeignKey("measuring_point.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(String(NOTE_MAX_LENGTH), nullable=False)
    # NOT NULL + SET NULL = effektives RESTRICT (siehe Reading-Model): ein User
    # mit Notizen kann nicht geloescht werden, nur deaktiviert.
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=False, index=True
    )

    measuring_point: Mapped[MeasuringPoint] = relationship("MeasuringPoint", back_populates="notes")
    created_by: Mapped[User] = relationship("User")
