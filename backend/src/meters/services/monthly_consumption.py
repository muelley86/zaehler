"""(Neu-)Berechnung der materialisierten Monats-Statistik (``monthly_consumption``).

Die Tabelle ist ein Cache der monatlichen Verbräuche je Register — abgeleitet aus
den Roh-``Reading``-Werten mit derselben taggenauen Interpolation wie die
On-the-fly-Aggregation (:func:`consumption.split_across_buckets`). ``recompute_register``
ist idempotent: vorhandene Zeilen des Registers werden gelöscht und frisch
geschrieben. Aufgerufen nach jeder Ablese-Änderung (B2b) und einmalig zum
Backfill (:func:`recompute_all`, CLI).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from meters.models import MonthlyConsumption, PhysicalMeter, Register
from meters.services.consumption import consumption_for_register, split_across_buckets


def recompute_register(db: Session, register_id: int) -> None:
    """Verwirft die Monats-Zeilen des Registers und schreibt sie neu aus den
    aktuellen Readings. Existiert das Register nicht (mehr), werden nur die
    verwaisten Zeilen entfernt."""
    register = db.scalar(
        select(Register)
        .where(Register.id == register_id)
        .options(
            selectinload(Register.readings),
            selectinload(Register.deliveries),
            selectinload(Register.physical_meter).selectinload(PhysicalMeter.measuring_point),
        )
    )
    db.execute(delete(MonthlyConsumption).where(MonthlyConsumption.register_id == register_id))
    if register is None:
        return

    factor = register.physical_meter.measuring_point.transformer_factor
    totals: dict[tuple[date, date], Decimal] = {}
    for point in consumption_for_register(register, transformer_factor=factor):
        for part in split_across_buckets(point, "month"):
            key = (part.period_start, part.period_end)
            totals[key] = totals.get(key, Decimal("0")) + part.consumption

    for (period_start, period_end), consumption in totals.items():
        db.add(
            MonthlyConsumption(
                register_id=register_id,
                period_start=period_start,
                period_end=period_end,
                consumption=consumption,
                unit=register.unit,
                obis_code=register.obis_code,
            )
        )
    db.flush()


def recompute_all(db: Session) -> int:
    """Backfill: alle Register neu berechnen. Gibt die Anzahl Register zurück."""
    register_ids = list(db.scalars(select(Register.id)))
    for register_id in register_ids:
        recompute_register(db, register_id)
    return len(register_ids)
