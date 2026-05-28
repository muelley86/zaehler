"""owners_and_assignments

Zwei neue Tabellen fuer das Eigentuemer-Konzept:

- ``owner``: zentraler Eigentuemer-Stammdatensatz (Name, Adresse, Kontakt,
  Steuer-IDs, Notiz).
- ``owner_assignment``: periodisierte Zuordnung MP → Owner mit
  ``[valid_from, valid_to)``. Genau ein offenes Assignment pro MP zaehlt
  als aktueller Eigentuemer. Bei einem Wechsel wird die offene Periode
  geschlossen und eine neue angelegt — Historie bleibt erhalten.

Cascade:
- ``measuring_point.id`` → ``owner_assignment``: CASCADE.
- ``owner.id`` → ``owner_assignment``: SET NULL.

Revision ID: 0022_owners_and_assignments
Revises: 0021_mp_contract_market
Create Date: 2026-05-28 12:28:00+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_owners_and_assignments"
down_revision: str | None = "0021_mp_contract_market"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "owner",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("address_street", sa.String(length=200), nullable=True),
        sa.Column("address_postcode", sa.String(length=20), nullable=True),
        sa.Column("address_city", sa.String(length=120), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("vat_id", sa.String(length=32), nullable=True),
        sa.Column("tax_id", sa.String(length=32), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("name", name="uq_owner_name"),
    )
    op.create_table(
        "owner_assignment",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("measuring_point_id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["measuring_point_id"],
            ["measuring_point.id"],
            name="fk_owner_assignment_mp",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["owner.id"],
            name="fk_owner_assignment_owner",
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_owner_assignment_mp",
        "owner_assignment",
        ["measuring_point_id"],
        unique=False,
    )
    op.create_index(
        "ix_owner_assignment_owner",
        "owner_assignment",
        ["owner_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_owner_assignment_owner", table_name="owner_assignment")
    op.drop_index("ix_owner_assignment_mp", table_name="owner_assignment")
    op.drop_table("owner_assignment")
    op.drop_table("owner")
