"""Abrechnungslaeufe der Stromabrechnung (Lauf je Kreis/Monat/Version, Zeilen-Snapshot).

Revision ID: 0039_billing_run
Revises: 0038_billing_invoice
Create Date: 2026-09-17 22:00:00

Nur neue Tabellen (siehe ``models/billing_run.py``); bestehende Tabellen bleiben unberuehrt.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0039_billing_run"
down_revision: str | None = "0038_billing_invoice"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _decimal(name: str, nullable: bool = True) -> sa.Column[Any]:
    return sa.Column(name, sa.String(32), nullable=nullable)


def upgrade() -> None:
    op.create_table(
        "billing_run",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("circle_id", sa.Integer(), nullable=False),
        sa.Column("monat", sa.String(7), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        _decimal("zusatzkosten", nullable=False),
        _decimal("aufschlag_prozent", nullable=False),
        _decimal("aufschlag_ct", nullable=False),
        sa.Column("begruendung", sa.String(500), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("befunde_snapshot", sa.JSON(), nullable=False),
        sa.Column("befunde", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("finalized_at", sa.DateTime(), nullable=True),
        sa.Column("finalized_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["circle_id"], ["billing_circle.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["invoice_id"], ["billing_invoice.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["finalized_by"], ["user.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("circle_id", "monat", "version", name="uq_billing_run_version"),
    )
    op.create_index("ix_billing_run_circle_id", "billing_run", ["circle_id"])
    op.create_index("ix_billing_run_invoice_id", "billing_run", ["invoice_id"])
    # Partieller UNIQUE-Index wie 0036 (op.create_index quotet WHERE als Literal).
    op.execute(
        "CREATE UNIQUE INDEX uq_billing_run_entwurf ON billing_run (circle_id, monat) "
        "WHERE status = 'ENTWURF'"
    )
    op.create_table(
        "billing_run_line",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("position_id", sa.Integer(), nullable=True),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("parent_label", sa.String(120), nullable=True),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("owner_name", sa.String(200), nullable=True),
        sa.Column("internal_allocation", sa.Boolean(), nullable=False),
        sa.Column("kostenstelle", sa.Integer(), nullable=True),
        sa.Column("mieter_name", sa.String(200), nullable=True),
        sa.Column("invoice_line", sa.String(200), nullable=True),
        sa.Column("measuring_point_id", sa.Integer(), nullable=True),
        sa.Column("measuring_point_name", sa.String(200), nullable=True),
        sa.Column("serial_numbers", sa.String(300), nullable=False),
        sa.Column("transformer_factor", sa.Integer(), nullable=True),
        _decimal("stand_alt"),
        sa.Column("stand_alt_art", sa.String(16), nullable=True),
        sa.Column("stand_alt_abstand", sa.Integer(), nullable=True),
        _decimal("stand_neu"),
        sa.Column("stand_neu_art", sa.String(16), nullable=True),
        sa.Column("stand_neu_abstand", sa.Integer(), nullable=True),
        _decimal("korrektur_kwh"),
        sa.Column("korrektur_note", sa.String(1000), nullable=True),
        _decimal("manual_stand_alt"),
        _decimal("manual_stand_neu"),
        _decimal("manual_korrektur_kwh"),
        sa.Column("manual_note", sa.String(500), nullable=True),
        _decimal("kwh"),
        _decimal("eur"),
        sa.Column("pruefung", sa.String(40), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["billing_run.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["position_id"], ["billing_position.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["owner_id"], ["owner.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["measuring_point_id"], ["measuring_point.id"], ondelete="SET NULL"
        ),
    )
    op.create_index("ix_billing_run_line_run_id", "billing_run_line", ["run_id"])
    op.create_index("ix_billing_run_line_position_id", "billing_run_line", ["position_id"])


def downgrade() -> None:
    op.drop_index("ix_billing_run_line_position_id", "billing_run_line")
    op.drop_index("ix_billing_run_line_run_id", "billing_run_line")
    op.drop_table("billing_run_line")
    op.execute("DROP INDEX uq_billing_run_entwurf")
    op.drop_index("ix_billing_run_invoice_id", "billing_run")
    op.drop_index("ix_billing_run_circle_id", "billing_run")
    op.drop_table("billing_run")
