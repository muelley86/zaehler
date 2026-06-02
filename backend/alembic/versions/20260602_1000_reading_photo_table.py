"""reading_photo (1->N Fotos je Erfassung)

Hebt das Limit von einem Foto je Reading auf: Fotos liegen ab jetzt in der
Kind-Tabelle ``reading_photo`` (bis zu 6 je Erfassung, ``sort_index`` haelt die
Reihenfolge). Bestehende Einzel-Fotos werden als ``sort_index=0`` uebernommen.

Bewusst NICHT-destruktiv: die alten Spalten ``reading.photo_path/_lat/_lon``
bleiben erhalten (vom ORM nicht mehr gemappt) — so ist das Upgrade fuer den
Bestand risikolos (kein SQLite-Table-Rebuild). Eine spaetere Migration kann die
Alt-Spalten entfernen.

Revision ID: 0027_reading_photo_table
Revises: 0026_report_config
Create Date: 2026-06-02 10:00:00+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0027_reading_photo_table"
down_revision: str | None = "0026_report_config"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reading_photo",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reading_id", sa.Integer(), nullable=False),
        sa.Column("photo_path", sa.String(length=255), nullable=False),
        sa.Column("photo_lat", sa.Float(), nullable=True),
        sa.Column("photo_lon", sa.Float(), nullable=True),
        sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["reading_id"], ["reading.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("reading_id", "sort_index", name="uq_reading_photo_sort"),
    )
    op.create_index("ix_reading_photo_reading_id", "reading_photo", ["reading_id"])

    # Bestehende Einzel-Fotos uebernehmen (sort_index 0, GPS + created_at mit).
    op.execute(
        """
        INSERT INTO reading_photo (reading_id, photo_path, photo_lat, photo_lon, sort_index, created_at)
        SELECT id, photo_path, photo_lat, photo_lon, 0, created_at
        FROM reading
        WHERE photo_path IS NOT NULL
        """
    )


def downgrade() -> None:
    # Alt-Spalten in ``reading`` blieben erhalten -> Drop der Kind-Tabelle reicht.
    op.drop_index("ix_reading_photo_reading_id", table_name="reading_photo")
    op.drop_table("reading_photo")
