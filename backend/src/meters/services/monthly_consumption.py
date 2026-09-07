"""(Neu-)Berechnung der materialisierten Monats-Statistik (``monthly_consumption``).

Die Tabelle ist ein Cache der monatlichen Verbräuche je Register — abgeleitet aus
den Roh-``Reading``-Werten mit derselben taggenauen Interpolation wie die
On-the-fly-Aggregation (:func:`consumption.split_across_buckets`). ``recompute_register``
ist idempotent: vorhandene Zeilen des Registers werden gelöscht und frisch
geschrieben. Aufgerufen nach jeder Ablese-Änderung (B2b) und einmalig zum
Backfill (:func:`recompute_all`, CLI).
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import date
from decimal import Decimal

from sqlalchemy import delete, event, select
from sqlalchemy.orm import Session, selectinload

from meters.db import SessionLocal
from meters.models import Delivery, MonthlyConsumption, PhysicalMeter, Reading, Register
from meters.services.consumption import (
    ConsumptionPoint,
    consumption_for_register,
    split_across_buckets,
)

_logger = logging.getLogger("meters.monthly_consumption")


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


def monthly_points_for_measuring_point(
    db: Session, measuring_point_id: int
) -> list[ConsumptionPoint]:
    """Liest die materialisierten Monatswerte aller Register einer Messstelle aus
    ``monthly_consumption`` und gibt sie als ``ConsumptionPoint``-Liste zurück —
    formgleich zu ``consumption_for_measuring_point`` (aber bereits monatlich
    gebucketet). Lese-Pfad-Ersatz für die Monats-Granularität (B2c)."""
    rows = db.scalars(
        select(MonthlyConsumption)
        .join(Register, MonthlyConsumption.register_id == Register.id)
        .join(PhysicalMeter, Register.physical_meter_id == PhysicalMeter.id)
        .where(PhysicalMeter.measuring_point_id == measuring_point_id)
    )
    return [
        ConsumptionPoint(
            period_start=row.period_start,
            period_end=row.period_end,
            register_id=row.register_id,
            obis_code=row.obis_code,
            consumption=row.consumption,
            unit=row.unit,
        )
        for row in rows
    ]


def monthly_points_for_measuring_points(
    db: Session, measuring_point_ids: Iterable[int]
) -> dict[int, list[ConsumptionPoint]]:
    """Bulk-Pendant zu ``monthly_points_for_measuring_point``: derselbe Join,
    aber EINE Query für ALLE ``measuring_point_ids`` (statt einer Query je
    Messstelle), Ergebnis nach ``PhysicalMeter.measuring_point_id`` gruppiert.
    IDs ohne Monats-Zeilen (z. B. noch keine Ablesung) liefern eine leere
    Liste, nicht KeyError."""
    ids = list(measuring_point_ids)
    out: dict[int, list[ConsumptionPoint]] = {mp_id: [] for mp_id in ids}
    if not ids:
        return out
    rows = db.execute(
        select(MonthlyConsumption, PhysicalMeter.measuring_point_id)
        .join(Register, MonthlyConsumption.register_id == Register.id)
        .join(PhysicalMeter, Register.physical_meter_id == PhysicalMeter.id)
        .where(PhysicalMeter.measuring_point_id.in_(ids))
    )
    for row, mp_id in rows:
        out[mp_id].append(
            ConsumptionPoint(
                period_start=row.period_start,
                period_end=row.period_end,
                register_id=row.register_id,
                obis_code=row.obis_code,
                consumption=row.consumption,
                unit=row.unit,
            )
        )
    return out


# --- Cache-Invalidierung (B2b) ---------------------------------------------
#
# Statt jeden Mutations-Endpunkt einzeln zu instrumentieren (leicht zu
# vergessen -> stiller Stale-Cache), hängen wir EINEN zentralen Session-Hook
# an: ``after_flush`` sammelt die betroffenen Register-IDs (aus geänderten
# Reading-/Delivery-/Register-Objekten), ``after_commit`` rechnet sie in einer
# eigenen Transaktion neu. So sind ALLE Pfade (Erfassen, Bearbeiten, Löschen,
# Import, Zählertausch, Register-/Lieferungs-Änderungen) automatisch abgedeckt.

_DIRTY_KEY = "meters_dirty_registers"
_SKIP_KEY = "meters_skip_recompute"
_hooks_registered = False


def _touched_register_ids(session: Session) -> set[int]:
    ids: set[int] = set()
    for obj in (*session.new, *session.dirty, *session.deleted):
        if isinstance(obj, (Reading, Delivery)):
            ids.add(obj.register_id)
        elif isinstance(obj, Register):
            ids.add(obj.id)
    return ids


def _after_flush(session: Session, _flush_context: object) -> None:
    if session.info.get(_SKIP_KEY):
        return
    touched = _touched_register_ids(session)
    if touched:
        dirty: set[int] = session.info.setdefault(_DIRTY_KEY, set())
        dirty.update(touched)


def _after_commit(session: Session) -> None:
    register_ids = session.info.pop(_DIRTY_KEY, None)
    if not register_ids or session.info.get(_SKIP_KEY):
        return
    # Neuberechnung in eigener Transaktion NACH dem Commit der Roh-Daten.
    # Scheitert sie, bleibt der Cache stale (kein Datenverlust) — die nächste
    # Änderung oder ein Backfill korrigiert ihn. Der Request darf nie kippen.
    try:
        with SessionLocal() as fresh:
            fresh.info[_SKIP_KEY] = True  # eigene Schreibvorgänge nicht erneut einsammeln
            for register_id in register_ids:
                recompute_register(fresh, register_id)
            fresh.commit()
    except Exception:
        _logger.exception("monthly_consumption-Recompute fehlgeschlagen: %s", register_ids)


def defer_recompute(session: Session) -> set[int]:
    """Übernimmt die aktuell als dirty markierten Register (Kopie), unterdrückt
    die SYNCHRONE Neuberechnung im ``after_commit``-Hook dieser Session und gibt
    die IDs für eine spätere (Background-)Neuberechnung zurück.

    Für den Massen-Import: der Request soll nicht auf die Neuberechnung hunderter
    Register warten (Reverse-Proxy-Timeout). Aufrufen NACH dem flush der Roh-
    Daten (``_DIRTY_KEY`` ist dann befüllt) und VOR dem Commit.
    """
    ids = set(session.info.get(_DIRTY_KEY) or ())
    session.info[_SKIP_KEY] = True
    return ids


def recompute_registers(register_ids: Iterable[int]) -> None:
    """Neuberechnung der Monats-Werte für die genannten Register in einer eigenen
    Session — für ``BackgroundTasks``. Fehler werden nur geloggt (Cache bleibt
    stale, kein Datenverlust); identisches Muster wie ``_after_commit``."""
    ids = list(register_ids)
    if not ids:
        return
    try:
        with SessionLocal() as fresh:
            fresh.info[_SKIP_KEY] = True  # eigene Schreibvorgänge nicht erneut einsammeln
            for register_id in ids:
                recompute_register(fresh, register_id)
            fresh.commit()
    except Exception:
        _logger.exception("monthly_consumption-Background-Recompute fehlgeschlagen: %s", ids)


def _after_rollback(session: Session) -> None:
    session.info.pop(_DIRTY_KEY, None)


def register_monthly_consumption_hooks() -> None:
    """Hängt die Cache-Invalidierung an die Session-Factory (idempotent)."""
    global _hooks_registered
    if _hooks_registered:
        return
    event.listen(SessionLocal, "after_flush", _after_flush)
    event.listen(SessionLocal, "after_commit", _after_commit)
    event.listen(SessionLocal, "after_rollback", _after_rollback)
    _hooks_registered = True
