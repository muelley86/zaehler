"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-01 09:00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=64), nullable=False, unique=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "force_password_change",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "session",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=128), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_session_user_id", "session", ["user_id"])

    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("diff", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_audit_log_user_id", "audit_log", ["user_id"])
    op.create_index("ix_audit_log_entity_id", "audit_log", ["entity_id"])

    op.create_table(
        "measuring_point",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("location", sa.String(length=120), nullable=True),
        sa.Column("is_bidirectional", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("has_dual_tariff", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "physical_meter",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "measuring_point_id",
            sa.Integer(),
            sa.ForeignKey("measuring_point.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("serial_number", sa.String(length=64), nullable=False),
        sa.Column("installed_at", sa.Date(), nullable=False),
        sa.Column("removed_at", sa.Date(), nullable=True),
        sa.Column("initial_values", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_physical_meter_measuring_point_id", "physical_meter", ["measuring_point_id"]
    )

    op.create_table(
        "register",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "physical_meter_id",
            sa.Integer(),
            sa.ForeignKey("physical_meter.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("obis_code", sa.String(length=16), nullable=False),
        sa.Column("label", sa.String(length=64), nullable=False),
        sa.Column("unit", sa.String(length=16), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("max_value", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("physical_meter_id", "obis_code", name="uq_register_meter_obis"),
    )
    op.create_index("ix_register_physical_meter_id", "register", ["physical_meter_id"])

    op.create_table(
        "reading",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "register_id",
            sa.Integer(),
            sa.ForeignKey("register.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("value", sa.String(length=32), nullable=False),
        sa.Column("reading_date", sa.Date(), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("photo_path", sa.String(length=255), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("register_id", "reading_date", name="uq_reading_register_date"),
    )
    op.create_index("ix_reading_register_id", "reading", ["register_id"])
    op.create_index("ix_reading_reading_date", "reading", ["reading_date"])
    op.create_index("ix_reading_created_by_user_id", "reading", ["created_by_user_id"])


def downgrade() -> None:
    op.drop_table("reading")
    op.drop_table("register")
    op.drop_table("physical_meter")
    op.drop_table("measuring_point")
    op.drop_table("audit_log")
    op.drop_table("session")
    op.drop_table("user")
