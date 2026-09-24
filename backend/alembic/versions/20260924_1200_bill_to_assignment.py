"""Abrechnen an Eigentuemer oder Mieter je Messstelle (Tabelle bill_to_assignment).

Revision ID: 0047_bill_to_assignment
Revises: 0046_mieter_is_company
Create Date: 2026-09-24 12:00:00

Periodisiert wie ``kostenstelle_assignment`` (halboffenes Intervall, max. eine offene Periode
je MP). Keine Datenuebernahme: ohne Periode gilt "Eigentuemer" (bisheriges Verhalten).

``billing_run_line.recipient_kind`` haelt im Snapshot fest, ob der Empfaenger (``owner_name``)
ein Eigentuemer oder ein Mieter ist. Bewusst ``add_column``/``drop_column`` ohne Fremdschluessel
statt ``batch_alter_table`` (siehe 0035).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0047_bill_to_assignment"
down_revision: str | None = "0046_mieter_is_company"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bill_to_assignment",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("measuring_point_id", sa.Integer(), nullable=False),
        sa.Column("bill_to", sa.String(16), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["measuring_point_id"], ["measuring_point.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_bill_to_assignment_measuring_point_id",
        "bill_to_assignment",
        ["measuring_point_id"],
    )
    # Partieller UNIQUE-Index wie 0036 (op.create_index quotet WHERE als Literal).
    op.execute(
        "CREATE UNIQUE INDEX uq_bill_to_assignment_open_per_mp "
        "ON bill_to_assignment (measuring_point_id) WHERE valid_to IS NULL"
    )
    op.add_column(
        "billing_run_line",
        sa.Column("recipient_kind", sa.String(16), nullable=False, server_default="OWNER"),
    )


def downgrade() -> None:
    op.drop_column("billing_run_line", "recipient_kind")
    op.execute("DROP INDEX uq_bill_to_assignment_open_per_mp")
    op.drop_index("ix_bill_to_assignment_measuring_point_id", "bill_to_assignment")
    op.drop_table("bill_to_assignment")
