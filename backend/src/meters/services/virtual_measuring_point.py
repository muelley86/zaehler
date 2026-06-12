"""Verrechnung virtueller Messstellen.

Eine virtuelle Messstelle summiert die Verbrauchsreihen ihrer Komponenten
mit Vorzeichen (+/-), wobei jede Komponente gezielt eine Richtung der
Quell-MP waehlt (Bezug = OBIS 1.8.x/Wasser/Waerme, Einspeisung = 2.8.x).

Verrechnet wird IMMER ueber Zeit-Buckets (Tag/Woche/Monat/Jahr) bzw. als
Gesamt-Summe — Roh-Ablese-Intervalle verschiedener Zaehler liegen nie
deckungsgleich, erst die taggenaue Bucket-Interpolation der bestehenden
Pipeline schafft eine gemeinsame Zeitbasis. Negative Bucket-Werte sind
zulaessig (z. B. wenn die Einspeisung die Produktion eines Teilzeitraums
uebersteigt). Es wird nichts materialisiert; der Monats-Pfad liest je
Komponente den ``monthly_consumption``-Cache.

Sichtbarkeit: Admin sieht alle. Ein Recorder sieht eine virtuelle MP nur,
wenn er Zugriff auf ALLE Komponenten-MPs hat — sonst koennte er ueber die
Verrechnung Werte nicht zugaenglicher Messstellen ableiten. 404 statt 403,
konsistent zur No-Leak-Policy in ``services.access``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from meters.core.problem import ProblemError
from meters.models import FlowDirection, MeterType, User, VirtualMeasuringPoint, VirtualMpComponent
from meters.services.access import accessible_mp_ids
from meters.services.consumption import (
    ConsumptionPoint,
    Granularity,
    aggregate_consumption,
    clip_consumption_to_range,
    consumption_for_measuring_point,
    direction_of,
)
from meters.services.monthly_consumption import monthly_points_for_measuring_point

# Sentinel-Werte fuer verrechnete Punkte: es gibt kein einzelnes Quell-Register.
VIRTUAL_REGISTER_ID = 0
VIRTUAL_OBIS_CODE = "virtual"


def _is_fully_accessible(vmp: VirtualMeasuringPoint, allowed: set[int]) -> bool:
    return bool(vmp.components) and all(c.measuring_point_id in allowed for c in vmp.components)


def visible_virtual_mps(db: DbSession, user: User) -> list[VirtualMeasuringPoint]:
    """Alle virtuellen MPs fuer Admins; fuer Recorder nur die, deren saemtliche
    Komponenten-MPs zugaenglich sind."""
    vmps = list(db.scalars(select(VirtualMeasuringPoint).order_by(VirtualMeasuringPoint.name)))
    allowed = accessible_mp_ids(db, user)
    if allowed is None:
        return vmps
    return [v for v in vmps if _is_fully_accessible(v, allowed)]


def assert_can_access_virtual_mp(db: DbSession, user: User, vmp_id: int) -> VirtualMeasuringPoint:
    """Laedt die virtuelle MP oder wirft 404 (auch bei fehlendem Recorder-
    Zugriff — kein Existenz-Leak)."""
    vmp = db.get(VirtualMeasuringPoint, vmp_id)
    if vmp is None:
        raise ProblemError(status_code=404, title="Virtual measuring point not found")
    allowed = accessible_mp_ids(db, user)
    if allowed is not None and not _is_fully_accessible(vmp, allowed):
        raise ProblemError(status_code=404, title="Virtual measuring point not found")
    return vmp


def _component_points(
    db: DbSession,
    comp: VirtualMpComponent,
    *,
    granularity: Granularity | None,
    from_date: date | None,
    to_date: date | None,
) -> list[ConsumptionPoint]:
    """Richtungsgefilterte, auf den Zeitraum zugeschnittene Punkte EINER
    Komponente — ohne Vorzeichen. ``granularity is None`` = Gesamt-Modus
    (taggenau geclippt)."""
    if granularity == "month":
        points = monthly_points_for_measuring_point(db, comp.measuring_point_id)
    else:
        points = consumption_for_measuring_point(db, measuring_point_id=comp.measuring_point_id)
    points = [p for p in points if direction_of(p.obis_code) == comp.direction.value]
    if granularity is None:
        return clip_consumption_to_range(points, from_date=from_date, to_date=to_date)
    return aggregate_consumption(
        points, granularity=granularity, from_date=from_date, to_date=to_date
    )


def consumption_for_virtual_mp(
    db: DbSession,
    vmp: VirtualMeasuringPoint,
    *,
    granularity: Granularity | None,
    from_date: date | None,
    to_date: date | None,
) -> list[ConsumptionPoint]:
    """Netto-Verbrauchsreihe der virtuellen MP.

    ``granularity is None`` = Gesamt-Modus (eine Summe je Einheit ueber den
    Zeitraum, taggenau geclippt). Buckets werden zusaetzlich je ``unit``
    getrennt — defensive Absicherung gegen gemischte Einheiten (bei Waerme
    theoretisch moeglich), damit nie kWh mit m3 verrechnet werden.
    """
    buckets: dict[tuple[date, date, str], Decimal] = {}
    for comp in vmp.components:
        points = _component_points(
            db, comp, granularity=granularity, from_date=from_date, to_date=to_date
        )
        for p in points:
            if granularity is None:
                key = (from_date or date.min, to_date or date.max, p.unit)
            else:
                key = (p.period_start, p.period_end, p.unit)
            buckets[key] = buckets.get(key, Decimal("0")) + comp.sign * p.consumption
    out = [
        ConsumptionPoint(
            period_start=start,
            period_end=end,
            register_id=VIRTUAL_REGISTER_ID,
            obis_code=VIRTUAL_OBIS_CODE,
            consumption=value,
            unit=unit,
        )
        for (start, end, unit), value in buckets.items()
    ]
    out.sort(key=lambda p: (p.period_end, p.unit))
    return out


@dataclass(frozen=True)
class ComponentConsumption:
    """Gesamt-Verbrauch EINER Komponente im Zeitraum — Rohwert ohne
    Vorzeichen; das Vorzeichen steht separat in ``sign``."""

    component_id: int
    measuring_point_id: int
    measuring_point_name: str
    direction: Literal["bezug", "einspeisung"]
    sign: int  # +1 | -1
    consumption: Decimal
    unit: str


# Anzeige-Einheit fuer 0-Zeilen, wenn KEINE Komponente Daten im Zeitraum hat.
# Der ``m³``-Default deckt bewusst Gas/Wasser/Öl ab; bei neuen MeterTypes mit
# anderer Einheit hier ergaenzen.
_FALLBACK_UNITS = {MeterType.ELECTRICITY: "kWh", MeterType.HEATING: "kWh"}


def breakdown_for_virtual_mp(
    db: DbSession,
    vmp: VirtualMeasuringPoint,
    *,
    from_date: date | None,
    to_date: date | None,
) -> list[ComponentConsumption]:
    """Audit-Aufschluesselung der Netto-Verrechnung: eine Gesamt-Summe je
    Komponente (taggenau geclippt, ohne Buckets). Komponenten ohne Daten im
    Zeitraum erscheinen als 0-Zeile, damit sichtbar bleibt, dass sie nichts
    beitragen. Je ``unit`` getrennt — defensiv wie die Netto-Buckets."""
    sums: list[tuple[VirtualMpComponent, dict[str, Decimal]]] = []
    for comp in vmp.components:  # relationship ist nach sort_index geordnet
        per_unit: dict[str, Decimal] = {}
        points = _component_points(db, comp, granularity=None, from_date=from_date, to_date=to_date)
        for p in points:
            per_unit[p.unit] = per_unit.get(p.unit, Decimal("0")) + p.consumption
        sums.append((comp, per_unit))
    # Einheit fuer 0-Zeilen: bevorzugt die der Geschwister-Komponenten (alle
    # Komponenten haben denselben MP-Typ), sonst Default je vmp-Typ.
    seen_units = sorted({u for _, per_unit in sums for u in per_unit})
    fallback_unit = seen_units[0] if seen_units else _FALLBACK_UNITS.get(vmp.type, "m³")
    out: list[ComponentConsumption] = []
    for comp, per_unit in sums:
        if not per_unit:
            per_unit = {fallback_unit: Decimal("0")}
        for unit in sorted(per_unit):
            out.append(
                ComponentConsumption(
                    component_id=comp.id,
                    measuring_point_id=comp.measuring_point_id,
                    measuring_point_name=comp.measuring_point.name,
                    direction=(
                        "einspeisung" if comp.direction is FlowDirection.EINSPEISUNG else "bezug"
                    ),
                    sign=comp.sign,
                    consumption=per_unit[unit],
                    unit=unit,
                )
            )
    return out


def breakdown_totals(rows: list[ComponentConsumption]) -> dict[str, Decimal]:
    """Netto je Einheit ueber alle Komponenten-Zeilen (``sign * consumption``)."""
    nets: dict[str, Decimal] = {}
    for r in rows:
        nets[r.unit] = nets.get(r.unit, Decimal("0")) + r.sign * r.consumption
    return nets
