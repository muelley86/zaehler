"""MainLocation — uebergeordnete logische Klammer ueber Zaehlerstandorten.

Modelliert eine Liegenschaft / Gebaeude-Gruppe (z. B. „Hauptgebaeude",
„Werkstatt"). Mehrere ``Location``-Eintraege (im UI: „Zaehlerstandorte")
koennen auf einen ``MainLocation`` zeigen.

Beim Loeschen eines MainLocation wird der FK an Location auf NULL gesetzt
(Cascade ``SET NULL`` in der Migration), Zaehlerstandorte bleiben erhalten.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:  # pragma: no cover
    from meters.models.location import Location


class MainLocation(Base, TimestampMixin):
    __tablename__ = "main_location"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))

    locations: Mapped[list[Location]] = relationship(
        back_populates="main_location",
        # Loeschen geht nur ueber den FK in Location (SET NULL), kein
        # Cascade-Delete vom Parent — Zaehlerstandorte sollen ueberleben.
        passive_deletes=True,
    )
