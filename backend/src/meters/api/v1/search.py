"""Globale Suche ueber Messstellen, Zaehlernummern, Standorte, Notizen.

Use-Case: bei einer Rechnungskontrolle hat der User eine Zaehlernummer in der
Hand und sucht die zugehoerige Messstelle. Wir erlauben Substring-Match auf:

- ``MeasuringPoint.name``
- ``PhysicalMeter.serial_number`` (aktiv und historisch)
- ``Location.name`` / ``Location.note``
- ``MainLocation.name`` / ``MainLocation.note``

Pro MP wird die *hoechste* Prioritaet zurueckgegeben (SERIAL > NAME >
MAIN_LOCATION > LOCATION > MAIN_LOCATION_NOTE > LOCATION_NOTE). Recorder
sehen nur Messstellen, auf die sie via ``UserMeasuringPointAccess`` Zugriff
haben — ``restrict_mp_query`` wendet das automatisch an.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from meters.api.deps import CurrentUser, DbDep
from meters.models import Location, MainLocation, MeasuringPoint, PhysicalMeter
from meters.schemas import SearchHit, SearchMatchKind
from meters.schemas.search import match_priority
from meters.services.access import restrict_mp_query

router = APIRouter(prefix="/search", tags=["search"])

MIN_QUERY_LEN = 2
DEFAULT_LIMIT = 50
MAX_LIMIT = 200


@router.get("", response_model=list[SearchHit])
def search(
    db: DbDep,
    user: CurrentUser,
    q: str = Query(default=""),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
) -> list[SearchHit]:
    needle = q.strip()
    if len(needle) < MIN_QUERY_LEN:
        return []
    pattern = f"%{needle.lower()}%"

    # Ein Statement, das alle MPs einsammelt, die in IRGENDEINEM unserer
    # Such-Felder einen Substring-Treffer haben. ``func.lower`` auf beiden
    # Seiten, damit Umlaute/Sonderzeichen sauber case-insensitive matchen
    # (SQLite-LIKE ist nur ASCII-ci von Haus aus).
    pm_subq = select(PhysicalMeter.measuring_point_id).where(
        func.lower(PhysicalMeter.serial_number).like(pattern)
    )
    stmt = (
        select(MeasuringPoint)
        .outerjoin(Location, MeasuringPoint.location_id == Location.id)
        .outerjoin(MainLocation, Location.main_location_id == MainLocation.id)
        .options(
            selectinload(MeasuringPoint.location).selectinload(Location.main_location),
            selectinload(MeasuringPoint.physical_meters),
        )
        .where(
            or_(
                func.lower(MeasuringPoint.name).like(pattern),
                func.lower(Location.name).like(pattern),
                func.lower(MainLocation.name).like(pattern),
                func.lower(Location.note).like(pattern),
                func.lower(MainLocation.note).like(pattern),
                MeasuringPoint.id.in_(pm_subq),
            )
        )
        .distinct()
    )
    stmt = restrict_mp_query(stmt, user, mp_id_column=MeasuringPoint.id)

    hits: list[SearchHit] = []
    for mp in db.scalars(stmt).unique():
        hit = _classify(mp, needle.lower())
        if hit is not None:
            hits.append(hit)

    hits.sort(key=lambda h: (match_priority(h.matched_via), h.measuring_point_name.lower()))
    return hits[:limit]


def _make_hit(
    mp: MeasuringPoint,
    kind: SearchMatchKind,
    detail: str | None = None,
) -> SearchHit:
    loc = mp.location
    main = loc.main_location if loc else None
    return SearchHit(
        measuring_point_id=mp.id,
        measuring_point_name=mp.name,
        location_id=loc.id if loc else None,
        location_name=loc.name if loc else None,
        main_location_id=main.id if main else None,
        main_location_name=main.name if main else None,
        matched_via=kind,
        matched_detail=detail,
    )


def _classify(mp: MeasuringPoint, needle_lower: str) -> SearchHit | None:
    """Hoechste Prioritaet gewinnt — SERIAL > NAME > MAIN_LOCATION > LOCATION
    > *_NOTE. Kein Treffer in Python (sollte nicht passieren wenn SQL matched)
    → None, dann verwerfen wir die Zeile."""
    # Serial: nimm das erste matchende PhysicalMeter (aktiv bevorzugt).
    matching_pms = [pm for pm in mp.physical_meters if needle_lower in pm.serial_number.lower()]
    if matching_pms:
        matching_pms.sort(key=lambda pm: (pm.removed_at is not None, pm.installed_at))
        return _make_hit(mp, SearchMatchKind.SERIAL, matching_pms[0].serial_number)
    if needle_lower in mp.name.lower():
        return _make_hit(mp, SearchMatchKind.NAME)
    loc = mp.location
    main = loc.main_location if loc else None
    if main and needle_lower in main.name.lower():
        return _make_hit(mp, SearchMatchKind.MAIN_LOCATION)
    if loc and needle_lower in loc.name.lower():
        return _make_hit(mp, SearchMatchKind.LOCATION)
    if main and main.note and needle_lower in main.note.lower():
        return _make_hit(mp, SearchMatchKind.MAIN_LOCATION_NOTE)
    if loc and loc.note and needle_lower in loc.note.lower():
        return _make_hit(mp, SearchMatchKind.LOCATION_NOTE)
    return None
