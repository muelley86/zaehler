"""DTOs fuer virtuelle (verrechnete) Messstellen.

Eine virtuelle Messstelle verrechnet die Verbrauchsreihen mehrerer echter
Messstellen mit Vorzeichen (+/-) und Richtungswahl (Bezug/Einspeisung bei
bidirektionalen Stromzaehlern). ``components`` wird beim Update als komplette
Liste ersetzt (kein Einzel-CRUD) — die Listen sind klein (max. 20).
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from meters.models import MeterType
from meters.schemas.common import APIModel, DecimalStr

MAX_COMPONENTS = 20


class VirtualMpComponentIn(BaseModel):
    measuring_point_id: int
    direction: Literal["bezug", "einspeisung"] = "bezug"
    sign: Literal[1, -1] = 1


class VirtualMeasuringPointCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)
    type: MeterType
    location_id: int | None = None
    components: list[VirtualMpComponentIn] = Field(min_length=1, max_length=MAX_COMPONENTS)


class VirtualMeasuringPointUpdate(BaseModel):
    """Alle Felder optional; ``components`` gesetzt = komplette Liste ersetzen."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)
    type: MeterType | None = None
    # Standort setzen bzw. mit ``clear_location`` explizit entfernen (wie
    # ``MeasuringPointUpdate``; ``None`` allein bedeutet "nicht angefasst").
    location_id: int | None = None
    clear_location: bool = False
    components: list[VirtualMpComponentIn] | None = Field(
        default=None, min_length=1, max_length=MAX_COMPONENTS
    )


class VirtualMpComponentRead(APIModel):
    id: int
    measuring_point_id: int
    measuring_point_name: str
    direction: Literal["bezug", "einspeisung"]
    sign: int


class VirtualMeasuringPointRead(APIModel):
    id: int
    name: str
    note: str | None
    type: MeterType
    location_id: int | None = None
    location_name: str | None = None
    # Abgeleitet ueber Location.main_location — nie direkt gespeichert.
    main_location_id: int | None = None
    main_location_name: str | None = None
    components: list[VirtualMpComponentRead]


class VirtualMpBreakdownComponent(APIModel):
    """Beitrag EINER Komponente im Zeitraum: ``consumption`` ist der Rohwert
    (>= 0), ``contribution`` = ``sign * consumption`` — was tatsaechlich in
    die Netto-Summe einging."""

    component_id: int
    measuring_point_id: int
    measuring_point_name: str
    direction: Literal["bezug", "einspeisung"]
    sign: int
    consumption: DecimalStr
    contribution: DecimalStr
    unit: str


class VirtualMpBreakdownTotal(APIModel):
    unit: str
    net: DecimalStr  # Summe der contributions, kann negativ sein


class VirtualMpBreakdownResponse(APIModel):
    virtual_measuring_point_id: int
    from_date: date | None
    to_date: date | None
    components: list[VirtualMpBreakdownComponent]
    totals: list[VirtualMpBreakdownTotal]  # je unit (i. d. R. genau eine)
