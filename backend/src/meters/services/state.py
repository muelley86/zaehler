"""Aktueller Bestand pro Register.

Für nachfüllbare Register (z. B. Heizöl-Tank):
    current = letzter_reading.value
              + Summe(Lieferungen, delivery_at > letzter_reading.reading_at)

Für reguläre Zähler:
    current = letzter_reading.value

Implementierung lädt nur die tatsächlich benötigten Datensätze direkt per SQL —
nicht die volle Reading-/Delivery-Liste über die ORM-Beziehung. Bei großen
Registern (viele Readings) deutlich günstiger.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import selectinload

from meters.models import Delivery, MeasuringPoint, PhysicalMeter, Reading, Register


@dataclass(slots=True)
class RegisterState:
    register_id: int
    physical_meter_id: int
    obis_code: str
    label: str
    unit: str
    is_active: bool
    accepts_deliveries: bool
    last_reading_at: datetime | None
    last_reading_value: Decimal | None
    refilled_since: Decimal
    current_value: Decimal | None


def state_for_register(db: DbSession, register: Register) -> RegisterState:
    """Aktueller Bestand eines einzelnen Registers.

    Lädt das letzte Reading per ORDER BY ... LIMIT 1 und — falls
    nachfüllbar — die Summe der Deliveries nach diesem Reading.
    Vermeidet, alle Readings/Deliveries des Registers in Memory zu
    laden.
    """
    last = db.scalar(
        select(Reading)
        .where(Reading.register_id == register.id)
        .order_by(Reading.reading_at.desc(), Reading.id.desc())
        .limit(1)
    )

    refilled = Decimal("0")
    if register.accepts_deliveries:
        delivery_filter = Delivery.register_id == register.id
        if last is not None:
            delivery_filter = delivery_filter & (Delivery.delivery_at > last.reading_at)
        rows = db.execute(select(Delivery.amount).where(delivery_filter)).all()
        # Summen über DecimalText klappen in Python: kleine Listen, ok.
        refilled = sum((row[0] for row in rows), start=Decimal("0"))

    # Lieferungen ohne bisherigen Stand: Bestand ist nicht aussagekräftig
    # (wir wissen nicht, mit wie viel der Tank gestartet ist).
    current: Decimal | None = last.value + refilled if last is not None else None

    return RegisterState(
        register_id=register.id,
        physical_meter_id=register.physical_meter_id,
        obis_code=register.obis_code,
        label=register.label,
        unit=register.unit,
        is_active=register.is_active,
        accepts_deliveries=register.accepts_deliveries,
        last_reading_at=last.reading_at if last else None,
        last_reading_value=last.value if last else None,
        refilled_since=refilled,
        current_value=current,
    )


def _active_registers(mp: MeasuringPoint) -> list[Register]:
    """Aktive Register des aktuell installierten (nicht entfernten) Zählers."""
    return [
        r
        for meter in mp.physical_meters
        if meter.removed_at is None
        for r in meter.registers
        if r.is_active
    ]


def _last_reading_by_register(
    db: DbSession, register_ids: list[int]
) -> dict[int, tuple[Decimal, datetime]]:
    """Letztes Reading pro Register — eine Query via ROW_NUMBER()-Window-Function.

    SQLite ≥ 3.25 unterstuetzt Window-Funktionen; wir laufen mindestens auf 3.35
    (Python-3.13-Bundle). Unabhaengig von der Anzahl der Register eine Query.
    """
    if not register_ids:
        return {}
    rn = (
        func.row_number()
        .over(
            partition_by=Reading.register_id,
            order_by=(Reading.reading_at.desc(), Reading.id.desc()),
        )
        .label("rn")
    )
    last_subq = (
        select(Reading.register_id, Reading.value, Reading.reading_at, rn)
        .where(Reading.register_id.in_(register_ids))
        .subquery()
    )
    last_rows = db.execute(select(last_subq).where(last_subq.c.rn == 1)).all()
    return {row.register_id: (row.value, row.reading_at) for row in last_rows}


def _refilled_by_register(
    db: DbSession,
    active_registers: list[Register],
    last_by_register: dict[int, tuple[Decimal, datetime]],
) -> dict[int, Decimal]:
    """Summe der Lieferungen NACH dem letzten Reading, je nachfuellbarem Register.

    Eine Query fuer alle tank-faehigen Register; der Cutoff pro Register wird
    Python-seitig angewendet (bei einem Privat-Tank nur ein paar hundert Zeilen).
    """
    refilled_by_register: dict[int, Decimal] = {}
    delivery_register_ids = [r.id for r in active_registers if r.accepts_deliveries]
    if not delivery_register_ids:
        return refilled_by_register
    delivery_rows = db.execute(
        select(Delivery.register_id, Delivery.amount, Delivery.delivery_at).where(
            Delivery.register_id.in_(delivery_register_ids)
        )
    ).all()
    for row in delivery_rows:
        last = last_by_register.get(row.register_id)
        cutoff = last[1] if last is not None else None
        if cutoff is None or row.delivery_at > cutoff:
            refilled_by_register[row.register_id] = (
                refilled_by_register.get(row.register_id, Decimal("0")) + row.amount
            )
    return refilled_by_register


def _build_state(
    register: Register,
    last_by_register: dict[int, tuple[Decimal, datetime]],
    refilled_by_register: dict[int, Decimal],
) -> RegisterState:
    last = last_by_register.get(register.id)
    last_value = last[0] if last is not None else None
    last_at = last[1] if last is not None else None
    refilled = refilled_by_register.get(register.id, Decimal("0"))
    current: Decimal | None = last_value + refilled if last_value is not None else None
    return RegisterState(
        register_id=register.id,
        physical_meter_id=register.physical_meter_id,
        obis_code=register.obis_code,
        label=register.label,
        unit=register.unit,
        is_active=register.is_active,
        accepts_deliveries=register.accepts_deliveries,
        last_reading_at=last_at,
        last_reading_value=last_value,
        refilled_since=refilled,
        current_value=current,
    )


def state_for_measuring_point(
    db: DbSession,
    *,
    measuring_point_id: int,
) -> list[RegisterState]:
    """Aktueller Bestand aller aktiven Register des aktuell installierten Zählers.

    Drei Bulk-Queries (MP+Meter+Register eager, letzte Readings per Window-
    Function, Deliveries der Tank-Register) statt eines N+1-Loops — unabhaengig
    von der Register-Anzahl. Fuer VIELE MPs auf einmal siehe
    ``state_for_measuring_points``.
    """
    mp = db.scalar(
        select(MeasuringPoint)
        .where(MeasuringPoint.id == measuring_point_id)
        .options(
            selectinload(MeasuringPoint.physical_meters).selectinload(PhysicalMeter.registers),
        )
    )
    if mp is None:
        return []
    active_registers = _active_registers(mp)
    if not active_registers:
        return []
    last_by_register = _last_reading_by_register(db, [r.id for r in active_registers])
    refilled_by_register = _refilled_by_register(db, active_registers, last_by_register)
    return [_build_state(r, last_by_register, refilled_by_register) for r in active_registers]


def state_for_measuring_points(
    db: DbSession,
    measuring_point_ids: list[int],
) -> dict[int, list[RegisterState]]:
    """Aktueller Bestand fuer MEHRERE Messstellen — konstante Query-Anzahl.

    Genau drei Queries (MP+Meter+Register eager, letzte Readings, Deliveries)
    fuer die ganze Liste statt drei PRO MP. Verhaltensgleich zu
    ``state_for_measuring_point`` je MP; das Ergebnis ist nach ``mp_id``
    gruppiert (MPs ohne aktive Register fehlen im Dict → Aufrufer nutzt
    ``.get(mp_id, [])``).
    """
    ids = list(measuring_point_ids)
    if not ids:
        return {}
    mps = list(
        db.scalars(
            select(MeasuringPoint)
            .where(MeasuringPoint.id.in_(ids))
            .options(
                selectinload(MeasuringPoint.physical_meters).selectinload(PhysicalMeter.registers),
            )
        )
    )
    active_by_mp = {mp.id: _active_registers(mp) for mp in mps}
    all_active = [r for regs in active_by_mp.values() for r in regs]
    if not all_active:
        return {}
    last_by_register = _last_reading_by_register(db, [r.id for r in all_active])
    refilled_by_register = _refilled_by_register(db, all_active, last_by_register)
    return {
        mp_id: [_build_state(r, last_by_register, refilled_by_register) for r in regs]
        for mp_id, regs in active_by_mp.items()
        if regs
    }


__all__ = [
    "RegisterState",
    "state_for_measuring_point",
    "state_for_measuring_points",
    "state_for_register",
]
