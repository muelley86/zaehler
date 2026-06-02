"""ReadingPhoto — ein Foto zu einer Erfassung (bis zu 6 je Reading).

Frueher lag genau ein Foto direkt am ``Reading`` (Spalten ``photo_path`` etc.).
Seit der 1->N-Umstellung haengen die Fotos als eigene Zeilen hier; ``sort_index``
haelt die Anzeige-Reihenfolge (0..5). GPS kommt wie zuvor aus dem EXIF und wird
beim Upload einmalig extrahiert.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:
    from meters.models.reading import Reading


class ReadingPhoto(Base, TimestampMixin):
    __tablename__ = "reading_photo"
    __table_args__ = (UniqueConstraint("reading_id", "sort_index", name="uq_reading_photo_sort"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    reading_id: Mapped[int] = mapped_column(
        ForeignKey("reading.id", ondelete="CASCADE"), nullable=False, index=True
    )
    photo_path: Mapped[str] = mapped_column(String(255), nullable=False)
    photo_lat: Mapped[float | None] = mapped_column(nullable=True)
    photo_lon: Mapped[float | None] = mapped_column(nullable=True)
    sort_index: Mapped[int] = mapped_column(nullable=False, default=0)

    reading: Mapped[Reading] = relationship("Reading", back_populates="photos")
