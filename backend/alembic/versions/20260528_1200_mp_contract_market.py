"""mp_contract_market

Zwei optionale Stammdaten-Spalten an ``measuring_point``:

- ``contract_number`` (Vertragsnummer/Kundennr. beim Versorger) — relevant
  fuer Strom- und Wasser-Messstellen, Validation im Schema.
- ``market_location`` (MaLo-ID, 11-stellig) — relevant nur fuer Strom.

Beide ohne UNIQUE-Constraint (Bestandsdaten-Import waere sonst fragil; die
fachliche Eindeutigkeit ist eine Verantwortung des Benutzers).

Revision ID: 0021_mp_contract_market
Revises: 0020_main_location
Create Date: 2026-05-28 12:00:00+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_mp_contract_market"
down_revision: str | None = "0020_main_location"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("measuring_point", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("contract_number", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column("market_location", sa.String(length=64), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("measuring_point", schema=None) as batch_op:
        batch_op.drop_column("market_location")
        batch_op.drop_column("contract_number")
