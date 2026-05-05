"""Edge-Case-Tests für consumption._pairwise.

Ein Refactor des kleinen Generators bricht sonst leise — die Integration-
Tests greifen das nur indirekt ab.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import cast

from meters.models import Reading
from meters.services.consumption import _pairwise


@dataclass
class _Stub:
    """Reading-kompatibler Stub. _pairwise nutzt keine ORM-Features."""

    id: int
    reading_at: datetime
    value: Decimal


def _r(idx: int, minute: int) -> Reading:
    return cast(
        Reading, _Stub(id=idx, reading_at=datetime(2024, 1, 1, 0, minute), value=Decimal(idx))
    )


def test_pairwise_empty() -> None:
    assert list(_pairwise([])) == []


def test_pairwise_single() -> None:
    assert list(_pairwise([_r(1, 0)])) == []


def test_pairwise_two() -> None:
    a, b = _r(1, 0), _r(2, 1)
    assert list(_pairwise([a, b])) == [(a, b)]


def test_pairwise_three_overlapping_windows() -> None:
    a, b, c = _r(1, 0), _r(2, 1), _r(3, 2)
    assert list(_pairwise([a, b, c])) == [(a, b), (b, c)]
