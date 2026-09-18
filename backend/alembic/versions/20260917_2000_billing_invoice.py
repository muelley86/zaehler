"""Eingangsrechnungen der Stromabrechnung (Kopf, Positionen, Original-PDF).

Revision ID: 0038_billing_invoice
Revises: 0037_billing_circle
Create Date: 2026-09-17 20:00:00

Nur neue Tabellen (siehe ``models/billing_invoice.py``); bestehende Tabellen bleiben unberuehrt.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0038_billing_invoice"
down_revision: str | None = "0037_billing_circle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "billing_invoice",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("circle_id", sa.Integer(), nullable=False),
        sa.Column("nummer", sa.String(40), nullable=False),
        sa.Column("datum", sa.Date(), nullable=False),
        sa.Column("aid", sa.String(64), nullable=False),
        sa.Column("marktlokation", sa.String(11), nullable=False),
        sa.Column("period_from", sa.Date(), nullable=False),
        sa.Column("period_to", sa.Date(), nullable=False),
        sa.Column("period_month", sa.String(7), nullable=False),
        sa.Column("verbrauch_kwh", sa.String(32), nullable=False),
        sa.Column("leistungsspitze_kw", sa.String(32), nullable=False),
        sa.Column("betrag_netto", sa.String(32), nullable=False),
        sa.Column("hinweise", sa.JSON(), nullable=False),
        sa.Column("pdf_sha256", sa.String(64), nullable=False, unique=True),
        sa.Column("pdf_size", sa.Integer(), nullable=False),
        sa.Column("pdf_filename", sa.String(255), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["circle_id"], ["billing_circle.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["user.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("circle_id", "nummer", name="uq_billing_invoice_nummer"),
        sa.UniqueConstraint("circle_id", "period_month", name="uq_billing_invoice_month"),
    )
    op.create_index("ix_billing_invoice_circle_id", "billing_invoice", ["circle_id"])
    op.create_table(
        "billing_invoice_position",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("abschnitt", sa.String(60), nullable=False),
        sa.Column("zeitraum", sa.String(40), nullable=False),
        sa.Column("menge", sa.String(32), nullable=True),
        sa.Column("preis_ct", sa.String(32), nullable=True),
        sa.Column("betrag", sa.String(32), nullable=False),
        sa.Column("kategorie", sa.String(32), nullable=True),
        sa.ForeignKeyConstraint(["invoice_id"], ["billing_invoice.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_billing_invoice_position_invoice_id", "billing_invoice_position", ["invoice_id"]
    )
    op.create_table(
        "billing_invoice_file",
        sa.Column("invoice_id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.ForeignKeyConstraint(["invoice_id"], ["billing_invoice.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("billing_invoice_file")
    op.drop_index("ix_billing_invoice_position_invoice_id", "billing_invoice_position")
    op.drop_table("billing_invoice_position")
    op.drop_index("ix_billing_invoice_circle_id", "billing_invoice")
    op.drop_table("billing_invoice")
