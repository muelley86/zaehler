"""Audit-Batch 3: Delivery UNIQUE + Audit-Log Index (user_id, created_at)

Revision ID: 0014_audit3_indexes
Revises: 0013_one_active_meter
Create Date: 2026-05-05 12:00:00

- Befund 4.2: UNIQUE-Constraint auf (register_id, delivery_at) bei
  Delivery — analog zu Reading, verhindert Doppelerfassung einer
  Lieferung im selben Register zur exakt gleichen Zeit.
- Befund 4.4: Composite-Index auf audit_log (user_id, created_at) —
  Filter „alle Aktionen eines Users seit T" hatte bisher nur den
  user_id-Einzelindex, dadurch Sort über alle Treffer.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0014_audit3_indexes"
down_revision: str | None = "0013_one_active_meter"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("delivery") as batch:
        batch.create_unique_constraint("uq_delivery_register_at", ["register_id", "delivery_at"])
    op.create_index(
        "ix_audit_log_user_id_created_at",
        "audit_log",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_audit_log_user_id_created_at", table_name="audit_log")
    with op.batch_alter_table("delivery") as batch:
        batch.drop_constraint("uq_delivery_register_at", type_="unique")
