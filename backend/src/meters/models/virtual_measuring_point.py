"""VirtualMeasuringPoint — verrechnete Messstelle aus +/- Komponenten.

Eine virtuelle Messstelle kombiniert die Verbrauchsreihen mehrerer echter
Messstellen arithmetisch (Beispiel: Realverbrauch Biogasanlage = Netzbezug
Biogas-Trafo + Solar-Produktion - Solar-Einspeisung). Jede Komponente
referenziert eine echte MP, waehlt deren Richtung (Bezug vs. Einspeisung,
relevant bei bidirektionalen Stromzaehlern) und ein Vorzeichen.

Es wird nichts materialisiert — die Verrechnung passiert zur Laufzeit ueber
die bestehende Verbrauchs-Pipeline (siehe ``services.virtual_measuring_point``).
Loeschen einer Komponenten-MP cascadet nur die Komponenten-Zeile; die
virtuelle Messstelle bleibt mit den restlichen Komponenten bestehen.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin
from meters.models._enums import FlowDirection, MeterType

if TYPE_CHECKING:  # pragma: no cover
    from meters.models.measuring_point import MeasuringPoint


class VirtualMeasuringPoint(Base, TimestampMixin):
    __tablename__ = "virtual_measuring_point"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    # Alle Komponenten muessen MPs dieses Typs sein — verhindert das Mischen
    # von kWh und m3 in einer Verrechnung.
    type: Mapped[MeterType] = mapped_column(
        SAEnum(MeterType, name="meter_type", native_enum=False, length=16),
        nullable=False,
    )
    components: Mapped[list[VirtualMpComponent]] = relationship(
        cascade="all, delete-orphan",
        order_by="VirtualMpComponent.sort_index",
        lazy="selectin",
    )


class VirtualMpComponent(Base):
    __tablename__ = "virtual_mp_component"
    __table_args__ = (
        CheckConstraint("sign IN (-1, 1)", name="ck_virtual_mp_component_sign"),
        UniqueConstraint(
            "virtual_measuring_point_id",
            "measuring_point_id",
            "direction",
            name="uq_virtual_mp_component",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    virtual_measuring_point_id: Mapped[int] = mapped_column(
        ForeignKey("virtual_measuring_point.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    measuring_point_id: Mapped[int] = mapped_column(
        ForeignKey("measuring_point.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    direction: Mapped[FlowDirection] = mapped_column(
        SAEnum(FlowDirection, name="flow_direction", native_enum=False, length=12),
        nullable=False,
    )
    sign: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # ``lazy="joined"`` — jede Anzeige der Komponenten braucht den MP-Namen.
    measuring_point: Mapped[MeasuringPoint] = relationship(lazy="joined")
