"""Location — zentral gepflegter Standort-Stammdatensatz.

MeasuringPoints referenzieren Locations per FK. Beim Löschen eines Standorts
wird die Referenz auf NULL gesetzt (siehe Migration 0002), die Messstelle
selbst bleibt erhalten.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:  # pragma: no cover
    from meters.models.main_location import MainLocation


class Location(Base, TimestampMixin):
    __tablename__ = "location"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    # Geo-Koordinaten — optional. Float reicht: GPS-Genauigkeit konsumiert
    # max. 6 Nachkommastellen (~10 cm), Float-32 deckt das ab.
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    # Optionaler Hauptstandort — uebergeordnete Klammer (z. B. „Hauptgebaeude").
    # Cascade SET NULL: wenn der Hauptstandort geloescht wird, behalten wir den
    # Zaehlerstandort und setzen die Referenz auf NULL.
    main_location_id: Mapped[int | None] = mapped_column(
        ForeignKey("main_location.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # ``lazy="joined"`` — bei den seltenen List-/Detail-Calls ist N+1 sonst sicht-
    # bar (jeder Standort braucht den Namen seines Hauptstandorts fuer die UI).
    main_location: Mapped[MainLocation | None] = relationship(
        back_populates="locations",
        lazy="joined",
    )
