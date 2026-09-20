"""TOTP-Replay-Schutz: hoechster eingeloester Zeitschritt je Benutzer.

Revision ID: 0042_user_last_totp_counter
Revises: 0041_user_can_billing
Create Date: 2026-09-20 18:05:00

Ein verifizierter TOTP-Code war bisher innerhalb seines Toleranzfensters
(+-1 Step = bis zu 90 s) mehrfach verwendbar. ``last_totp_counter`` haelt
den hoechsten bereits eingeloesten Zeitschritt fest; ``consume_totp``
akzeptiert nur noch streng groessere Werte.

Nullable ohne Default: bestehende Benutzer starten mit ``NULL`` und duerfen
damit den naechsten beliebigen gueltigen Code einloesen — ein Zwangs-Logout
waere fuer den Gewinn unverhaeltnismaessig.

Downgrade nutzt bewusst ``op.drop_column`` ohne ``batch_alter_table``:
``user`` hat Kinder mit ``ON DELETE CASCADE`` (session, backup_code,
user_measuring_point_access), und der Tabellen-Neuaufbau von
``batch_alter_table`` wuerde die bei ``PRAGMA foreign_keys=ON`` mitloeschen
(siehe CLAUDE.md und Migration 0035).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0042_user_last_totp_counter"
down_revision: str | None = "0041_user_can_billing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("last_totp_counter", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user", "last_totp_counter")
