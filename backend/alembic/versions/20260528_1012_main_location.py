"""main_location

Tabelle ``main_location`` (Hauptstandort als logische Klammer ueber
Zaehlerstandorten) sowie FK-Spalte ``location.main_location_id`` mit
``ON DELETE SET NULL`` — wird der Hauptstandort geloescht, behalten wir
den Zaehlerstandort und setzen die Referenz auf NULL.

Revision ID: 0020_main_location
Revises: 0019_reading_photo_gps
Create Date: 2026-05-28 10:12:23.718524+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020_main_location"
down_revision: str | None = "0019_reading_photo_gps"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "main_location",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("name", name="uq_main_location_name"),
    )
    with op.batch_alter_table("location", schema=None) as batch_op:
        batch_op.add_column(sa.Column("main_location_id", sa.Integer(), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_location_main_location_id"),
            ["main_location_id"],
            unique=False,
        )
        batch_op.create_foreign_key(
            "fk_location_main_location_id",
            "main_location",
            ["main_location_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("location", schema=None) as batch_op:
        batch_op.drop_constraint("fk_location_main_location_id", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_location_main_location_id"))
        batch_op.drop_column("main_location_id")
    op.drop_table("main_location")
