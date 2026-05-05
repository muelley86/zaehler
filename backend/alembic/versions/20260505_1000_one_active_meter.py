"""Pro Messstelle nur ein aktiver PhysicalMeter (partial unique index).

Revision ID: 0013_one_active_meter
Revises: 0012_heating_uppercase_fix
Create Date: 2026-05-05 10:00:00

CLAUDE.md fordert: jede MeasuringPoint hat zu jedem Zeitpunkt genau
einen aktiven PhysicalMeter (`removed_at IS NULL`). Der Service-Code
in ``meter_replacement.py`` prüft das, hat aber keine DB-Garantie —
zwei parallele Tausch-Requests könnten beide einen neuen Meter
anlegen, beide Vorgänger korrekt schließen, und am Ende stehen zwei
aktive Meter nebeneinander.

Ein partieller UNIQUE-Index auf (measuring_point_id) WHERE removed_at
IS NULL macht das DB-seitig unmöglich. SQLite unterstützt das seit
3.8.0 nativ.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0013_one_active_meter"
down_revision: str | None = "0012_heating_uppercase_fix"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Partieller UNIQUE-Index — Alembics op.create_index quotet den
    # WHERE-Ausdruck zum String-Literal, daher direkt als raw SQL.
    op.execute(
        "CREATE UNIQUE INDEX uq_physical_meter_active_per_mp "
        "ON physical_meter (measuring_point_id) "
        "WHERE removed_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_physical_meter_active_per_mp")
