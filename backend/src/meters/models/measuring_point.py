"""MeasuringPoint — die logische Messstelle.

Eine MeasuringPoint ist dauerhaft (überlebt Zählertäusche) und trägt die
Konfiguration: Typ (Strom/Gas/Wasser/Öl), Standort, Strom-Tarif-Flags und
optional ein Tankvolumen. Die tatsächlichen Geräte sind ``PhysicalMeter`` —
einer davon ist zu jedem Zeitpunkt aktiv (``removed_at IS NULL``).
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin
from meters.db.types import DecimalText
from meters.models._enums import HeatingSource, MeterType

# Standard-Ableseintervall in Tagen fuer neue Messstellen (und per Migration
# 0043 fuer alle Bestands-Messstellen).
DEFAULT_READING_INTERVAL_DAYS = 35

if TYPE_CHECKING:
    from meters.models.bill_to_assignment import BillToAssignment
    from meters.models.kostenstelle_assignment import KostenstelleAssignment
    from meters.models.location import Location
    from meters.models.measuring_point_note import MeasuringPointNote
    from meters.models.mieter_assignment import MieterAssignment
    from meters.models.owner_assignment import OwnerAssignment
    from meters.models.physical_meter import PhysicalMeter
    from meters.models.supplier_assignment import SupplierAssignment


class MeasuringPoint(Base, TimestampMixin):
    __tablename__ = "measuring_point"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[MeterType] = mapped_column(
        SAEnum(MeterType, name="meter_type", native_enum=False, length=16),
        nullable=False,
    )
    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("location.id", ondelete="SET NULL"), index=True
    )
    is_bidirectional: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_dual_tariff: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tank_capacity: Mapped[Decimal | None] = mapped_column(DecimalText(32))
    # Wandlerfaktor: seit Migration 0035 am ``PhysicalMeter``
    # (siehe Property ``transformer_factor``).
    heating_source: Mapped[HeatingSource | None] = mapped_column(
        SAEnum(HeatingSource, name="heating_source", native_enum=False, length=20),
        nullable=True,
    )
    # Vertragsnummer (Kundennr. beim Versorger) — relevant fuer Strom + Wasser.
    # Marktlokation (MaLo-ID, 11-stellig) — nur Strom. Beide optional, kein
    # UNIQUE-Constraint (Bestandsdaten-Import waere sonst fragil).
    contract_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    market_location: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Freitext-Einbauort innerhalb des Standorts (z. B. „1. Stock, Wohnung 4b",
    # „Heizungsraum links"). Hilft, einen MP physisch zu finden, ohne dass die
    # Location-Granularitaet uebertrieben werden muss.
    installation_location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Soll-Abstand zwischen zwei Ablesungen in Tagen. Die Faelligkeit
    # (letzte Ablesung aelter als das Intervall) berechnet das Frontend.
    reading_interval_days: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=DEFAULT_READING_INTERVAL_DAYS,
        server_default=str(DEFAULT_READING_INTERVAL_DAYS),
    )

    location: Mapped[Location | None] = relationship("Location")
    physical_meters: Mapped[list[PhysicalMeter]] = relationship(
        "PhysicalMeter",
        back_populates="measuring_point",
        cascade="all, delete-orphan",
        order_by="PhysicalMeter.installed_at",
    )
    # Periodisierte Owner-Historie. Aktuelles Assignment = ``valid_to IS NULL``.
    # Cascade-Delete, weil MP-Delete bereits ueber Readings-Existenz-Check
    # geschuetzt ist und die Historie ohne MP wertlos waere.
    owner_assignments: Mapped[list[OwnerAssignment]] = relationship(
        "OwnerAssignment",
        back_populates="measuring_point",
        cascade="all, delete-orphan",
        order_by="OwnerAssignment.valid_from",
    )
    # Periodisierte Lieferanten-Historie — gleiches Modell wie die
    # Owner-Historie (aktuelles Assignment = ``valid_to IS NULL``).
    supplier_assignments: Mapped[list[SupplierAssignment]] = relationship(
        "SupplierAssignment",
        back_populates="measuring_point",
        cascade="all, delete-orphan",
        order_by="SupplierAssignment.valid_from",
    )
    # Periodisierte Mieter-Historie — optionale Zuordnung, gleiches Modell wie
    # die Owner-Historie (aktuelles Assignment = ``valid_to IS NULL``).
    mieter_assignments: Mapped[list[MieterAssignment]] = relationship(
        "MieterAssignment",
        back_populates="measuring_point",
        cascade="all, delete-orphan",
        order_by="MieterAssignment.valid_from",
    )
    # Periodisierte Kostenstelle (seit 0036). ``selectin``: Listen, Dashboard und
    # Auswertungen lesen ``kostenstelle`` je MP — eine Query fuer alle statt N+1.
    kostenstelle_assignments: Mapped[list[KostenstelleAssignment]] = relationship(
        "KostenstelleAssignment",
        back_populates="measuring_point",
        cascade="all, delete-orphan",
        order_by="KostenstelleAssignment.valid_from",
        lazy="selectin",
    )
    # "Abrechnen an" mit Gueltigkeitszeitraum (seit 0047); ohne Periode = Eigentuemer.
    bill_to_assignments: Mapped[list[BillToAssignment]] = relationship(
        "BillToAssignment",
        back_populates="measuring_point",
        cascade="all, delete-orphan",
        order_by="BillToAssignment.valid_from",
    )
    # Freitext-Notizen (seit 0045), neueste zuerst. Ohne MP wertlos -> Cascade.
    notes: Mapped[list[MeasuringPointNote]] = relationship(
        "MeasuringPointNote",
        back_populates="measuring_point",
        cascade="all, delete-orphan",
        order_by="MeasuringPointNote.created_at.desc()",
    )

    @property
    def kostenstelle(self) -> int | None:
        """Aktuelle Kostenstelle (offene Periode); ``None`` ohne offene Periode.

        Fuer einen Stichtag ``services.kostenstelle_assignment.kostenstellen_am`` nutzen."""
        return next(
            (a.kostenstelle for a in self.kostenstelle_assignments if a.valid_to is None), None
        )

    @property
    def active_meter(self) -> PhysicalMeter | None:
        """Aktives Geraet (``removed_at IS NULL``); ``None`` vor dem ersten Einbau."""
        return next((m for m in self.physical_meters if m.removed_at is None), None)

    @property
    def transformer_factor(self) -> int | None:
        """Wandlerfaktor des aktiven Geraets (API-kompatible Sicht).

        Fruehere Geraete behalten ihren eigenen
        Faktor; die Verbrauchsberechnung nutzt je Ablesung den Faktor ihres Geraets."""
        meter = self.active_meter
        return meter.transformer_factor if meter is not None else None
