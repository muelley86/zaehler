"""Messstellen-uebergreifende Verbrauchs-Aggregation fuer den Auswertungen-Bereich.

Summiert Verbrauchsmengen ueber MEHRERE Messstellen, gruppiert nach EINER
Dimension (Kostenstelle | Eigentuemer | Standort | Hauptstandort | Zaehlerart)
ueber einen Zeitraum, optional je Bucket (Tag/Woche/Monat/Jahr) oder als Gesamt-
Summe. Baut auf der bestehenden Single-MP-Pipeline auf
(:func:`consumption_for_measuring_point` + :func:`aggregate_consumption`).

Invarianten:
- Einheiten werden NIE gemischt: Ergebniszeile = ``(group_key, meter_type, unit
  [, bucket])``. Eine Gruppe (z. B. eine Kostenstelle) kann mehrere Zeilen haben
  (Strom kWh, Wasser m3, ...).
- Es wird nur BEZUG summiert. Einspeise-Register (OBIS ``2.8.x``) werden
  ausgeschlossen (Summe ueber Bezug + Einspeisung waere fachlich sinnlos).
- Eigentuemer-Dimension nutzt den AKTUELL gueltigen Eigentuemer (nicht
  zeitraum-genau) — konsistent mit Dashboard-Filter und ``current_owner``.
- Recorder sehen nur ihre zugaenglichen MPs (``restrict_mp_query``); ihre Summen
  sind damit bewusst partiell (der Endpoint markiert das via ``partial``).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import selectinload

from meters.models import Location, MeasuringPoint, MeterType, ReportDimension, User
from meters.services.access import restrict_mp_query
from meters.services.consumption import (
    Granularity,
    aggregate_consumption,
    consumption_for_measuring_point,
)
from meters.services.monthly_consumption import monthly_points_for_measuring_point
from meters.services.owner_assignment import current_assignments_bulk

# Deutsche Labels fuer die Zaehlerart-Dimension (Backend liefert das Label mit,
# damit das Frontend keine Stammdaten nachladen muss).
METER_TYPE_LABELS: dict[MeterType, str] = {
    MeterType.ELECTRICITY: "Strom",
    MeterType.WATER: "Wasser",
    MeterType.HEATING: "Wärme",
}


@dataclass(slots=True)
class ReportFilter:
    """Kategoriale Filter. ``None`` = keine Einschraenkung auf dieser Achse.
    Ein ``None``-Element in einem Set schliesst den jeweiligen "ohne ..."-Bucket
    explizit ein (spiegelt das Dashboard-``Set<number|null>``-Muster)."""

    main_location_ids: set[int | None] | None = None
    location_ids: set[int | None] | None = None
    owner_ids: set[int | None] | None = None
    kostenstellen: set[int | None] | None = None
    meter_types: set[MeterType] | None = None


@dataclass(slots=True)
class GroupBucketRow:
    group_key: int | None
    group_label: str
    meter_type: MeterType
    unit: str
    period_start: date | None  # None im Gesamt-Modus
    period_end: date | None
    consumption: Decimal


def _is_consumption_register(obis_code: str) -> bool:
    """True fuer Bezugs-/Verbrauchs-Register. Schliesst Einspeisung (``2.8.x``)
    aus — der einzige OBIS-Praefix, der fachlich nicht in eine Verbrauchs-Summe
    gehoert. Wasser (``water``) und user-definierte Waerme-Register bleiben drin."""
    return not obis_code.startswith("2.8.")


def _matches(value: int | None, allowed: set[int | None] | None) -> bool:
    return allowed is None or value in allowed


def _group_of(
    mp: MeasuringPoint,
    dimension: ReportDimension,
    owner: tuple[int | None, str | None],
) -> tuple[int | None, str]:
    """Liefert ``(group_key, group_label)`` fuer eine MP und Dimension.
    NULL-Werte landen in einem eigenen "ohne ..."-Bucket (key ``None``)."""
    if dimension is ReportDimension.KOSTENSTELLE:
        return mp.kostenstelle, (
            str(mp.kostenstelle) if mp.kostenstelle is not None else "ohne Kostenstelle"
        )
    if dimension is ReportDimension.OWNER:
        owner_id, owner_name = owner
        return owner_id, (owner_name if owner_name is not None else "ohne Eigentümer")
    if dimension is ReportDimension.LOCATION:
        loc = mp.location
        if loc is None:
            return None, "ohne Standort"
        return loc.id, loc.name
    if dimension is ReportDimension.MAIN_LOCATION:
        main = mp.location.main_location if mp.location is not None else None
        if main is None:
            return None, "ohne Hauptstandort"
        return main.id, main.name
    if dimension is ReportDimension.MEASURING_POINT:
        return mp.id, mp.name
    # METER_TYPE: Gruppe == Zaehlerart; key bleibt None (Label traegt die Info).
    return None, METER_TYPE_LABELS[mp.type]


def aggregate_report(
    db: DbSession,
    *,
    user: User,
    dimension: ReportDimension,
    granularity: Granularity | None,
    from_date: date | None,
    to_date: date | None,
    filters: ReportFilter,
) -> list[GroupBucketRow]:
    """Aggregiert Verbrauch ueber alle (zugaenglichen, gefilterten) MPs.

    ``granularity is None`` -> Gesamt-Modus (eine Summe je Gruppe, kein Bucket).
    """
    stmt = select(MeasuringPoint).options(
        selectinload(MeasuringPoint.location).selectinload(Location.main_location)
    )
    stmt = restrict_mp_query(stmt, user, mp_id_column=MeasuringPoint.id)
    mps = list(db.scalars(stmt))
    if not mps:
        return []

    owners = current_assignments_bulk(db, [mp.id for mp in mps])

    # (group_key, group_label, meter_type, unit, period_start, period_end) -> Decimal
    sums: dict[tuple[int | None, str, MeterType, str, date | None, date | None], Decimal] = (
        defaultdict(lambda: Decimal("0"))
    )

    for mp in mps:
        assignment = owners.get(mp.id)
        owner_id = assignment.owner_id if assignment is not None else None
        owner_name = assignment.owner.name if assignment is not None and assignment.owner else None

        # Kategoriale Filter (unabhaengig von der Gruppierungs-Dimension).
        main_id = mp.location.main_location_id if mp.location is not None else None
        if not _matches(mp.kostenstelle, filters.kostenstellen):
            continue
        if not _matches(mp.location_id, filters.location_ids):
            continue
        if not _matches(main_id, filters.main_location_ids):
            continue
        if not _matches(owner_id, filters.owner_ids):
            continue
        if filters.meter_types is not None and mp.type not in filters.meter_types:
            continue

        group_key, group_label = _group_of(mp, dimension, (owner_id, owner_name))

        # Monats-Granularität aus der materialisierten Tabelle (schnell, kein
        # Readings-Laden); sonst on-the-fly. Gleiche Interpolation -> gleiche Werte.
        if granularity == "month":
            points = monthly_points_for_measuring_point(db, mp.id)
        else:
            points = consumption_for_measuring_point(db, measuring_point_id=mp.id)
        points = [p for p in points if _is_consumption_register(p.obis_code)]
        points = aggregate_consumption(
            points, granularity=granularity, from_date=from_date, to_date=to_date
        )
        for p in points:
            bucket = (None, None) if granularity is None else (p.period_start, p.period_end)
            key = (group_key, group_label, mp.type, p.unit, bucket[0], bucket[1])
            sums[key] += p.consumption

    rows = [
        GroupBucketRow(
            group_key=k[0],
            group_label=k[1],
            meter_type=k[2],
            unit=k[3],
            period_start=k[4],
            period_end=k[5],
            consumption=v,
        )
        for k, v in sums.items()
    ]
    rows.sort(
        key=lambda r: (
            r.period_end or date.max,
            r.group_label,
            r.meter_type.value,
            r.unit,
        )
    )
    return rows
