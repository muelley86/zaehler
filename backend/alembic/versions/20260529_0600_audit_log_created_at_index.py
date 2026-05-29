"""audit_log_created_at_index

Index auf ``audit_log.created_at`` fuer das Listing in der Admin-Audit-
Ansicht (``ORDER BY created_at DESC LIMIT 200``). Ohne Index laeuft das
auf einen Volltabellenscan, der mit jedem zusaetzlichen Audit-Eintrag
teurer wird.

Revision ID: 0024_audit_log_created_at_index
Revises: 0023_address_and_installation_location
Create Date: 2026-05-29 06:00:00+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0024_audit_log_created_at_index"
down_revision: str | None = "0023_address_and_installation_location"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_audit_log_created_at",
        "audit_log",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_audit_log_created_at", table_name="audit_log")
