"""mieter_split_name

Mieter sind natuerliche Personen: das einzelne (unique) ``name``-Feld wird in
``first_name`` (Vorname, optional) und ``last_name`` (Nachname, Pflicht)
aufgeteilt. Die UNIQUE-Bedingung entfaellt — Namensgleichheit ist erlaubt.

Bestehende Namen wandern als Backfill in ``last_name`` (i. d. R. noch keine
Daten vorhanden, da das Feature frisch ist). SQLite: ``batch_alter_table``
baut die Tabelle neu und entfernt damit zugleich ``uq_mieter_name``.

Revision ID: 0032_mieter_split_name
Revises: 0031_mieters_and_assignments
Create Date: 2026-06-15 13:00:00+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0032_mieter_split_name"
down_revision: str | None = "0031_mieters_and_assignments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("mieter", schema=None) as batch_op:
        batch_op.add_column(sa.Column("first_name", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("last_name", sa.String(length=80), nullable=True))
    # Bestehende Namen in den Nachnamen uebernehmen.
    op.execute("UPDATE mieter SET last_name = name WHERE last_name IS NULL")
    with op.batch_alter_table("mieter", schema=None) as batch_op:
        batch_op.alter_column("last_name", existing_type=sa.String(length=80), nullable=False)
        # Tabellen-Neuaufbau ohne die ``name``-Spalte entfernt auch uq_mieter_name.
        batch_op.drop_column("name")


def downgrade() -> None:
    with op.batch_alter_table("mieter", schema=None) as batch_op:
        batch_op.add_column(sa.Column("name", sa.String(length=120), nullable=True))
    op.execute(
        "UPDATE mieter SET name = TRIM(COALESCE(first_name || ' ', '') || last_name)"
    )
    with op.batch_alter_table("mieter", schema=None) as batch_op:
        batch_op.alter_column("name", existing_type=sa.String(length=120), nullable=False)
        batch_op.create_unique_constraint("uq_mieter_name", ["name"])
        batch_op.drop_column("last_name")
        batch_op.drop_column("first_name")
