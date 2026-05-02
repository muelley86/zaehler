"""locations + measuring_point.location_id

Revision ID: 0002_locations
Revises: 0001_initial
Create Date: 2026-05-01 20:00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_locations"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "location",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    with op.batch_alter_table("measuring_point") as batch:
        batch.add_column(
            sa.Column(
                "location_id",
                sa.Integer(),
                sa.ForeignKey(
                    "location.id",
                    ondelete="SET NULL",
                    name="fk_measuring_point_location",
                ),
                nullable=True,
            )
        )
        batch.drop_column("location")
    op.create_index("ix_measuring_point_location_id", "measuring_point", ["location_id"])


def downgrade() -> None:
    op.drop_index("ix_measuring_point_location_id", table_name="measuring_point")
    with op.batch_alter_table("measuring_point") as batch:
        batch.add_column(sa.Column("location", sa.String(length=120), nullable=True))
        batch.drop_column("location_id")
    op.drop_table("location")
