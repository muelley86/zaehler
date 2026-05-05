"""Heating modular: heating_source-Spalte; oil/gas → heating umschreiben

Revision ID: 0011_heating_modular
Revises: 0010_delivery_at
Create Date: 2026-05-05 09:00:00

Strukturwechsel: ``MeterType.OIL`` und ``MeterType.GAS`` werden in einen
gemeinsamen Top-Level-Typ ``HEATING`` zusammengefasst, der einen
optionalen ``heating_source`` (oil/gas/wood_chips/wood/district_heat)
trägt. Damit ist Wärme als modulare Messstelle modelliert; die konkreten
Register werden vom User pro Messstelle frei zusammengestellt
(siehe ``MeasuringPointCreate.registers``).

Bestehende oil- und gas-Messstellen werden auf den neuen Typ migriert,
ihre Register bleiben erhalten (oil.hours, oil.tank, 7.8.0 etc.).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_heating_modular"
down_revision: str | None = "0010_delivery_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("measuring_point") as batch:
        batch.add_column(sa.Column("heating_source", sa.String(length=20), nullable=True))

    op.execute("UPDATE measuring_point SET type='heating', heating_source='oil' WHERE type='oil'")
    op.execute("UPDATE measuring_point SET type='heating', heating_source='gas' WHERE type='gas'")


def downgrade() -> None:
    op.execute(
        "UPDATE measuring_point SET type='oil', heating_source=NULL "
        "WHERE type='heating' AND heating_source='oil'"
    )
    op.execute(
        "UPDATE measuring_point SET type='gas', heating_source=NULL "
        "WHERE type='heating' AND heating_source='gas'"
    )
    with op.batch_alter_table("measuring_point") as batch:
        batch.drop_column("heating_source")
