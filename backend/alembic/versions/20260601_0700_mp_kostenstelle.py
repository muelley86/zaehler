"""mp_kostenstelle

Optionales Stammdatenfeld ``kostenstelle`` (Ganzzahl 0-99999) an
``measuring_point`` - fuer Kostenstellen-Auswertung. Optional/nullable,
gilt fuer alle MP-Typen.

Revision ID: 0025_mp_kostenstelle
Revises: 0024_audit_log_created_at_index
Create Date: 2026-06-01 07:00:00+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025_mp_kostenstelle"
down_revision: str | None = "0024_audit_log_created_at_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("measuring_point", schema=None) as batch_op:
        batch_op.add_column(sa.Column("kostenstelle", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("measuring_point", schema=None) as batch_op:
        batch_op.drop_column("kostenstelle")
