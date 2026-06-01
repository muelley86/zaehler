"""Unit-Tests für shift_local_midnight (Periodengrenzen-Normalisierung).

Deterministisch über explizit übergebene Zeitzone (ZoneInfo, DST-genau) —
unabhängig von der Runner-TZ.
"""

from __future__ import annotations

from datetime import UTC, datetime

from meters.core.timeutil import shift_local_midnight

TZ = "Europe/Berlin"


def test_winter_midnight_shifts_to_prev_day() -> None:
    # Lokal 2025-03-01 00:00 (CET=UTC+1) == 2025-02-28 23:00:00Z
    src = datetime(2025, 2, 28, 23, 0, 0, tzinfo=UTC)
    # -> Vortag 23:59:59 lokal == 2025-02-28 22:59:59Z
    assert shift_local_midnight(src, TZ) == datetime(2025, 2, 28, 22, 59, 59, tzinfo=UTC)


def test_summer_midnight_shifts_to_prev_day() -> None:
    # Lokal 2025-07-01 00:00 (CEST=UTC+2) == 2025-06-30 22:00:00Z
    src = datetime(2025, 6, 30, 22, 0, 0, tzinfo=UTC)
    # -> 2025-06-30 23:59:59 lokal == 2025-06-30 21:59:59Z
    assert shift_local_midnight(src, TZ) == datetime(2025, 6, 30, 21, 59, 59, tzinfo=UTC)


def test_year_boundary() -> None:
    # Lokal 2025-01-01 00:00 == 2024-12-31 23:00:00Z -> 2024-12-31 23:59:59 lokal
    src = datetime(2024, 12, 31, 23, 0, 0, tzinfo=UTC)
    assert shift_local_midnight(src, TZ) == datetime(2024, 12, 31, 22, 59, 59, tzinfo=UTC)


def test_non_midnight_unchanged() -> None:
    src = datetime(2025, 3, 1, 12, 0, 0, tzinfo=UTC)  # lokal 13:00
    assert shift_local_midnight(src, TZ) is src


def test_midnight_with_seconds_not_shifted() -> None:
    # 00:00:01 lokal ist NICHT exakt Mitternacht -> unverändert (synthetische
    # Anfangsstand-Readings werden so nicht angefasst).
    src = datetime(2025, 2, 28, 23, 0, 1, tzinfo=UTC)  # lokal 2025-03-01 00:00:01
    assert shift_local_midnight(src, TZ) is src


def test_naive_input_treated_as_utc() -> None:
    src = datetime(2025, 2, 28, 23, 0, 0)  # naiv -> als UTC interpretiert
    assert shift_local_midnight(src, TZ) == datetime(2025, 2, 28, 22, 59, 59, tzinfo=UTC)
