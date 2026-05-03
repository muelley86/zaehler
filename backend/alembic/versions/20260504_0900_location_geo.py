"""Geo-Koordinaten an Standorten.

Revision ID: 0007_location_geo
Revises: 0006_totp_2fa
Create Date: 2026-05-04

Zwei optionale Float-Spalten am ``location``-Tisch: ``latitude`` und
``longitude``. Reicht für GPS-Genauigkeit (~6 Nachkommastellen ≈ 10 cm).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_location_geo"
down_revision: str | None = "0006_totp_2fa"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("location") as batch:
        batch.add_column(sa.Column("latitude", sa.Float(), nullable=True))
        batch.add_column(sa.Column("longitude", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("location") as batch:
        batch.drop_column("longitude")
        batch.drop_column("latitude")
