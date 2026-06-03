"""Gemischter, paginierter Erfassungs-Stream (Readings + Lieferungen).

``GET /entries`` ersetzt das frühere Client-seitige Laden+Filtern der gesamten
Erfassungs-Liste: alle Filter (Messstellen/Standorte/Zählerart/OBIS/Art/Suche/
Zeitraum) und die Pagination laufen serverseitig. Antwort: genau eine Seite
plus ``total`` für die „X von N"-Anzeige. Der Recorder-MP-Zugriffsfilter greift
wie überall über ``restrict_mp_query``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Query

from meters.api.deps import CurrentUser, DbDep
from meters.api.v1.deliveries import _to_read as _delivery_to_read
from meters.api.v1.readings import _to_read as _reading_to_read
from meters.models import MeterType
from meters.schemas.entries import EntriesPage, EntryRead
from meters.services.entries import EntryFilters, build_entries

router = APIRouter(tags=["entries"])

EntryKindParam = Literal["reading", "correction", "delivery"]


@router.get("/entries", response_model=EntriesPage)
def list_entries(
    db: DbDep,
    user: CurrentUser,
    measuring_point_id: list[int] = Query(default_factory=list),
    location_id: list[int] = Query(default_factory=list),
    location_none: bool = Query(False),
    meter_type: list[MeterType] = Query(default_factory=list),
    obis: list[str] = Query(default_factory=list),
    kind: list[EntryKindParam] = Query(default_factory=list),
    from_at: datetime | None = Query(None),
    to_at: datetime | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(50, ge=1, le=5000),
    offset: int = Query(0, ge=0),
) -> EntriesPage:
    filters = EntryFilters(
        measuring_point_ids=measuring_point_id,
        location_ids=location_id,
        location_none=location_none,
        meter_types=meter_type,
        obis=obis,
        kind=list(kind),
        from_at=from_at,
        to_at=to_at,
        search=search,
    )
    result = build_entries(db, user, filters=filters, limit=limit, offset=offset)
    items: list[EntryRead] = []
    for r in result.rows:
        if r.reading is not None:
            items.append(
                EntryRead(
                    kind=r.kind,  # type: ignore[arg-type]
                    reading=_reading_to_read(r.reading),
                    previous_value=r.previous_value,
                )
            )
        elif r.delivery is not None:
            items.append(EntryRead(kind="delivery", delivery=_delivery_to_read(r.delivery)))
    return EntriesPage(items=items, total=result.total)
