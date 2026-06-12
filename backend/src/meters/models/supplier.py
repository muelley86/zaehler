"""Supplier — zentraler Lieferanten-Stammdatensatz.

Lieferanten sind die eigentlichen Verkaeufer der Energie. Die
Lieferanten-Geschichte einer MP ist — analog zum Eigentuemer — in
``SupplierAssignment``-Perioden modelliert. Supplier selbst traegt nur
die statischen Daten (Name, Adresse, Kontakt, Steuer-IDs).

Beim Loeschen eines Suppliers wird die Referenz im SupplierAssignment auf
NULL gesetzt (Cascade SET NULL in Migration 0030) — die historischen
Perioden bleiben erhalten, der Name wird in der UI als „unbekannt"
gezeigt.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:  # pragma: no cover
    from meters.models.supplier_assignment import SupplierAssignment


class Supplier(Base, TimestampMixin):
    __tablename__ = "supplier"

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

    assignments: Mapped[list[SupplierAssignment]] = relationship(
        back_populates="supplier",
        passive_deletes=True,
    )
