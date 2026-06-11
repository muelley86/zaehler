"""DTOs für den gebündelten Dashboard-Endpoint.

Liefert Verbrauch, Ablesungen und Bestand aller (zugänglichen) Messstellen in
**einer** Antwort, damit das Frontend nicht pro Messstelle einzeln nachladen
muss (Fan-out). Wiederverwendet die bestehenden Teil-DTOs.
"""

from __future__ import annotations

from pydantic import Field

from meters.models import MeterType
from meters.schemas.common import APIModel
from meters.schemas.reading import ConsumptionPoint, ReadingRead
from meters.schemas.state import RegisterStateRead


class DashboardMeasuringPoint(APIModel):
    measuring_point_id: int
    consumption: list[ConsumptionPoint]
    readings: list[ReadingRead]
    state: list[RegisterStateRead]


class DashboardVirtualMeasuringPoint(APIModel):
    """Verrechnete Messstelle im Dashboard: Netto-Verbrauchsreihe (kann
    negative Buckets enthalten), keine Readings/State (abgeleitete Werte)."""

    id: int
    name: str
    type: MeterType
    consumption: list[ConsumptionPoint]


class DashboardResponse(APIModel):
    items: list[DashboardMeasuringPoint]
    # Additiv mit Default — aeltere Frontend-Stände ignorieren das Feld einfach.
    virtual_items: list[DashboardVirtualMeasuringPoint] = Field(default_factory=list)
