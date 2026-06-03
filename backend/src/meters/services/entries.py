"""Serverseitige, paginierte und gefilterte Abfrage des gemischten Erfassungs-
Streams (Readings + Lieferungen) für ``GET /entries``.

Statt im Frontend bis zu 5000 Zeilen zu laden und dort zu filtern/paginieren,
baut diese Funktion eine ``UNION ALL`` aus gefilterten Reading- und Delivery-
Kandidaten, sortiert nach Zeit und liefert genau eine Seite plus die Gesamtzahl.
Der per-Register-Vorwert (für die Verbrauchs-Delta-Anzeige) kommt über eine
``LAG``-Window-Function.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, case, func, literal, or_, select
from sqlalchemy.orm import InstrumentedAttribute, selectinload
from sqlalchemy.orm import Session as DbSession

from meters.models import (
    Delivery,
    Location,
    MeasuringPoint,
    MeterType,
    PhysicalMeter,
    Reading,
    Register,
    User,
)
from meters.services.access import restrict_mp_query

EntryKind = str  # "reading" | "correction" | "delivery"


@dataclass(frozen=True)
class EntryFilters:
    measuring_point_ids: list[int]
    location_ids: list[int]
    location_none: bool
    meter_types: list[MeterType]
    obis: list[str]
    kind: list[str]  # Teilmenge von {"reading","correction","delivery"}, leer = alle
    from_at: datetime | None
    to_at: datetime | None
    search: str | None


@dataclass
class EntryRow:
    kind: EntryKind
    reading: Reading | None
    delivery: Delivery | None
    previous_value: Decimal | None


@dataclass
class EntriesResult:
    rows: list[EntryRow]
    total: int


# Erfassung gilt als Bestandskorrektur, wenn die Notiz mit "bestandskorrektur"
# beginnt (deckt sich mit der Frontend-Heuristik ``isCorrection``).
_CORRECTION_CASE = case(
    (
        func.lower(func.trim(func.coalesce(Reading.note, ""))).like("bestandskorrektur%"),
        "correction",
    ),
    else_="reading",
)


def _apply_common_filters(
    sel: Select[Any],
    *,
    user: User,
    filters: EntryFilters,
    ts_col: InstrumentedAttribute[datetime],
    note_col: InstrumentedAttribute[str | None],
) -> Select[Any]:
    """Join-Kette + Zugriffs-/Kategorial-/Such-/Datums-Filter, identisch für
    Reading- und Delivery-Kandidaten (nur ``ts_col``/``note_col`` unterscheiden sich)."""
    sel = restrict_mp_query(sel, user, mp_id_column=MeasuringPoint.id)
    if filters.measuring_point_ids:
        sel = sel.where(MeasuringPoint.id.in_(filters.measuring_point_ids))
    if filters.meter_types:
        sel = sel.where(MeasuringPoint.type.in_(filters.meter_types))
    if filters.obis:
        sel = sel.where(Register.obis_code.in_(filters.obis))
    loc_clauses = []
    if filters.location_ids:
        loc_clauses.append(MeasuringPoint.location_id.in_(filters.location_ids))
    if filters.location_none:
        loc_clauses.append(MeasuringPoint.location_id.is_(None))
    if loc_clauses:
        sel = sel.where(or_(*loc_clauses))
    if filters.from_at is not None:
        sel = sel.where(ts_col >= filters.from_at)
    if filters.to_at is not None:
        sel = sel.where(ts_col <= filters.to_at)
    if filters.search:
        needle = f"%{filters.search.strip().lower()}%"
        sel = sel.where(
            or_(
                func.lower(func.coalesce(note_col, "")).like(needle),
                func.lower(MeasuringPoint.name).like(needle),
                func.lower(func.coalesce(Location.name, "")).like(needle),
                func.lower(PhysicalMeter.serial_number).like(needle),
                func.lower(Register.obis_code).like(needle),
            )
        )
    return sel


def _join_chain(sel: Select[Any], base: Any) -> Select[Any]:
    return (
        sel.join(Register, base.register_id == Register.id)
        .join(PhysicalMeter, Register.physical_meter_id == PhysicalMeter.id)
        .join(MeasuringPoint, PhysicalMeter.measuring_point_id == MeasuringPoint.id)
        .outerjoin(Location, MeasuringPoint.location_id == Location.id)
    )


def build_entries(
    db: DbSession, user: User, *, filters: EntryFilters, limit: int, offset: int
) -> EntriesResult:
    kinds = set(filters.kind)
    include_readings = (not kinds) or bool(kinds & {"reading", "correction"})
    include_deliveries = (not kinds) or ("delivery" in kinds)

    candidates: list[Select[Any]] = []

    if include_readings:
        r_sel = _join_chain(
            select(
                literal(0).label("src"),
                Reading.id.label("id"),
                Reading.reading_at.label("ts"),
                _CORRECTION_CASE.label("kind"),
            ),
            Reading,
        )
        r_sel = _apply_common_filters(
            r_sel, user=user, filters=filters, ts_col=Reading.reading_at, note_col=Reading.note
        )
        # Innerhalb der Readings nach reading/correction filtern, falls verlangt.
        wanted = {k for k in ("reading", "correction") if k in kinds}
        if kinds and wanted != {"reading", "correction"}:
            r_sel = r_sel.where(_CORRECTION_CASE.in_(list(wanted)))
        candidates.append(r_sel)

    if include_deliveries:
        d_sel = _join_chain(
            select(
                literal(1).label("src"),
                Delivery.id.label("id"),
                Delivery.delivery_at.label("ts"),
                literal("delivery").label("kind"),
            ),
            Delivery,
        )
        d_sel = _apply_common_filters(
            d_sel, user=user, filters=filters, ts_col=Delivery.delivery_at, note_col=Delivery.note
        )
        candidates.append(d_sel)

    if not candidates:
        return EntriesResult(rows=[], total=0)

    unioned = (
        candidates[0] if len(candidates) == 1 else candidates[0].union_all(*candidates[1:])
    ).subquery("u")

    total = db.scalar(select(func.count()).select_from(unioned)) or 0

    page = db.execute(
        select(unioned.c.src, unioned.c.id, unioned.c.kind)
        .order_by(unioned.c.ts.desc(), unioned.c.src, unioned.c.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    reading_ids = [row.id for row in page if row.src == 0]
    delivery_ids = [row.id for row in page if row.src == 1]

    readings_by_id: dict[int, Reading] = {}
    if reading_ids:
        readings_by_id = {
            r.id: r
            for r in db.scalars(
                select(Reading)
                .options(selectinload(Reading.created_by), selectinload(Reading.photos))
                .where(Reading.id.in_(reading_ids))
            )
        }
    deliveries_by_id: dict[int, Delivery] = {}
    if delivery_ids:
        deliveries_by_id = {
            d.id: d
            for d in db.scalars(
                select(Delivery)
                .options(selectinload(Delivery.created_by))
                .where(Delivery.id.in_(delivery_ids))
            )
        }

    # Vorwert je Reading der Seite: LAG über die Register der Seite (volle
    # Historie → korrektes Delta auch am Fenster-Anfang; Partition = Register,
    # also Zählerwechsel-Grenze).
    prev_by_id: dict[int, Decimal | None] = {}
    if readings_by_id:
        reg_ids = {r.register_id for r in readings_by_id.values()}
        lag = func.lag(Reading.value).over(
            partition_by=Reading.register_id, order_by=(Reading.reading_at, Reading.id)
        )
        win = (
            select(Reading.id.label("id"), lag.label("prev"))
            .where(Reading.register_id.in_(reg_ids))
            .subquery("w")
        )
        for row in db.execute(select(win.c.id, win.c.prev).where(win.c.id.in_(reading_ids))).all():
            prev_by_id[row.id] = row.prev

    out: list[EntryRow] = []
    for row in page:
        if row.src == 0:
            reading = readings_by_id.get(row.id)
            if reading is None:
                continue
            out.append(
                EntryRow(
                    kind=row.kind,
                    reading=reading,
                    delivery=None,
                    previous_value=prev_by_id.get(row.id),
                )
            )
        else:
            delivery = deliveries_by_id.get(row.id)
            if delivery is None:
                continue
            out.append(
                EntryRow(kind="delivery", reading=None, delivery=delivery, previous_value=None)
            )

    return EntriesResult(rows=out, total=total)
