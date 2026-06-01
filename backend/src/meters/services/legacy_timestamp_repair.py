"""Altdaten-Reparatur der synthetischen Readings (naive-UTC vor Fix #148).

``install_first_meter``/``replace_meter`` erzeugen zwei synthetische Readings
mit festen Wand-Uhrzeiten. Vor Fix #148 (``_local_combine``) wurden diese als
*naive UTC* gespeichert; gemeint war aber die lokale Wand-Zeit. In einem
Europe/Berlin-Browser erscheinen sie dadurch um den (DST-abhaengigen)
Berlin-Offset zu spaet.

Diese Reparatur findet exakt die betroffenen Altzeilen (Note + unveraenderte
Marker-Uhrzeit), interpretiert den gespeicherten Wert als lokale Wand-Zeit
und schreibt den korrekten UTC-Wert zurueck — identisch zu ``_local_combine``.
Idempotent: bereits korrigierte Zeilen tragen eine andere Uhrzeit und werden
nicht erneut angefasst. Kollisionen mit der Unique-Constraint
(register_id, reading_at) werden gemeldet und uebersprungen, nie erzwungen.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.core.config import settings
from meters.models import AuditAction, AuditEntityType, Reading
from meters.services.audit import record

# Synthetische Marker aus services/meter_replacement.py. Schluessel = Note,
# Wert = die lokale Wand-Uhrzeit, die gemeint war (und damit die naiv-UTC-
# Uhrzeit der betroffenen Altzeilen). Echte Nutzer-Erfassungen treffen diese
# Sekunden-genauen Marker praktisch nie.
_MARKERS: dict[str, time] = {
    "Anfangsstand": time(0, 0, 1),
    "Endstand vor Tausch": time(23, 59, 0),
}


@dataclass(slots=True)
class PlannedFix:
    reading_id: int
    register_id: int
    note: str
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


def _to_utc(naive_local: datetime, tz: ZoneInfo) -> datetime:
    """Interpretiert den (faelschlich als UTC gespeicherten) naiven Wert als
    lokale Wand-Zeit und gibt den korrekten naiven UTC-Wert zurueck.

    Spiegelt ``meter_replacement._local_combine`` (datetime.combine(d, t, tz)
    -> astimezone(UTC)). ``reading_at`` wird naiv (UTC) gespeichert, daher das
    abschliessende ``replace(tzinfo=None)``.
    """
    return naive_local.replace(tzinfo=tz).astimezone(UTC).replace(tzinfo=None)


def repair_legacy_timestamps(
    db: Session,
    *,
    dry_run: bool,
    tz_name: str | None = None,
) -> RepairResult:
    """Korrigiert betroffene Altzeilen. Committet NICHT — das ueberlaesst die
    Reparatur dem Aufrufer (CLI committet bei ``--apply``, rollt sonst zurueck)."""
    tz = ZoneInfo(tz_name or settings.timezone)
    result = RepairResult(dry_run=dry_run)

    # Pass 1 (read-only): betroffene Zeilen finden + Kollisionen gegen den
    # Original-Zustand pruefen. So entspricht der Dry-Run-Report exakt dem
    # spaeteren Apply.
    for note, marker in _MARKERS.items():
        rows = db.scalars(select(Reading).where(Reading.note == note)).all()
        for r in rows:
            if r.reading_at.time() != marker:
                continue  # bereits korrigiert oder abweichend -> ignorieren
            after = _to_utc(r.reading_at, tz)
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
                    note=note,
                    before=r.reading_at,
                    after=after,
                    collision=collision,
                )
            )

    if dry_run:
        result.skipped_collisions = sum(1 for p in result.planned if p.collision)
        return result

    # Pass 2: anwenden. Kollisionen ueberspringen (nie Constraint erzwingen).
    by_id = {r.id: r for r in db.scalars(select(Reading)).all()}
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
                "reason": "legacy_tz_repair",
            },
        )
        result.applied += 1

    return result
