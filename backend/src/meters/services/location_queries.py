"""Reverse-Lookup-Selects: Messstellen je Zaehlerstandort / Hauptstandort.

Quelle der Standort-Detailseiten (``GET /locations/{id}/measuring-points`` und
``GET /main-locations/{id}/measuring-points``). Beide Funktionen geben ein
``Select`` zurueck — der Endpoint legt ueber ``measuring_points_with_state`` noch
``restrict_mp_query`` (Recorder-Zugriff) darauf und buendelt den aktuellen Stand.

Analog zu ``select_measuring_points_for_owner`` (``services/owner_assignment.py``),
nur ohne Periodisierung: die Standort-Zuordnung ist ein direkter FK
(``MeasuringPoint.location_id``), keine ``[valid_from, valid_to)``-Periode.
"""

from __future__ import annotations

from sqlalchemy import Select, select
from sqlalchemy.orm import selectinload

from meters.models import Location, MeasuringPoint, PhysicalMeter


def _with_eager_state(stmt: Select[tuple[MeasuringPoint]]) -> Select[tuple[MeasuringPoint]]:
    """Eager-Load Location + Zaehler/Register, damit ``to_measuring_point_read``
    und ``state_for_measuring_point`` ohne N+1 serialisieren koennen."""
    return stmt.options(
        selectinload(MeasuringPoint.location),
        selectinload(MeasuringPoint.physical_meters).selectinload(PhysicalMeter.registers),
    ).order_by(MeasuringPoint.name)


def select_measuring_points_for_location(location_id: int) -> Select[tuple[MeasuringPoint]]:
    """Select auf alle MPs, die direkt auf ``location_id`` zeigen."""
    return _with_eager_state(
        select(MeasuringPoint).where(MeasuringPoint.location_id == location_id)
    )


def select_measuring_points_for_main_location(
    main_location_id: int,
) -> Select[tuple[MeasuringPoint]]:
    """Select auf alle MPs, deren Zaehlerstandort zu ``main_location_id`` gehoert.

    Aggregiert ueber den Join MeasuringPoint -> Location: MPs ohne Standort oder
    mit Standort unter einem anderen Hauptstandort fallen raus.
    """
    return _with_eager_state(
        select(MeasuringPoint)
        .join(Location, MeasuringPoint.location_id == Location.id)
        .where(Location.main_location_id == main_location_id)
    )
