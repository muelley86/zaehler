"""TOTP-2FA: User-Spalten + BackupCode + PendingTotpChallenge.

Revision ID: 0006_totp_2fa
Revises: 0005_reading_at
Create Date: 2026-05-03

* User: ``totp_enabled`` (Bool, default False), ``totp_secret`` (Str, nullable).
* Neue Tabellen ``backup_code`` (single-use Recovery-Codes, hashed) und
  ``pending_totp_challenge`` (Zwischenschritt zwischen Username/Passwort und
  TOTP im Login-Flow).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_totp_2fa"
down_revision: str | None = "0005_reading_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("user") as batch:
        batch.add_column(
            sa.Column(
                "totp_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch.add_column(sa.Column("totp_secret", sa.String(length=64), nullable=True))

    op.create_table(
        "backup_code",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("code_hash", sa.String(length=128), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("code_hash"),
    )
    op.create_index("ix_backup_code_user_id", "backup_code", ["user_id"])

    op.create_table(
        "pending_totp_challenge",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_pending_totp_challenge_user_id", "pending_totp_challenge", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_pending_totp_challenge_user_id", table_name="pending_totp_challenge")
    op.drop_table("pending_totp_challenge")
    op.drop_index("ix_backup_code_user_id", table_name="backup_code")
    op.drop_table("backup_code")
    with op.batch_alter_table("user") as batch:
        batch.drop_column("totp_secret")
        batch.drop_column("totp_enabled")
