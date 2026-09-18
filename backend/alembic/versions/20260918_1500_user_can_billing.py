"""Benutzer-Merkmal ``can_billing``: darf das Abrechnungsmodul bedienen.

Revision ID: 0041_user_can_billing
Revises: 0040_billing_transfer
Create Date: 2026-09-18 15:00:00

Nur eine neue Spalte an ``user`` (Muster wie ``can_assign_qr_tokens``); Admins haben das Recht
implizit, alle bestehenden Benutzer starten ohne das Merkmal.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0041_user_can_billing"
down_revision: str | None = "0040_billing_transfer"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("can_billing", sa.Boolean(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("user", "can_billing")
