"""User-Spalte can_assign_qr_tokens (Feature C).

Revision ID: 0018_can_assign_qr_tokens
Revises: 0017_qr_token
Create Date: 2026-05-06 15:30:00

Pro-Recorder-Flag, das festlegt, ob er unzugeordnete QR-Tokens selbst einer
MP zuweisen darf. Default ist False — Admin schaltet pro Mitarbeiter explizit
frei. Für Admin-User ist der Wert irrelevant (impliziter Vollzugriff).

NOT NULL mit ``server_default='0'`` (False), damit bestehende User-Zeilen
beim Upgrade ohne Backfill auskommen.

**Wichtig — kein batch_alter_table für die user-Tabelle**: alembic-Batch
auf SQLite würde die Tabelle droppen und neu erzeugen. Der Drop triggert
die FK-Constraint ``reading.created_by_user_id → user.id ON DELETE SET
NULL``, was an der NOT-NULL-Vorgabe der Spalte (Migration 0015) scheitert.
SQLite kann ``ALTER TABLE ADD COLUMN`` aber nativ ohne Tabellen-Rebuild —
``op.add_column`` umgeht den FK-Trigger sauber.

Für ``downgrade`` muss der Drop allerdings durch den Batch — DROP COLUMN
ist auf SQLite nicht atomar. Wir schalten foreign_keys vorübergehend aus,
damit der Tabellen-Rebuild nicht über den Reading-FK stolpert.
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
    op.add_column(
        "user",
        sa.Column(
            "can_assign_qr_tokens",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"
    if is_sqlite:
        bind.exec_driver_sql("PRAGMA foreign_keys = OFF")
    try:
        with op.batch_alter_table("user") as batch:
            batch.drop_column("can_assign_qr_tokens")
    finally:
        if is_sqlite:
            bind.exec_driver_sql("PRAGMA foreign_keys = ON")
