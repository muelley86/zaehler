"""Uebertragung nach Agrarmonitor je Lauf und Empfaenger.

Revision ID: 0040_billing_transfer
Revises: 0039_billing_run
Create Date: 2026-09-18 09:00:00

Nur eine neue Tabelle (siehe ``models/billing_transfer.py``); bestehende Tabellen bleiben unberuehrt.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0040_billing_transfer"
down_revision: str | None = "0039_billing_run"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "billing_transfer",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("owner_name", sa.String(200), nullable=False),
        sa.Column("belegnummer", sa.String(64), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("transferred_at", sa.DateTime(), nullable=False),
        sa.Column("transferred_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["billing_run.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["owner.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["transferred_by"], ["user.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("run_id", "owner_name", name="uq_billing_transfer_owner"),
    )
    op.create_index("ix_billing_transfer_run_id", "billing_transfer", ["run_id"])


def downgrade() -> None:
    op.drop_index("ix_billing_transfer_run_id", "billing_transfer")
    op.drop_table("billing_transfer")
