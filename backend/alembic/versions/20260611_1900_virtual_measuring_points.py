"""virtual_measuring_point + virtual_mp_component (verrechnete Messstellen)

Virtuelle Messstellen kombinieren die Verbrauchsreihen mehrerer echter
Messstellen arithmetisch (+/- je Komponente, Richtung Bezug/Einspeisung).
Es wird nichts materialisiert — die Tabellen tragen nur die Definition;
die Verrechnung passiert zur Laufzeit ueber die Verbrauchs-Pipeline.

Revision ID: 0029_virtual_measuring_points
Revises: 0028_monthly_consumption
Create Date: 2026-06-11 19:00:00+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0029_virtual_measuring_points"
down_revision: str | None = "0028_monthly_consumption"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "virtual_measuring_point",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "virtual_mp_component",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("virtual_measuring_point_id", sa.Integer(), nullable=False),
        sa.Column("measuring_point_id", sa.Integer(), nullable=False),
        sa.Column("direction", sa.String(length=12), nullable=False),
        sa.Column("sign", sa.Integer(), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["virtual_measuring_point_id"], ["virtual_measuring_point.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["measuring_point_id"], ["measuring_point.id"], ondelete="CASCADE"),
        sa.CheckConstraint("sign IN (-1, 1)", name="ck_virtual_mp_component_sign"),
        sa.UniqueConstraint(
            "virtual_measuring_point_id",
            "measuring_point_id",
            "direction",
            name="uq_virtual_mp_component",
        ),
    )
    op.create_index(
        "ix_virtual_mp_component_virtual_measuring_point_id",
        "virtual_mp_component",
        ["virtual_measuring_point_id"],
    )
    op.create_index(
        "ix_virtual_mp_component_measuring_point_id",
        "virtual_mp_component",
        ["measuring_point_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_virtual_mp_component_measuring_point_id", table_name="virtual_mp_component")
    op.drop_index(
        "ix_virtual_mp_component_virtual_measuring_point_id", table_name="virtual_mp_component"
    )
    op.drop_table("virtual_mp_component")
    op.drop_table("virtual_measuring_point")
