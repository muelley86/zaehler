"""Standort fuer virtuelle (verrechnete) Messstellen.

Revision ID: 0034_virtual_mp_location
Revises: 0033_assignment_open_unique
Create Date: 2026-09-09 10:00:00

Verrechnete Messstellen bekommen wie echte Messstellen einen optionalen
Zaehlerstandort (``virtual_measuring_point.location_id``). Der Hauptstandort
wird — exakt wie bei ``MeasuringPoint`` — nicht gespeichert, sondern zur
Laufzeit ueber ``location.main_location_id`` abgeleitet. Wird der Standort
geloescht, bleibt die verrechnete Messstelle bestehen (``ON DELETE SET NULL``).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0034_virtual_mp_location"
down_revision: str | None = "0033_assignment_open_unique"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("virtual_measuring_point", schema=None) as batch_op:
        batch_op.add_column(sa.Column("location_id", sa.Integer(), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_virtual_measuring_point_location_id"),
            ["location_id"],
            unique=False,
        )
        batch_op.create_foreign_key(
            "fk_virtual_measuring_point_location_id",
            "location",
            ["location_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("virtual_measuring_point", schema=None) as batch_op:
        batch_op.drop_constraint("fk_virtual_measuring_point_location_id", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_virtual_measuring_point_location_id"))
        batch_op.drop_column("location_id")
