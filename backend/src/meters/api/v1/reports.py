"""Auswertungen: messstellen-uebergreifende Verbrauchs-Aggregation.

``GET /reports/aggregate`` liefert Summen je Gruppe (Kostenstelle | Eigentuemer
| Standort | Hauptstandort | Zaehlerart) ueber einen Zeitraum, optional je Bucket
(Tag/Woche/Monat/Jahr) oder als Gesamt-Summe. ``/aggregate.csv`` liefert dieselbe
Auswertung als CSV-Download. Beide fuer alle angemeldeten Nutzer (kein Admin-Gate);
der Recorder-MP-Zugriffsfilter greift ueber den Service, ``partial`` markiert
potenziell unvollstaendige Summen.
"""

from __future__ import annotations

import csv
import io
from datetime import date
from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from meters.api.deps import CurrentUser, DbDep
from meters.models import MeterType, ReportDimension, UserRole
from meters.schemas.report import ReportAggregateResponse, ReportRow
from meters.services.consumption import Granularity
from meters.services.report_aggregation import (
    METER_TYPE_LABELS,
    GroupBucketRow,
    ReportFilter,
    aggregate_report,
)

router = APIRouter(prefix="/reports", tags=["reports"])

GranularityParam = Literal["day", "week", "month", "year", "total"]

_DIMENSION_LABELS: dict[ReportDimension, str] = {
    ReportDimension.KOSTENSTELLE: "Kostenstelle",
    ReportDimension.OWNER: "Eigentümer",
    ReportDimension.LOCATION: "Standort",
    ReportDimension.MAIN_LOCATION: "Hauptstandort",
    ReportDimension.METER_TYPE: "Zählerart",
    ReportDimension.MEASURING_POINT: "Messstelle",
}


def _to_filter(
    main_location_id: list[int],
    location_id: list[int],
    owner_id: list[int],
    kostenstelle: list[int],
    meter_type: list[MeterType],
) -> ReportFilter:
    """Wiederholbare Query-Parameter -> ReportFilter. Leere Liste = kein Filter.
    Der "ohne ..."-Bucket erscheint unverfiltert automatisch (NULL-im-Filter wird
    ueber die Query-API in V1 nicht angeboten)."""
    return ReportFilter(
        main_location_ids=set(main_location_id) if main_location_id else None,
        location_ids=set(location_id) if location_id else None,
        owner_ids=set(owner_id) if owner_id else None,
        kostenstellen=set(kostenstelle) if kostenstelle else None,
        meter_types=set(meter_type) if meter_type else None,
    )


def _run(
    db: DbDep,
    user: CurrentUser,
    dimension: ReportDimension,
    granularity: GranularityParam,
    from_at: date | None,
    to_at: date | None,
    filters: ReportFilter,
) -> list[GroupBucketRow]:
    gran: Granularity | None = None if granularity == "total" else granularity
    return aggregate_report(
        db,
        user=user,
        dimension=dimension,
        granularity=gran,
        from_date=from_at,
        to_date=to_at,
        filters=filters,
    )


@router.get("/aggregate", response_model=ReportAggregateResponse)
def aggregate(
    db: DbDep,
    user: CurrentUser,
    dimension: ReportDimension,
    granularity: GranularityParam = "total",
    from_at: date | None = Query(None),
    to_at: date | None = Query(None),
    main_location_id: list[int] = Query(default_factory=list),
    location_id: list[int] = Query(default_factory=list),
    owner_id: list[int] = Query(default_factory=list),
    kostenstelle: list[int] = Query(default_factory=list),
    meter_type: list[MeterType] = Query(default_factory=list),
) -> ReportAggregateResponse:
    filters = _to_filter(main_location_id, location_id, owner_id, kostenstelle, meter_type)
    rows = _run(db, user, dimension, granularity, from_at, to_at, filters)
    return ReportAggregateResponse(
        dimension=dimension,
        granularity=granularity,
        from_date=from_at,
        to_date=to_at,
        partial=user.role is not UserRole.ADMIN,
        rows=[ReportRow.model_validate(r) for r in rows],
    )


@router.get("/aggregate.csv")
def aggregate_csv(
    db: DbDep,
    user: CurrentUser,
    dimension: ReportDimension,
    granularity: GranularityParam = "total",
    from_at: date | None = Query(None),
    to_at: date | None = Query(None),
    main_location_id: list[int] = Query(default_factory=list),
    location_id: list[int] = Query(default_factory=list),
    owner_id: list[int] = Query(default_factory=list),
    kostenstelle: list[int] = Query(default_factory=list),
    meter_type: list[MeterType] = Query(default_factory=list),
) -> StreamingResponse:
    filters = _to_filter(main_location_id, location_id, owner_id, kostenstelle, meter_type)
    rows = _run(db, user, dimension, granularity, from_at, to_at, filters)

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(
        ["Dimension", "Gruppe", "Zählerart", "Einheit", "Periode_von", "Periode_bis", "Verbrauch"]
    )
    dim_label = _DIMENSION_LABELS[dimension]
    for r in rows:
        writer.writerow(
            [
                dim_label,
                r.group_label,
                METER_TYPE_LABELS[r.meter_type],
                r.unit,
                r.period_start.isoformat() if r.period_start else "",
                r.period_end.isoformat() if r.period_end else "",
                format(r.consumption, "f"),
            ]
        )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="auswertung.csv"'},
    )
