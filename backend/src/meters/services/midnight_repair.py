"""Bestands-Reparatur: Readings an lokaler Mitternacht auf den Vortag 23:59:59.

Spiegelt die Eingabe-Normalisierung (``schemas/reading.py`` ->
``core.timeutil.shift_local_midnight``) fuer bereits gespeicherte Daten: jede
Erfassung, deren lokale Zeit exakt ``00:00:00`` ist, gehoert fachlich ans Ende
des Vortags und wird auf ``Vortag 23:59:59`` (lokal) verschoben — damit der
Verbrauch vollstaendig der vorhergehenden Periode zugeordnet wird.

Idempotent (23:59:59 ist nicht Mitternacht -> kein erneutes Anfassen).
Kollisionen mit ``UNIQUE(register_id, reading_at)`` werden gemeldet und
uebersprungen, nie erzwungen. Committet NICHT — das ueberlaesst die Reparatur
dem Aufrufer (CLI committet bei ``--apply``, rollt sonst zurueck).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.core.config import settings
from meters.core.timeutil import shift_local_midnight
from meters.models import AuditAction, AuditEntityType, Reading
from meters.services.audit import record


@dataclass(slots=True)
class PlannedFix:
    reading_id: int
    register_id: int
    before: datetime
    after: datetime
    collision: bool


@dataclass(slots=True)
class RepairResult:
    dry_run: bool
    planned: list[PlannedFix] = field(default_factory=list)
    applied: int = 0
    skipped_collisions: int = 0

    @property
    def affected(self) -> int:
        return len(self.planned)


def repair_midnight_readings(
    db: Session,
    *,
    dry_run: bool,
    tz_name: str | None = None,
) -> RepairResult:
    tz_name = tz_name or settings.timezone
    result = RepairResult(dry_run=dry_run)

    rows = db.scalars(select(Reading)).all()

    # Pass 1 (read-only): betroffene Zeilen + Kollisionen gegen den Original-
    # Zustand. shift_local_midnight liefert *aware* UTC; reading_at wird naiv
    # (UTC) gespeichert -> tzinfo entfernen fuer Speicherung/Vergleich.
    for r in rows:
        after = shift_local_midnight(r.reading_at, tz_name).replace(tzinfo=None)
        if after == r.reading_at:
            continue  # nicht lokale Mitternacht -> unveraendert
        collision = (
            db.scalar(
                select(Reading.id).where(
                    Reading.register_id == r.register_id,
                    Reading.reading_at == after,
                    Reading.id != r.id,
                )
            )
            is not None
        )
        result.planned.append(
            PlannedFix(
                reading_id=r.id,
                register_id=r.register_id,
                before=r.reading_at,
                after=after,
                collision=collision,
            )
        )

    if dry_run:
        result.skipped_collisions = sum(1 for p in result.planned if p.collision)
        return result

    by_id = {r.id: r for r in rows}
    for plan in result.planned:
        if plan.collision:
            result.skipped_collisions += 1
            continue
        reading = by_id[plan.reading_id]
        reading.reading_at = plan.after
        record(
            db,
            user_id=None,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.READING,
            entity_id=plan.reading_id,
            diff={
                "reading_at": {
                    "before": plan.before.isoformat(),
                    "after": plan.after.isoformat(),
                },
                "reason": "midnight_period_boundary",
            },
        )
        result.applied += 1

    return result
