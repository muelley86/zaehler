from __future__ import annotations

from datetime import date
from typing import Literal

from meters.models import MeterType, ReportDimension
from meters.schemas.common import APIModel, DecimalStr


class ReportRow(APIModel):
    """Eine aggregierte Ergebniszeile. Eindeutig durch
    ``(group_key, meter_type, unit, direction[, period_*])``. ``group_key`` ist
    ``None`` fuer den "ohne ..."-Bucket bzw. fuer die Zaehlerart-Dimension (dort
    traegt ``group_label`` die Information). ``direction="einspeisung"`` markiert
    Einspeise-Register (OBIS ``2.8.x``) — sie werden nie mit Bezug summiert."""

    group_key: int | None = None
    group_label: str
    meter_type: MeterType
    unit: str
    direction: Literal["bezug", "einspeisung"] = "bezug"
    period_start: date | None = None
    period_end: date | None = None
    consumption: DecimalStr


class ReportAggregateResponse(APIModel):
    dimension: ReportDimension
    granularity: str  # "day".."year" | "total"
    from_date: date | None = None
    to_date: date | None = None
    # True, wenn der abrufende Nutzer kein Admin ist: die Summen umfassen dann
    # nur die ihm zugeordneten Messstellen und koennen unvollstaendig sein.
    partial: bool
    rows: list[ReportRow]
