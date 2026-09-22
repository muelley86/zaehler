"""Mieter — zentraler Mieter-Stammdatensatz.

Eine MP kann optional einem Mieter zugeordnet sein; die Mieter-Geschichte
einer MP ist in ``MieterAssignment``-Perioden modelliert. Mieter selbst
traegt nur die statischen Daten (Name, Adresse, Kontakt, Notiz).

Ein Mieter ist eine natuerliche Person oder eine Firma (``is_company``). Bei
Firmen steht der Firmenname in ``last_name`` und ``first_name`` ist immer
NULL — so bleiben ``display_name``, Sortierung und alle Namensanzeigen
(Historie, Abrechnungszeile) ohne Sonderfall.

Im Unterschied zum Eigentuemer ist die Zuordnung optional (eine MP muss
keinen Mieter haben) und es gibt keine Steuer-IDs.

Beim Loeschen eines Mieters wird die Referenz im MieterAssignment auf
NULL gesetzt (Cascade SET NULL) — die historischen Perioden bleiben
erhalten, der Name wird in der UI als „unbekannt" gezeigt.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:  # pragma: no cover
    from meters.models.mieter_assignment import MieterAssignment


class Mieter(Base, TimestampMixin):
    __tablename__ = "mieter"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Person: Vorname optional, Nachname Pflicht. Firma: Firmenname in
    # ``last_name``, ``first_name`` NULL (Schema/API erzwingen das).
    # Kein UNIQUE — Namensgleichheit (zwei „Thomas Mueller") ist real erlaubt.
    is_company: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    first_name: Mapped[str | None] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    address_street: Mapped[str | None] = mapped_column(String(200))
    address_postcode: Mapped[str | None] = mapped_column(String(20))
    address_city: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(64))
    note: Mapped[str | None] = mapped_column(String(500))

    assignments: Mapped[list[MieterAssignment]] = relationship(
        back_populates="mieter",
        passive_deletes=True,
    )

    @property
    def display_name(self) -> str:
        """Anzeigeform „Nachname, Vorname" (ohne Vorname nur Nachname).
        Einzige Quelle fuer Listen, Dropdowns und die Mieter-Historie."""
        return f"{self.last_name}, {self.first_name}" if self.first_name else self.last_name
