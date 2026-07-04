"""Gemeinsamer Guard für die periodisierten Zuordnungs-Services.

Owner-/Supplier-/Mieter-Assignments dürfen pro Messstelle nur EINE offene
Periode (``valid_to IS NULL``) haben. Die Anwendung prüft das vor dem Insert,
ein partieller UNIQUE-Index garantiert es zusätzlich DB-seitig (siehe die
``uq_*_assignment_open_per_mp``-Indizes). Passieren zwei parallele Requests
den App-Check gleichzeitig, schlägt der zweite Insert am Index fehl — dieser
Guard wandelt den ``IntegrityError`` in einen sauberen 409 statt eines 500.

An den geschützten flush-Stellen sind Existenz von MP und Ziel bereits geprüft;
die einzige verbleibende Integritätsverletzung ist der Open-Period-Konflikt.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from meters.core.problem import ProblemError


@contextmanager
def open_period_guard(db: Session, *, kind: str) -> Iterator[None]:
    """Flush innerhalb dieses Kontexts; ein Race auf die offene Periode → 409."""
    try:
        yield
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(
            status_code=409,
            title="Zuordnung wurde parallel geändert",
            detail=(
                f"Für diese Messstelle wurde gerade eine andere {kind}-Zuordnung "
                "angelegt. Bitte die Seite neu laden und erneut versuchen."
            ),
        ) from exc
