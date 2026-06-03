"""DTOs für den gebündelten Dashboard-Endpoint.

Liefert Verbrauch, Ablesungen und Bestand aller (zugänglichen) Messstellen in
**einer** Antwort, damit das Frontend nicht pro Messstelle einzeln nachladen
muss (Fan-out). Wiederverwendet die bestehenden Teil-DTOs.
"""

from __future__ import annotations

from meters.schemas.common import APIModel
from meters.schemas.reading import ConsumptionPoint, ReadingRead
from meters.schemas.state import RegisterStateRead


class DashboardMeasuringPoint(APIModel):
    measuring_point_id: int
    consumption: list[ConsumptionPoint]
    readings: list[ReadingRead]
    state: list[RegisterStateRead]


class DashboardResponse(APIModel):
    items: list[DashboardMeasuringPoint]
