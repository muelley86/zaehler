"""reading.reading_at (datetime) replaces reading_date

Revision ID: 0005_reading_at
Revises: 0004_tank_capacity
Create Date: 2026-05-02 12:00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_reading_at"
down_revision: str | None = "0004_tank_capacity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1) Spalte reading_at (nullable) hinzufügen
    with op.batch_alter_table("reading") as batch:
        batch.add_column(sa.Column("reading_at", sa.DateTime(), nullable=True))

    # 2) Bestehende reading_date in reading_at übernehmen (Mittag, lokal)
    op.execute(
        "UPDATE reading SET reading_at = datetime(reading_date || ' 12:00:00') "
        "WHERE reading_at IS NULL"
    )

    # 3) Spalten endgültig: reading_at NOT NULL, reading_date weg, neuer UNIQUE-Constraint
    with op.batch_alter_table("reading") as batch:
        batch.alter_column("reading_at", existing_type=sa.DateTime(), nullable=False)
        batch.drop_constraint("uq_reading_register_date", type_="unique")
        batch.create_unique_constraint("uq_reading_register_at", ["register_id", "reading_at"])
        batch.drop_index("ix_reading_reading_date")
        batch.create_index("ix_reading_reading_at", ["reading_at"])
        batch.drop_column("reading_date")


def downgrade() -> None:
    with op.batch_alter_table("reading") as batch:
        batch.add_column(sa.Column("reading_date", sa.Date(), nullable=True))
    op.execute("UPDATE reading SET reading_date = date(reading_at)")
    with op.batch_alter_table("reading") as batch:
        batch.alter_column("reading_date", existing_type=sa.Date(), nullable=False)
        batch.drop_index("ix_reading_reading_at")
        batch.create_index("ix_reading_reading_date", ["reading_date"])
        batch.drop_constraint("uq_reading_register_at", type_="unique")
        batch.create_unique_constraint("uq_reading_register_date", ["register_id", "reading_date"])
        batch.drop_column("reading_at")
