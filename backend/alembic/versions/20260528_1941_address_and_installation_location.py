"""address_and_installation_location

- ``location`` bekommt drei optionale Adress-Spalten (``address_street``,
  ``address_postcode``, ``address_city``) zusaetzlich zu den bestehenden
  Geo-Koordinaten.
- ``measuring_point`` bekommt ``installation_location`` (Freitext) fuer die
  genaue Position am Standort (z. B. „1. Stock, Wohnung 4b").

Revision ID: 0023_address_and_installation_location
Revises: 0022_owners_and_assignments
Create Date: 2026-05-28 19:41:00+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0023_address_and_installation_location"
down_revision: str | None = "0022_owners_and_assignments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("location", schema=None) as batch_op:
        batch_op.add_column(sa.Column("address_street", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("address_postcode", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("address_city", sa.String(length=120), nullable=True))
    with op.batch_alter_table("measuring_point", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("installation_location", sa.String(length=200), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("measuring_point", schema=None) as batch_op:
        batch_op.drop_column("installation_location")
    with op.batch_alter_table("location", schema=None) as batch_op:
        batch_op.drop_column("address_city")
        batch_op.drop_column("address_postcode")
        batch_op.drop_column("address_street")
