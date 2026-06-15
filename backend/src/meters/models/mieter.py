"""Mieter — zentraler Mieter-Stammdatensatz.

Eine MP kann optional einem Mieter zugeordnet sein; die Mieter-Geschichte
einer MP ist in ``MieterAssignment``-Perioden modelliert. Mieter selbst
traegt nur die statischen Daten (Name, Adresse, Kontakt, Notiz).

Im Unterschied zum Eigentuemer ist die Zuordnung optional (eine MP muss
keinen Mieter haben) und es gibt keine Steuer-IDs.

Beim Loeschen eines Mieters wird die Referenz im MieterAssignment auf
NULL gesetzt (Cascade SET NULL) — die historischen Perioden bleiben
erhalten, der Name wird in der UI als „unbekannt" gezeigt.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:  # pragma: no cover
    from meters.models.mieter_assignment import MieterAssignment


class Mieter(Base, TimestampMixin):
    __tablename__ = "mieter"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
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
