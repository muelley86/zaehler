"""Dashboard-Layout je Benutzer (Reihenfolge + eingeklappte Kacheln).

Revision ID: 0044_user_dashboard_layout
Revises: 0043_mp_reading_interval
Create Date: 2026-09-22 10:00:00

``dashboard_layout`` ist ein JSON-Objekt ``{"order": [...], "collapsed": [...]}``
mit Kachel-IDs; ``NULL`` heisst Standard-Layout. Reine UI-Praeferenz, die
Normalisierung (unbekannte IDs raus, fehlende anhaengen) passiert beim Lesen
in ``schemas/dashboard_layout.py``.

Downgrade per ``op.drop_column`` ohne ``batch_alter_table`` (``user`` hat
Kinder mit ``ON DELETE CASCADE`` — Sessions, Backup-Codes; siehe CLAUDE.md
und Migration 0035).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0044_user_dashboard_layout"
down_revision: str | None = "0043_mp_reading_interval"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user", sa.Column("dashboard_layout", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "dashboard_layout")
