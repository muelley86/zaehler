"""QR-Token-Verheiratung: Tabelle qr_token.

Revision ID: 0017_qr_token
Revises: 0016_user_mp_access
Create Date: 2026-05-06 15:00:00

Anonyme QR-Codes, die einer Messstelle zugeordnet werden können (Feature A).
Token-String ist 8 Zeichen Crockford-Base32, durch UNIQUE-Index gesichert.
``measuring_point_id`` ist initial NULL (unzugewiesen) und wird beim
``assign``-Endpoint gesetzt; ON DELETE SET NULL, damit bei MP-Löschung der
Token erhalten bleibt und neu zugeordnet werden kann.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_qr_token"
down_revision: str | None = "0016_user_mp_access"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "qr_token",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token", sa.String(length=16), nullable=False),
        sa.Column(
            "measuring_point_id",
            sa.Integer(),
            sa.ForeignKey("measuring_point.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id"),
            nullable=False,
        ),
        sa.Column("assigned_at", sa.DateTime(), nullable=True),
        sa.Column(
            "assigned_by_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_qr_token_token",
        "qr_token",
        ["token"],
        unique=True,
    )
    # Sekundärer Index für die häufige Filter-Query "alle Tokens dieser MP"
    op.create_index(
        "ix_qr_token_measuring_point_id",
        "qr_token",
        ["measuring_point_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_qr_token_measuring_point_id", table_name="qr_token")
    op.drop_index("ix_qr_token_token", table_name="qr_token")
    op.drop_table("qr_token")
