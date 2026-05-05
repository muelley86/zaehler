"""delivery.delivery_at (datetime) replaces delivery_date

Revision ID: 0010_delivery_at
Revises: 0009_transformer_factor
Create Date: 2026-05-04 20:00:00

Delivery hatte bisher nur ein Datum. Damit Lieferung und Reading am
selben Tag in der korrekten Reihenfolge in den Verbrauch einfließen
können, brauchen wir den Zeitstempel — analog zur Migration 0005, die
``reading.reading_date`` durch ``reading_at`` ersetzt hat.

Existierende Lieferungen bekommen ``12:00:00`` lokal (Mittag), das ist
der gleiche Default wie damals bei den Readings.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_delivery_at"
down_revision: str | None = "0009_transformer_factor"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("delivery") as batch:
        batch.add_column(sa.Column("delivery_at", sa.DateTime(), nullable=True))

    op.execute(
        "UPDATE delivery SET delivery_at = datetime(delivery_date || ' 12:00:00') "
        "WHERE delivery_at IS NULL"
    )

    with op.batch_alter_table("delivery") as batch:
        batch.alter_column("delivery_at", existing_type=sa.DateTime(), nullable=False)
        batch.drop_index("ix_delivery_delivery_date")
        batch.create_index("ix_delivery_delivery_at", ["delivery_at"])
        batch.drop_column("delivery_date")


def downgrade() -> None:
    with op.batch_alter_table("delivery") as batch:
        batch.add_column(sa.Column("delivery_date", sa.Date(), nullable=True))
    op.execute("UPDATE delivery SET delivery_date = date(delivery_at)")
    with op.batch_alter_table("delivery") as batch:
        batch.alter_column("delivery_date", existing_type=sa.Date(), nullable=False)
        batch.drop_index("ix_delivery_delivery_at")
        batch.create_index("ix_delivery_delivery_date", ["delivery_date"])
        batch.drop_column("delivery_at")
