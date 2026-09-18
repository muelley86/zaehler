"""Abrechnungskreise und -positionen; Eigentuemer-Merkmal interne Umlage.

Revision ID: 0037_billing_circle
Revises: 0036_kostenstelle_assignment
Create Date: 2026-09-17 18:00:00

Neue Tabellen ``billing_circle`` und ``billing_position`` (siehe ``models/billing_circle.py``) und
``owner.internal_allocation``. Die Owner-Spalte wird unter SQLite per nativem ``ALTER TABLE`` angelegt
bzw. entfernt - kein Tabellen-Neuaufbau, der bei ``foreign_keys=ON`` die ``owner_assignment``-Zuordnungen
per ON DELETE SET NULL entkoppeln wuerde (vgl. 0035).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0037_billing_circle"
down_revision: str | None = "0036_kostenstelle_assignment"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _is_sqlite() -> bool:
    return op.get_bind().dialect.name == "sqlite"


def upgrade() -> None:
    op.create_table(
        "billing_circle",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(16), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("rechnungsleger", sa.String(120), nullable=False),
        sa.Column("abnahmestelle", sa.String(64), nullable=False),
        sa.Column("marktlokation", sa.String(11), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "billing_position",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("circle_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("measuring_point_id", sa.Integer(), nullable=True),
        sa.Column("parent_position_id", sa.Integer(), nullable=True),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("kostenstelle", sa.Integer(), nullable=True),
        sa.Column("invoice_line", sa.String(120), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["circle_id"], ["billing_circle.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["measuring_point_id"], ["measuring_point.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["parent_position_id"], ["billing_position.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["owner.id"], ondelete="SET NULL"),
    )
    for column in ("circle_id", "measuring_point_id", "parent_position_id", "owner_id"):
        op.create_index(f"ix_billing_position_{column}", "billing_position", [column])
    if _is_sqlite():
        op.execute("ALTER TABLE owner ADD COLUMN internal_allocation BOOLEAN NOT NULL DEFAULT 0")
    else:
        op.add_column(
            "owner",
            sa.Column(
                "internal_allocation", sa.Boolean(), nullable=False, server_default=sa.false()
            ),
        )


def downgrade() -> None:
    if _is_sqlite():
        raw = op.get_bind().exec_driver_sql("select sqlite_version()").scalar_one()
        if tuple(int(t) for t in raw.split(".")) < (3, 35):
            raise RuntimeError(f"SQLite {raw} kann DROP COLUMN nicht ohne Neuaufbau (>= 3.35)")
        op.execute("ALTER TABLE owner DROP COLUMN internal_allocation")
    else:
        op.drop_column("owner", "internal_allocation")
    for column in ("circle_id", "measuring_point_id", "parent_position_id", "owner_id"):
        op.drop_index(f"ix_billing_position_{column}", "billing_position")
    op.drop_table("billing_position")
    op.drop_table("billing_circle")
