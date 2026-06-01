"""report_config

Gespeicherte, geteilte Auswertungs-Konfigurationen (Dimension, Granularitaet,
Zeitraum-Definition, Filter). Enum-Spalten als VARCHAR (``native_enum=False``,
gespeichert wird der Enum-Wert in lowercase). ``filters`` als JSON.

Revision ID: 0026_report_config
Revises: 0025_mp_kostenstelle
Create Date: 2026-06-01 09:00:00+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0026_report_config"
down_revision: str | None = "0025_mp_kostenstelle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "report_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("dimension", sa.String(length=20), nullable=False),
        sa.Column("granularity", sa.String(length=10), nullable=False),
        sa.Column("period_kind", sa.String(length=20), nullable=False),
        sa.Column("from_date", sa.Date(), nullable=True),
        sa.Column("to_date", sa.Date(), nullable=True),
        sa.Column("filters", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
    )
    op.create_index("ix_report_config_name", "report_config", ["name"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_report_config_name", table_name="report_config")
    op.drop_table("report_config")
