"""suppliers_and_assignments

Zwei neue Tabellen fuer das Lieferanten-Konzept — 1:1-Spiegel des
Eigentuemer-Konzepts (Migration 0022):

- ``supplier``: zentraler Lieferanten-Stammdatensatz (Name, Adresse,
  Kontakt, Steuer-IDs, Notiz).
- ``supplier_assignment``: periodisierte Zuordnung MP → Supplier mit
  ``[valid_from, valid_to)``. Genau ein offenes Assignment pro MP zaehlt
  als aktueller Lieferant. Bei einem Wechsel wird die offene Periode
  geschlossen und eine neue angelegt — Historie bleibt erhalten.

Cascade:
- ``measuring_point.id`` → ``supplier_assignment``: CASCADE.
- ``supplier.id`` → ``supplier_assignment``: SET NULL.

Revision ID: 0030_suppliers_and_assignments
Revises: 0029_virtual_measuring_points
Create Date: 2026-06-12 11:00:00+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0030_suppliers_and_assignments"
down_revision: str | None = "0029_virtual_measuring_points"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "supplier",
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
        sa.UniqueConstraint("name", name="uq_supplier_name"),
    )
    op.create_table(
        "supplier_assignment",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("measuring_point_id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["measuring_point_id"],
            ["measuring_point.id"],
            name="fk_supplier_assignment_mp",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_id"],
            ["supplier.id"],
            name="fk_supplier_assignment_supplier",
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_supplier_assignment_mp",
        "supplier_assignment",
        ["measuring_point_id"],
        unique=False,
    )
    op.create_index(
        "ix_supplier_assignment_supplier",
        "supplier_assignment",
        ["supplier_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_supplier_assignment_supplier", table_name="supplier_assignment")
    op.drop_index("ix_supplier_assignment_mp", table_name="supplier_assignment")
    op.drop_table("supplier_assignment")
    op.drop_table("supplier")
