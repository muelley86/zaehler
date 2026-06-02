"""monthly_consumption (materialisierte Monats-Statistik)

Abgeleitete, jederzeit neu berechenbare Monatsverbräuche je Register — die
Roh-``reading``-Zeilen bleiben die einzige Wahrheit. Befüllung über
``services.monthly_consumption.recompute_register`` (Tages-Interpolation,
``split_across_buckets``). Diese Migration legt nur die leere Tabelle an;
der Backfill läuft separat (CLI ``recompute-monthly`` / B2c), solange die
Lese-Pfade noch on-the-fly rechnen.

Revision ID: 0028_monthly_consumption
Revises: 0027_reading_photo_table
Create Date: 2026-06-02 18:00:00+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0028_monthly_consumption"
down_revision: str | None = "0027_reading_photo_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "monthly_consumption",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("register_id", sa.Integer(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("consumption", sa.Text(), nullable=False),
        sa.Column("unit", sa.String(length=16), nullable=False),
        sa.Column("obis_code", sa.String(length=16), nullable=False),
        sa.ForeignKeyConstraint(["register_id"], ["register.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "register_id", "period_start", name="uq_monthly_consumption_register_period"
        ),
    )
    op.create_index("ix_monthly_consumption_register_id", "monthly_consumption", ["register_id"])


def downgrade() -> None:
    op.drop_index("ix_monthly_consumption_register_id", table_name="monthly_consumption")
    op.drop_table("monthly_consumption")
