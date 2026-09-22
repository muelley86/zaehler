"""Mieter koennen Firmen sein.

Revision ID: 0046_mieter_is_company
Revises: 0045_measuring_point_note
Create Date: 2026-09-22 12:00:00

Nur eine neue Spalte ``mieter.is_company`` (Default ``false``). Bewusst ``add_column``/
``drop_column`` statt ``batch_alter_table``: ``mieter`` hat Kindtabellen, deren Daten ein
Tabellen-Neuaufbau unter SQLite gefaehrden wuerde (siehe Migration 0035).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0046_mieter_is_company"
down_revision: str | None = "0045_measuring_point_note"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "mieter",
        sa.Column("is_company", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("mieter", "is_company")
