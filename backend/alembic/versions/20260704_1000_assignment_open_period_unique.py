"""Pro MP hoechstens eine offene Zuordnungs-Periode (partial unique index).

Revision ID: 0033_assignment_open_unique
Revises: 0032_mieter_split_name
Create Date: 2026-07-04 10:00:00

Owner-/Supplier-/Mieter-Assignments fuehren periodisierte Zuordnungen
(halboffenes Intervall ``[valid_from, valid_to)``). Die Invariante „genau
eine offene Periode je MP" (``valid_to IS NULL``) pruefte bisher nur der
Service-Code — zwei parallele Requests koennten beide den Check passieren
und zwei offene Perioden anlegen (stille Daten-Inkonsistenz).

Ein partieller UNIQUE-Index pro Tabelle macht das DB-seitig unmoeglich,
exakt wie ``uq_physical_meter_active_per_mp`` fuer den Zaehlertausch.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0033_assignment_open_unique"
down_revision: str | None = "0032_mieter_split_name"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("owner_assignment", "supplier_assignment", "mieter_assignment")


def upgrade() -> None:
    # Partieller UNIQUE-Index — Alembics op.create_index quotet den
    # WHERE-Ausdruck zum String-Literal, daher direkt als raw SQL.
    for table in _TABLES:
        op.execute(
            f"CREATE UNIQUE INDEX uq_{table}_open_per_mp "
            f"ON {table} (measuring_point_id) "
            "WHERE valid_to IS NULL"
        )


def downgrade() -> None:
    for table in _TABLES:
        op.execute(f"DROP INDEX IF EXISTS uq_{table}_open_per_mp")
