"""Audit-Indizes, lat/lng-CHECK und Aufräumen ungenutzter updated_at-Spalten.

Revision ID: 0008_audit_indexes_and_cleanup
Revises: 0007_location_geo
Create Date: 2026-05-04

Drei Aufgaben in einer Migration:

1. ``audit_log``: Composite-Indizes ``(action, created_at)`` und
   ``(entity_type, created_at)`` für die Audit-Log-Filteransicht. Ohne
   diese Indizes wird mit wachsender Tabelle ein Full-Table-Scan
   ausgelöst.
2. ``backup_code`` und ``pending_totp_challenge``: ``updated_at``-Spalte
   entfernen, die von Migration 0006 angelegt, aber von keinem Model
   gemappt wurde (BackupCode ist single-use, PendingTotpChallenge wird
   nach Ablauf gelöscht).
3. ``location``: CHECK-Constraints auf Latitude/Longitude-Range, damit
   nicht nur Pydantic-Validierung greift, sondern auch direkter DB-Write
   abgewiesen wird.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0008_audit_indexes_and_cleanup"
down_revision: str | None = "0007_location_geo"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_audit_log_action_created_at",
        "audit_log",
        ["action", "created_at"],
    )
    op.create_index(
        "ix_audit_log_entity_type_created_at",
        "audit_log",
        ["entity_type", "created_at"],
    )

    with op.batch_alter_table("backup_code") as batch:
        batch.drop_column("updated_at")
    with op.batch_alter_table("pending_totp_challenge") as batch:
        batch.drop_column("updated_at")

    with op.batch_alter_table("location") as batch:
        batch.create_check_constraint(
            "ck_location_latitude_range",
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
        )
        batch.create_check_constraint(
            "ck_location_longitude_range",
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
        )


def downgrade() -> None:
    with op.batch_alter_table("location") as batch:
        batch.drop_constraint("ck_location_longitude_range", type_="check")
        batch.drop_constraint("ck_location_latitude_range", type_="check")

    with op.batch_alter_table("pending_totp_challenge") as batch:
        batch.add_column(__updated_at_col())
    with op.batch_alter_table("backup_code") as batch:
        batch.add_column(__updated_at_col())

    op.drop_index("ix_audit_log_entity_type_created_at", table_name="audit_log")
    op.drop_index("ix_audit_log_action_created_at", table_name="audit_log")


def __updated_at_col() -> object:
    import sqlalchemy as sa

    return sa.Column("updated_at", sa.DateTime(), nullable=True)
