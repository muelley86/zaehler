"""Gebuendelter Dashboard-Endpoint.

Das Dashboard brauchte frueher pro Messstelle mehrere Einzel-Requests
(``/consumption``, ``/readings``, ``/state``) — bei vielen Messstellen ein
teurer Fan-out (hunderte HTTP-Roundtrips, je mit Auth/Session-Write). Dieser
Endpoint liefert alles fuer **alle zugaenglichen** Messstellen in **einer**
Antwort, mit konstanter Query-Anzahl (Bulk-Loader statt N+1).

Reuse: dieselben Services wie die Einzel-Endpoints
(:func:`points_for_measuring_point` + :func:`aggregate_consumption`,
:func:`state_for_measuring_points`, :func:`current_assignments_bulk`) und
derselbe Recorder-Zugriffsfilter (:func:`restrict_mp_query`), damit Werte und
Berechtigungen 1:1 zu den Einzel-Routen passen. Die Perioden-Totals rechnet
:mod:`meters.services.dashboard`.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import selectinload

from meters.api.deps import CurrentUser, DbDep
from meters.core.problem import ProblemError
from meters.models import MeasuringPoint, OwnerAssignment, User, UserRole
from meters.schemas.dashboard import (
    DashboardMeasuringPoint,
    DashboardRegister,
    DashboardResponse,
    DashboardTotal,
    DashboardVirtualMeasuringPoint,
)
from meters.schemas.reading import ConsumptionPoint as ConsumptionPointRead
from meters.services.access import restrict_mp_query
from meters.services.consumption import ConsumptionPoint, Granularity, aggregate_consumption
from meters.services.consumption_source import (
    SourceCache,
    points_for_measuring_point,
    prime_source_cache,
    source_for,
)
from meters.services.dashboard import (
    DateRange,
    PeriodTotal,
    previous_range,
    totals_for_measuring_point,
    totals_for_virtual_mp,
    use_monthly_totals,
)
from meters.services.owner_assignment import current_assignments_bulk
from meters.services.state import RegisterState, state_for_measuring_points
from meters.services.virtual_measuring_point import (
    consumption_for_virtual_mp,
    visible_virtual_mps,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _ranges(from_at: date | None, to_at: date | None) -> tuple[DateRange | None, DateRange | None]:
    """Zeitraum + Vorperiode. Fehlt eine Grenze, gibt es keinen geschlossenen
    Bereich und damit auch keine Vorperiode."""
    if from_at is not None and to_at is not None and from_at > to_at:
        raise ProblemError(
            status_code=422,
            title="Invalid date range",
            detail="from_at darf nicht nach to_at liegen.",
        )
    if from_at is None or to_at is None:
        return None, None
    rng = DateRange(start=from_at, end=to_at)
    return rng, previous_range(rng)


def _to_point(p: ConsumptionPoint) -> ConsumptionPointRead:
    return ConsumptionPointRead(
        period_start=p.period_start,
        period_end=p.period_end,
        register_id=p.register_id,
        obis_code=p.obis_code,
        consumption=p.consumption,
        unit=p.unit,
    )


def _to_total(t: PeriodTotal) -> DashboardTotal:
    return DashboardTotal(
        obis_code=t.obis_code,
        unit=t.unit,
        direction=t.direction,
        current=t.current,
        previous=t.previous,
    )


def _to_item(
    mp: MeasuringPoint,
    owner: OwnerAssignment | None,
    states: list[RegisterState],
    series: list[ConsumptionPoint],
    totals: list[PeriodTotal],
) -> DashboardMeasuringPoint:
    location = mp.location
    main_location = location.main_location if location is not None else None
    owner_obj = owner.owner if owner is not None else None
    reading_ats = [s.last_reading_at for s in states if s.last_reading_at is not None]
    return DashboardMeasuringPoint(
        id=mp.id,
        name=mp.name,
        type=mp.type,
        heating_source=mp.heating_source,
        location_id=mp.location_id,
        location_name=location.name if location is not None else None,
        main_location_id=main_location.id if main_location is not None else None,
        main_location_name=main_location.name if main_location is not None else None,
        current_owner_id=owner_obj.id if owner_obj is not None else None,
        current_owner_name=owner_obj.name if owner_obj is not None else None,
        kostenstelle=mp.kostenstelle,
        installation_location=mp.installation_location,
        registers=[
            DashboardRegister(obis_code=s.obis_code, label=s.label, unit=s.unit) for s in states
        ],
        # Aktive Register des eingebauten Zaehlers -> letzte Erfassung der MP.
        last_reading_at=max(reading_ats, default=None),
        consumption=[_to_point(p) for p in series],
        totals=[_to_total(t) for t in totals],
    )


def _load_measuring_points(db: DbSession, user: User) -> list[MeasuringPoint]:
    """Zugaengliche Messstellen in EINER Query. ``Location.main_location`` ist
    ``lazy="joined"``, kommt also ohne zusaetzliches selectinload mit."""
    stmt = (
        select(MeasuringPoint)
        .options(selectinload(MeasuringPoint.location))
        .order_by(MeasuringPoint.name, MeasuringPoint.id)
    )
    return list(db.scalars(restrict_mp_query(stmt, user, mp_id_column=MeasuringPoint.id)))


def _primed_cache(
    db: DbSession, ids: list[int], *, granularity: Granularity | None, rng: DateRange | None
) -> SourceCache:
    """Vorgewaermter Quellen-Cache — Bulk statt einer Query je Messstelle."""
    cache = SourceCache()
    source = source_for(granularity)
    prime_source_cache(db, ids, source=source, cache=cache)
    if source == "monthly" and not use_monthly_totals(granularity, rng):
        # Seltener Fall (Monat/Jahr mit nicht monatsalignedem Bereich): die
        # Totals brauchen die Roh-Intervalle, die Reihe bleibt monatlich.
        prime_source_cache(db, ids, source="raw", cache=cache)
    return cache


def _build_items(
    db: DbSession,
    mps: list[MeasuringPoint],
    *,
    granularity: Granularity | None,
    from_at: date | None,
    to_at: date | None,
    rng: DateRange | None,
    prev: DateRange | None,
    cache: SourceCache,
) -> list[DashboardMeasuringPoint]:
    ids = [mp.id for mp in mps]
    owners_by_mp = current_assignments_bulk(db, ids)
    states_by_mp = state_for_measuring_points(db, ids)
    items: list[DashboardMeasuringPoint] = []
    for mp in mps:
        points = points_for_measuring_point(db, mp.id, granularity=granularity, cache=cache)
        # Die Reihe filtert direkt ueber ``from_at``/``to_at`` (nicht ``rng``):
        # ein einseitig offener Bereich schneidet sie weiterhin zu, hat aber
        # keine Vorperiode — ``rng`` ist dann None.
        series = aggregate_consumption(
            points, granularity=granularity, from_date=from_at, to_date=to_at
        )
        totals = totals_for_measuring_point(
            db,
            mp.id,
            granularity=granularity,
            rng=rng,
            prev=prev,
            series_points=points,
            cache=cache,
        )
        states = states_by_mp.get(mp.id, [])
        items.append(_to_item(mp, owners_by_mp.get(mp.id), states, series, totals))
    return items


def _build_virtual_items(
    db: DbSession,
    user: User,
    *,
    granularity: Granularity | None,
    from_at: date | None,
    to_at: date | None,
    rng: DateRange | None,
    prev: DateRange | None,
    cache: SourceCache,
) -> list[DashboardVirtualMeasuringPoint]:
    """Verrechnete Messstellen mit derselben Granularitaet wie die echten Items.
    Ohne ``granularity`` Fallback auf ``"day"`` — die Verrechnung braucht eine
    gemeinsame Zeitbasis (Buckets)."""
    return [
        DashboardVirtualMeasuringPoint(
            id=vmp.id,
            name=vmp.name,
            type=vmp.type,
            location_id=vmp.location_id,
            location_name=vmp.location.name if vmp.location is not None else None,
            main_location_id=(vmp.location.main_location_id if vmp.location is not None else None),
            main_location_name=(
                vmp.location.main_location.name
                if vmp.location is not None and vmp.location.main_location is not None
                else None
            ),
            consumption=[
                _to_point(p)
                for p in consumption_for_virtual_mp(
                    db,
                    vmp,
                    granularity=granularity or "day",
                    from_date=from_at,
                    to_date=to_at,
                    cache=cache,
                )
            ],
            totals=[
                _to_total(t)
                for t in totals_for_virtual_mp(
                    db, vmp, granularity=granularity, rng=rng, prev=prev, cache=cache
                )
            ],
        )
        for vmp in visible_virtual_mps(db, user)
    ]


@router.get("", response_model=DashboardResponse)
def dashboard(
    db: DbDep,
    user: CurrentUser,
    granularity: Granularity | None = Query(None),
    from_at: date | None = Query(None),
    to_at: date | None = Query(None),
) -> DashboardResponse:
    rng, prev = _ranges(from_at, to_at)
    mps = _load_measuring_points(db, user)
    items: list[DashboardMeasuringPoint] = []
    virtual_items: list[DashboardVirtualMeasuringPoint] = []
    if mps:
        cache = _primed_cache(db, [mp.id for mp in mps], granularity=granularity, rng=rng)
        items = _build_items(
            db,
            mps,
            granularity=granularity,
            from_at=from_at,
            to_at=to_at,
            rng=rng,
            prev=prev,
            cache=cache,
        )
        virtual_items = _build_virtual_items(
            db,
            user,
            granularity=granularity,
            from_at=from_at,
            to_at=to_at,
            rng=rng,
            prev=prev,
            cache=cache,
        )
    return DashboardResponse(
        granularity=granularity,
        from_date=from_at,
        to_date=to_at,
        previous_from_date=prev.start if prev is not None else None,
        previous_to_date=prev.end if prev is not None else None,
        # Recorder sieht nur zugewiesene Messstellen -> Summen unvollstaendig
        # (gleiche Semantik wie /reports/aggregate).
        partial=user.role is not UserRole.ADMIN,
        items=items,
        virtual_items=virtual_items,
    )
