"""Per-Recorder MP-Zugriff: Tabelle user_measuring_point_access.

Revision ID: 0016_user_mp_access
Revises: 0015_created_by_not_null
Create Date: 2026-05-06 13:00:00

Composite-PK ``(user_id, measuring_point_id)`` mit Cascade auf User- und
MP-Löschung. ``granted_by_user_id`` (RESTRICT, kein Cascade) erlaubt das
Lookup "wer hat Zugriff vergeben" auch wenn der gewährende Admin-User
inzwischen die Rolle gewechselt hat — gelöscht werden darf der Admin
erst, wenn keine offenen Grants mehr auf ihn zeigen.

Default-Verhalten: kein Eintrag = kein Zugriff. Recorder ohne Einträge
sehen daher nach diesem Upgrade gar keine Messstellen mehr; das ist die
beabsichtigte "least privilege"-Default-Konfiguration. Admin muss
anschließend pro Recorder explizit die zugänglichen MPs auswählen.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016_user_mp_access"
down_revision: str | None = "0015_created_by_not_null"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_measuring_point_access",
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "measuring_point_id",
            sa.Integer(),
            sa.ForeignKey("measuring_point.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "granted_at",
            sa.DateTime(),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.Column(
            "granted_by_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id"),
            nullable=False,
        ),
    )
    # Index auf user_id für die häufigste Query-Richtung "alle Zugriffe
    # eines Users". Der Composite-PK deckt user_id als Prefix bereits ab,
    # aber ein expliziter Index macht Pläne deterministischer.
    op.create_index(
        "ix_user_mp_access_user_id",
        "user_measuring_point_access",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_user_mp_access_user_id",
        table_name="user_measuring_point_access",
    )
    op.drop_table("user_measuring_point_access")
