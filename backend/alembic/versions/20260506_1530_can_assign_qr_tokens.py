"""User-Spalte can_assign_qr_tokens (Feature C).

Revision ID: 0018_can_assign_qr_tokens
Revises: 0017_qr_token
Create Date: 2026-05-06 15:30:00

Pro-Recorder-Flag, das festlegt, ob er unzugeordnete QR-Tokens selbst einer
MP zuweisen darf. Default ist False — Admin schaltet pro Mitarbeiter explizit
frei. Für Admin-User ist der Wert irrelevant (impliziter Vollzugriff).

NOT NULL mit ``server_default='0'`` (False), damit bestehende User-Zeilen
beim Upgrade ohne Backfill auskommen.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_can_assign_qr_tokens"
down_revision: str | None = "0017_qr_token"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("user") as batch:
        batch.add_column(
            sa.Column(
                "can_assign_qr_tokens",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("user") as batch:
        batch.drop_column("can_assign_qr_tokens")
