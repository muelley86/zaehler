"""Reading-Spalten photo_lat / photo_lon fuer Foto-GPS.

Revision ID: 0019_reading_photo_gps
Revises: 0018_can_assign_qr_tokens
Create Date: 2026-05-27 09:00:00

Beim Foto-Upload extrahiert das Backend GPS-Koordinaten aus dem EXIF und
speichert sie als zwei optionale Float-Spalten. Damit kann das UI sie
ohne Re-Parsen des Bildes anzeigen.

Bestehende Reading-Zeilen bekommen NULL — alte Fotos ohne in-DB-GPS
werden nicht nachtraeglich gescannt (Out-of-Scope, siehe Plan).

Wie ``0018``: ``op.add_column`` direkt nutzen statt batch_alter_table,
damit der ``reading.created_by_user_id``-FK (NOT NULL, SET NULL) den
Tabellen-Rebuild auf SQLite nicht stolpern laesst.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019_reading_photo_gps"
down_revision: str | None = "0018_can_assign_qr_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("reading", sa.Column("photo_lat", sa.Float(), nullable=True))
    op.add_column("reading", sa.Column("photo_lon", sa.Float(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"
    if is_sqlite:
        bind.exec_driver_sql("PRAGMA foreign_keys = OFF")
    try:
        with op.batch_alter_table("reading") as batch:
            batch.drop_column("photo_lon")
            batch.drop_column("photo_lat")
    finally:
        if is_sqlite:
            bind.exec_driver_sql("PRAGMA foreign_keys = ON")
