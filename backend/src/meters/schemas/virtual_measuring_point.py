"""DTOs fuer virtuelle (verrechnete) Messstellen.

Eine virtuelle Messstelle verrechnet die Verbrauchsreihen mehrerer echter
Messstellen mit Vorzeichen (+/-) und Richtungswahl (Bezug/Einspeisung bei
bidirektionalen Stromzaehlern). ``components`` wird beim Update als komplette
Liste ersetzt (kein Einzel-CRUD) — die Listen sind klein (max. 20).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from meters.models import MeterType
from meters.schemas.common import APIModel

MAX_COMPONENTS = 20


class VirtualMpComponentIn(BaseModel):
    measuring_point_id: int
    direction: Literal["bezug", "einspeisung"] = "bezug"
    sign: Literal[1, -1] = 1


class VirtualMeasuringPointCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)
    type: MeterType
    components: list[VirtualMpComponentIn] = Field(min_length=1, max_length=MAX_COMPONENTS)


class VirtualMeasuringPointUpdate(BaseModel):
    """Alle Felder optional; ``components`` gesetzt = komplette Liste ersetzen."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)
    type: MeterType | None = None
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
    components: list[VirtualMpComponentRead]
