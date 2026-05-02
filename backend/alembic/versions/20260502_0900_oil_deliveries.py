"""oil heating: register.accepts_deliveries + delivery table

Revision ID: 0003_oil_deliveries
Revises: 0002_locations
Create Date: 2026-05-02 09:00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_oil_deliveries"
down_revision: str | None = "0002_locations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("register") as batch:
        batch.add_column(
            sa.Column(
                "accepts_deliveries",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )

    op.create_table(
        "delivery",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "register_id",
            sa.Integer(),
            sa.ForeignKey("register.id", ondelete="CASCADE", name="fk_delivery_register"),
            nullable=False,
        ),
        sa.Column("delivery_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.String(length=32), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="SET NULL", name="fk_delivery_user"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_delivery_register_id", "delivery", ["register_id"])
    op.create_index("ix_delivery_delivery_date", "delivery", ["delivery_date"])
    op.create_index("ix_delivery_created_by_user_id", "delivery", ["created_by_user_id"])


def downgrade() -> None:
    op.drop_index("ix_delivery_created_by_user_id", table_name="delivery")
    op.drop_index("ix_delivery_delivery_date", table_name="delivery")
    op.drop_index("ix_delivery_register_id", table_name="delivery")
    op.drop_table("delivery")
    with op.batch_alter_table("register") as batch:
        batch.drop_column("accepts_deliveries")
