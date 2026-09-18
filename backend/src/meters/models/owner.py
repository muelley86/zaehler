"""Owner — zentraler Eigentuemer-Stammdatensatz.

MPs gehoeren genau einem Eigentuemer zu jedem Zeitpunkt; die
Eigentuemer-Geschichte einer MP ist in ``OwnerAssignment``-Perioden
modelliert. Owner selbst traegt nur die statischen Daten (Name,
Adresse, Kontakt, Steuer-IDs).

Beim Loeschen eines Owners wird die Referenz im OwnerAssignment auf
NULL gesetzt (Cascade SET NULL in Migration 0022) — die historischen
Perioden bleiben erhalten, der Name wird in der UI als „unbekannt"
gezeigt.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:  # pragma: no cover
    from meters.models.owner_assignment import OwnerAssignment


class Owner(Base, TimestampMixin):
    __tablename__ = "owner"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    address_street: Mapped[str | None] = mapped_column(String(200))
    address_postcode: Mapped[str | None] = mapped_column(String(20))
    address_city: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(64))
    vat_id: Mapped[str | None] = mapped_column(String(32))
    tax_id: Mapped[str | None] = mapped_column(String(32))
    note: Mapped[str | None] = mapped_column(String(500))
    # Interne Umlage (Musterhof Service GmbH): keine Rechnung, sondern DATEV-KOST-Stapel.
    internal_allocation: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    assignments: Mapped[list[OwnerAssignment]] = relationship(
        back_populates="owner",
        passive_deletes=True,
    )
