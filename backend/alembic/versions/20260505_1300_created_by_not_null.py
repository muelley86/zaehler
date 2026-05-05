"""created_by_user_id NOT NULL bei Reading + Delivery.

Revision ID: 0015_created_by_not_null
Revises: 0014_audit3_indexes
Create Date: 2026-05-05 13:00:00

CLAUDE.md fordert: ``Reading.created_by_user_id wird IMMER gesetzt``.
Bisher war das Feld nullable (FK ondelete=SET NULL). Mit NOT NULL
greift SET NULL beim User-Löschen nicht mehr — die Löschung scheitert
und wird damit effektiv RESTRICT, ohne dass die FK angefasst werden
muss (das ist auf SQLite mit batch_alter_table besser, weil der
Constraint-Name dort nicht zuverlässig auflösbar ist).

Backfill für eventuell vorhandene NULL-Werte: ältester Admin-User.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_created_by_not_null"
down_revision: str | None = "0014_audit3_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_BACKFILL_READING = """
UPDATE reading
   SET created_by_user_id = (
       SELECT id FROM "user" WHERE role='ADMIN' ORDER BY id LIMIT 1
   )
 WHERE created_by_user_id IS NULL
"""

_BACKFILL_DELIVERY = """
UPDATE delivery
   SET created_by_user_id = (
       SELECT id FROM "user" WHERE role='ADMIN' ORDER BY id LIMIT 1
   )
 WHERE created_by_user_id IS NULL
"""


def upgrade() -> None:
    op.execute(_BACKFILL_READING)
    op.execute(_BACKFILL_DELIVERY)
    with op.batch_alter_table("reading") as batch:
        batch.alter_column("created_by_user_id", existing_type=sa.Integer(), nullable=False)
    with op.batch_alter_table("delivery") as batch:
        batch.alter_column("created_by_user_id", existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("reading") as batch:
        batch.alter_column("created_by_user_id", existing_type=sa.Integer(), nullable=True)
    with op.batch_alter_table("delivery") as batch:
        batch.alter_column("created_by_user_id", existing_type=sa.Integer(), nullable=True)
