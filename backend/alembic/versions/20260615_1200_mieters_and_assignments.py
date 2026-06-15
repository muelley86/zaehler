"""mieters_and_assignments

Zwei neue Tabellen fuer das Mieter-Konzept — 1:1-Spiegel des Eigentuemer-/
Lieferanten-Konzepts (Migrationen 0022 / 0030), aber ohne Steuer-IDs:

- ``mieter``: zentraler Mieter-Stammdatensatz (Name, Adresse, Kontakt, Notiz).
- ``mieter_assignment``: periodisierte, optionale Zuordnung MP → Mieter mit
  ``[valid_from, valid_to)``. Hoechstens ein offenes Assignment pro MP zaehlt
  als aktueller Mieter. Bei einem Wechsel wird die offene Periode geschlossen
  und eine neue angelegt — Historie bleibt erhalten.

Cascade:
- ``measuring_point.id`` → ``mieter_assignment``: CASCADE.
- ``mieter.id`` → ``mieter_assignment``: SET NULL.

Revision ID: 0031_mieters_and_assignments
Revises: 0030_suppliers_and_assignments
Create Date: 2026-06-15 12:00:00+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0031_mieters_and_assignments"
down_revision: str | None = "0030_suppliers_and_assignments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mieter",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("address_street", sa.String(length=200), nullable=True),
        sa.Column("address_postcode", sa.String(length=20), nullable=True),
        sa.Column("address_city", sa.String(length=120), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("name", name="uq_mieter_name"),
    )
    op.create_table(
        "mieter_assignment",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("measuring_point_id", sa.Integer(), nullable=False),
        sa.Column("mieter_id", sa.Integer(), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["measuring_point_id"],
            ["measuring_point.id"],
            name="fk_mieter_assignment_mp",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["mieter_id"],
            ["mieter.id"],
            name="fk_mieter_assignment_mieter",
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_mieter_assignment_mp",
        "mieter_assignment",
        ["measuring_point_id"],
        unique=False,
    )
    op.create_index(
        "ix_mieter_assignment_mieter",
        "mieter_assignment",
        ["mieter_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_mieter_assignment_mieter", table_name="mieter_assignment")
    op.drop_index("ix_mieter_assignment_mp", table_name="mieter_assignment")
    op.drop_table("mieter_assignment")
    op.drop_table("mieter")
