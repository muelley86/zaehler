"""Zentrale Quellenwahl für Verbrauchs-Punkte: materialisierte Monatstabelle
(``month``/``year``) vs. on-the-fly aus den Roh-Readings (``day``/``week``/``None``).

Ersetzt die vier bisher duplizierten "Monat vs. on-the-fly"-Weichen in
``api/v1/readings.py``, ``services/report_aggregation.py``,
``services/virtual_measuring_point.py`` und ``api/v1/dashboard.py``.

Eigenes Modul, weil ``consumption.py`` NICHT von ``monthly_consumption.py``
importieren darf (Zirkel: ``monthly_consumption`` importiert bereits aus
``consumption``).

Jahr-Rollup aus der Monatstabelle ist exakt: ein Monats-Punkt überspannt nie
eine Jahresgrenze, ``split_across_buckets(monthly_point, "year")`` landet also
immer in genau einem Bucket — Lesen der Monatstabelle für ``year`` liefert
dieselben Jahres-Summen wie die on-the-fly-Berechnung aus den Roh-Readings.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy.orm import Session as DbSession

from meters.services.consumption import (
    ConsumptionPoint,
    Granularity,
    PointsCache,
    consumption_for_measuring_point,
    consumption_for_measuring_points,
)
from meters.services.monthly_consumption import (
    monthly_points_for_measuring_point,
    monthly_points_for_measuring_points,
)

PointsSource = Literal["raw", "monthly"]


@dataclass(slots=True)
class SourceCache:
    """Request-scoped Memoisierung beider Quellen je ``measuring_point_id``."""

    raw: PointsCache = field(default_factory=dict)
    monthly: PointsCache = field(default_factory=dict)


def source_for(granularity: Granularity | None) -> PointsSource:
    """``month`` und ``year`` lesen die materialisierte Monatstabelle (schnell,
    kein Readings-Laden — Jahr-Rollup ist exakt, s. Modul-Docstring); alle
    anderen Granularitäten (inkl. ``None`` = Gesamt-Modus) rechnen on-the-fly
    aus den Roh-Readings, weil sie feinere Perioden als einen Monat brauchen."""
    return "monthly" if granularity in ("month", "year") else "raw"


def points_for_measuring_point(
    db: DbSession,
    measuring_point_id: int,
    *,
    granularity: Granularity | None,
    cache: SourceCache | None = None,
) -> list[ConsumptionPoint]:
    """Verbrauchspunkte EINER Messstelle aus der von ``granularity`` bestimmten
    Quelle (s. :func:`source_for`) — zentrale Weiche statt der vier bisher
    duplizierten if/else-Verzweigungen. ``cache`` memoisiert je Quelle für die
    Dauer EINES Requests, analog zu ``consumption_for_measuring_point``."""
    if source_for(granularity) == "raw":
        return consumption_for_measuring_point(
            db,
            measuring_point_id=measuring_point_id,
            cache=cache.raw if cache is not None else None,
        )
    if cache is not None and measuring_point_id in cache.monthly:
        return cache.monthly[measuring_point_id]
    points = monthly_points_for_measuring_point(db, measuring_point_id)
    if cache is not None:
        cache.monthly[measuring_point_id] = points
    return points


def prime_source_cache(
    db: DbSession,
    measuring_point_ids: Iterable[int],
    *,
    source: PointsSource,
    cache: SourceCache,
) -> None:
    """Füllt ``cache`` für ALLE ``measuring_point_ids`` mit wenigen Bulk-Queries
    statt einer Query je Messstelle. IDs ohne Monats-Zeilen bekommen im
    ``monthly``-Fall eine leere Liste (nicht fehlend) — ``points_for_measuring_point``
    fragt beim Cache-Hit sonst erneut die DB."""
    if source == "raw":
        consumption_for_measuring_points(db, measuring_point_ids, cache=cache.raw)
        return
    cache.monthly.update(monthly_points_for_measuring_points(db, measuring_point_ids))
