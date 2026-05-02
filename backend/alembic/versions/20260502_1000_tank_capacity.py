"""measuring_point.tank_capacity

Revision ID: 0004_tank_capacity
Revises: 0003_oil_deliveries
Create Date: 2026-05-02 10:00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_tank_capacity"
down_revision: str | None = "0003_oil_deliveries"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("measuring_point") as batch:
        batch.add_column(sa.Column("tank_capacity", sa.String(length=32), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("measuring_point") as batch:
        batch.drop_column("tank_capacity")
