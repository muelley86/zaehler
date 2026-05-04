"""measuring_point.transformer_factor

Revision ID: 0009_transformer_factor
Revises: 0008_audit_indexes_and_cleanup
Create Date: 2026-05-04 17:00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_transformer_factor"
down_revision: str | None = "0008_audit_indexes_and_cleanup"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("measuring_point") as batch:
        batch.add_column(sa.Column("transformer_factor", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("measuring_point") as batch:
        batch.drop_column("transformer_factor")
