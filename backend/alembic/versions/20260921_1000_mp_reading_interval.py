"""Ableseintervall je Messstelle (Tage), Default 35.

Revision ID: 0043_mp_reading_interval
Revises: 0042_user_last_totp_counter
Create Date: 2026-09-21 10:00:00

``reading_interval_days`` ist der Soll-Abstand zwischen zwei Ablesungen. Das
Frontend markiert eine Messstelle als faellig, wenn ihre letzte Ablesung
aelter ist. ``NOT NULL`` mit ``server_default='35'``: SQLite fuellt beim
``ADD COLUMN`` alle Bestandszeilen mit dem Default — alle vorhandenen
Messstellen starten also mit 35 Tagen.

Downgrade nutzt bewusst ``op.drop_column`` ohne ``batch_alter_table``:
``measuring_point`` hat Kinder mit ``ON DELETE CASCADE`` (physical_meter, …),
und der Tabellen-Neuaufbau von ``batch_alter_table`` wuerde die bei
``PRAGMA foreign_keys=ON`` mitloeschen (siehe CLAUDE.md und Migration 0035).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0043_mp_reading_interval"
down_revision: str | None = "0042_user_last_totp_counter"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "measuring_point",
        sa.Column("reading_interval_days", sa.Integer(), nullable=False, server_default="35"),
    )


def downgrade() -> None:
    op.drop_column("measuring_point", "reading_interval_days")
