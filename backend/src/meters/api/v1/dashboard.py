"""Gebündelter Dashboard-Endpoint.

Das Dashboard brauchte bisher pro Messstelle drei Einzel-Requests
(``/consumption``, ``/readings``, ``/state``) — bei vielen Messstellen ein
teurer Fan-out (hunderte HTTP-Roundtrips, je mit Auth/Session-Write). Dieser
Endpoint liefert dasselbe für **alle zugänglichen** Messstellen in **einer**
Antwort; die eigentliche Aggregation ist serverseitig günstig.

Reuse: dieselben Services wie die Einzel-Endpoints
(:func:`consumption_for_measuring_point` / :func:`monthly_points_for_measuring_point`
+ :func:`aggregate_consumption`, :func:`state_for_measuring_point`) und derselbe
Recorder-Zugriffsfilter (:func:`restrict_mp_query` / :func:`accessible_mp_ids`),
damit Werte und Berechtigungen 1:1 zu den Einzel-Routen passen.
"""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from meters.api.deps import CurrentUser, DbDep
from meters.api.v1.readings import _to_read
from meters.models import MeasuringPoint, PhysicalMeter, Reading, Register
from meters.schemas import ConsumptionPoint, ReadingRead, RegisterStateRead
from meters.schemas.dashboard import (
    DashboardMeasuringPoint,
    DashboardResponse,
    DashboardVirtualMeasuringPoint,
)
from meters.services.access import accessible_mp_ids, restrict_mp_query
from meters.services.consumption import aggregate_consumption, consumption_for_measuring_point
from meters.services.monthly_consumption import monthly_points_for_measuring_point
from meters.services.state import state_for_measuring_point
from meters.services.virtual_measuring_point import (
    consumption_for_virtual_mp,
    visible_virtual_mps,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
def dashboard(
    db: DbDep,
    user: CurrentUser,
    granularity: Literal["day", "week", "month", "year"] | None = Query(None),
    from_at: date | None = Query(None),
    to_at: date | None = Query(None),
) -> DashboardResponse:
    # Zugängliche Messstellen (Admin = alle, Recorder = zugewiesene).
    allowed = accessible_mp_ids(db, user)
    mp_stmt = select(MeasuringPoint.id).order_by(MeasuringPoint.id)
    if allowed is not None:
        if not allowed:
            return DashboardResponse(items=[])
        mp_stmt = mp_stmt.where(MeasuringPoint.id.in_(allowed))
    mp_ids = list(db.scalars(mp_stmt))

    # Readings für ALLE zugänglichen Messstellen in EINER Query, dann nach MP
    # gruppiert — statt einer Query je MP. Range wie die Einzelroute: ab
    # Tagesbeginn ``from_at`` bis Tagesende ``to_at`` (inklusiv).
    read_lo = datetime.combine(from_at, time.min) if from_at is not None else None
    read_hi = datetime.combine(to_at, time(23, 59, 59)) if to_at is not None else None
    read_stmt = (
        select(Reading, PhysicalMeter.measuring_point_id)
        .join(Reading.register)
        .join(Register.physical_meter)
        .options(selectinload(Reading.created_by), selectinload(Reading.photos))
        .order_by(Reading.reading_at.desc(), Reading.id.desc())
    )
    read_stmt = restrict_mp_query(read_stmt, user, mp_id_column=PhysicalMeter.measuring_point_id)
    if read_lo is not None:
        read_stmt = read_stmt.where(Reading.reading_at >= read_lo)
    if read_hi is not None:
        read_stmt = read_stmt.where(Reading.reading_at <= read_hi)
    readings_by_mp: dict[int, list[ReadingRead]] = {}
    for reading, mp_id in db.execute(read_stmt).all():
        readings_by_mp.setdefault(mp_id, []).append(_to_read(reading))

    items: list[DashboardMeasuringPoint] = []
    for mp_id in mp_ids:
        # Monats-Granularität aus dem materialisierten Cache, sonst on-the-fly —
        # identisch zur Einzelroute ``/measuring-points/{id}/consumption``.
        if granularity == "month":
            points = monthly_points_for_measuring_point(db, mp_id)
        else:
            points = consumption_for_measuring_point(db, measuring_point_id=mp_id)
        points = aggregate_consumption(
            points, granularity=granularity, from_date=from_at, to_date=to_at
        )
        consumption = [
            ConsumptionPoint(
                period_start=p.period_start,
                period_end=p.period_end,
                register_id=p.register_id,
                obis_code=p.obis_code,
                consumption=p.consumption,
                unit=p.unit,
            )
            for p in points
        ]
        state = [
            RegisterStateRead(
                register_id=s.register_id,
                physical_meter_id=s.physical_meter_id,
                obis_code=s.obis_code,
                label=s.label,
                unit=s.unit,
                is_active=s.is_active,
                accepts_deliveries=s.accepts_deliveries,
                last_reading_at=s.last_reading_at,
                last_reading_value=s.last_reading_value,
                refilled_since=s.refilled_since,
                current_value=s.current_value,
            )
            for s in state_for_measuring_point(db, measuring_point_id=mp_id)
        ]
        items.append(
            DashboardMeasuringPoint(
                measuring_point_id=mp_id,
                consumption=consumption,
                readings=readings_by_mp.get(mp_id, []),
                state=state,
            )
        )

    # Virtuelle (verrechnete) Messstellen: Netto-Reihen mit derselben
    # Granularität wie die echten Items. Ohne granularity Fallback auf "day" —
    # die Verrechnung braucht eine gemeinsame Zeitbasis (Buckets).
    virtual_items = [
        DashboardVirtualMeasuringPoint(
            id=vmp.id,
            name=vmp.name,
            type=vmp.type,
            consumption=[
                ConsumptionPoint(
                    period_start=p.period_start,
                    period_end=p.period_end,
                    register_id=p.register_id,
                    obis_code=p.obis_code,
                    consumption=p.consumption,
                    unit=p.unit,
                )
                for p in consumption_for_virtual_mp(
                    db, vmp, granularity=granularity or "day", from_date=from_at, to_date=to_at
                )
            ],
        )
        for vmp in visible_virtual_mps(db, user)
    ]
    return DashboardResponse(items=items, virtual_items=virtual_items)
