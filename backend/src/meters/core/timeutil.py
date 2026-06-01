"""Zeit-Hilfsfunktionen, die nicht von App-Modulen abhaengen (nur stdlib)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo


def shift_local_midnight(value: datetime, tz_name: str) -> datetime:
    """Verschiebt Erfassungen an Periodengrenzen auf das Ende der Vorperiode.

    Faellt ``value`` in der Zeitzone ``tz_name`` exakt auf Mitternacht
    (``00:00:00.000000``), wird der Zeitpunkt fachlich als Ende des Vortags
    interpretiert und auf den **Vortag 23:59:59** (lokal) verschoben — zurueck-
    gegeben als *aware* UTC. Andernfalls bleibt ``value`` unveraendert.

    DST-genau ueber ``ZoneInfo`` (keine festen Offsets). Naive ``value`` werden
    als UTC interpretiert (App-Konvention).
    """
    tz = ZoneInfo(tz_name)
    aware = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    local = aware.astimezone(tz)
    if (local.hour, local.minute, local.second, local.microsecond) == (0, 0, 0, 0):
        return (local - timedelta(seconds=1)).astimezone(UTC)
    return value
