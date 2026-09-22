"""Notizen zu Messstellen.

Revision ID: 0045_measuring_point_note
Revises: 0044_user_dashboard_layout
Create Date: 2026-09-22 11:00:00

Nur eine neue Tabelle (siehe ``models/measuring_point_note.py``); bestehende Tabellen bleiben
unberuehrt.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0045_measuring_point_note"
down_revision: str | None = "0044_user_dashboard_layout"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "measuring_point_note",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("measuring_point_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(500), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["measuring_point_id"], ["measuring_point.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_measuring_point_note_measuring_point_id",
        "measuring_point_note",
        ["measuring_point_id"],
    )
    op.create_index(
        "ix_measuring_point_note_created_by_user_id",
        "measuring_point_note",
        ["created_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_measuring_point_note_created_by_user_id", "measuring_point_note")
    op.drop_index("ix_measuring_point_note_measuring_point_id", "measuring_point_note")
    op.drop_table("measuring_point_note")
