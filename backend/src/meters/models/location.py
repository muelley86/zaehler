"""Location — zentral gepflegter Standort-Stammdatensatz.

MeasuringPoints referenzieren Locations per FK. Beim Löschen eines Standorts
wird die Referenz auf NULL gesetzt (siehe Migration 0002), die Messstelle
selbst bleibt erhalten.
"""

from __future__ import annotations

from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column

from meters.db import Base, TimestampMixin


class Location(Base, TimestampMixin):
    __tablename__ = "location"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    # Geo-Koordinaten — optional. Float reicht: GPS-Genauigkeit konsumiert
    # max. 6 Nachkommastellen (~10 cm), Float-32 deckt das ab.
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
