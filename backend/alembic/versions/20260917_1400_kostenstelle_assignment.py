"""Kostenstelle mit Gueltigkeitszeitraum (Tabelle kostenstelle_assignment).

Revision ID: 0036_kostenstelle_assignment
Revises: 0035_transformer_factor_meter
Create Date: 2026-09-17 14:00:00

Bisher trug die Messstelle eine einzelne Kostenstelle; ein Wechsel haette fruehere Abrechnungsmonate
umgeschrieben. Jetzt periodisiert wie Eigentuemer/Mieter (halboffenes Intervall, max. eine offene
Periode je MP).

Upgrade: jede vorhandene Kostenstelle wird eine offene Periode ab Einbau des ersten Zaehlers
(ohne Zaehler: Anlagedatum der Messstelle). Danach wird ``measuring_point.kostenstelle`` entfernt -
unter SQLite per ``ALTER TABLE ... DROP COLUMN`` ohne Tabellen-Neuaufbau (siehe 0035: der Neuaufbau
loescht bei ``foreign_keys=ON`` per ON DELETE CASCADE alle Kinddaten).

Downgrade: nur moeglich, solange jede Messstelle hoechstens eine Periode hat und diese offen ist -
sonst ginge die Historie verloren (Abbruch statt stillem Verlust).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0036_kostenstelle_assignment"
down_revision: str | None = "0035_transformer_factor_meter"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _drop_kostenstelle_column() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.drop_column("measuring_point", "kostenstelle")
        return
    raw = bind.exec_driver_sql("select sqlite_version()").scalar_one()
    version = tuple(int(teil) for teil in raw.split("."))
    if version < (3, 35):
        raise RuntimeError(
            f"SQLite {raw} kann DROP COLUMN nicht ohne Tabellen-Neuaufbau (>= 3.35 noetig)"
        )
    op.execute("ALTER TABLE measuring_point DROP COLUMN kostenstelle")


def upgrade() -> None:
    op.create_table(
        "kostenstelle_assignment",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("measuring_point_id", sa.Integer(), nullable=False),
        sa.Column("kostenstelle", sa.Integer(), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["measuring_point_id"], ["measuring_point.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_kostenstelle_assignment_measuring_point_id",
        "kostenstelle_assignment",
        ["measuring_point_id"],
    )
    # Partieller UNIQUE-Index wie 0033 (op.create_index quotet WHERE als Literal).
    op.execute(
        "CREATE UNIQUE INDEX uq_kostenstelle_assignment_open_per_mp "
        "ON kostenstelle_assignment (measuring_point_id) WHERE valid_to IS NULL"
    )
    op.execute(
        "INSERT INTO kostenstelle_assignment "
        "(measuring_point_id, kostenstelle, valid_from, valid_to, created_at) "
        "SELECT mp.id, mp.kostenstelle, "
        "COALESCE((SELECT MIN(pm.installed_at) FROM physical_meter pm "
        "WHERE pm.measuring_point_id = mp.id), date(mp.created_at)), "
        "NULL, CURRENT_TIMESTAMP "
        "FROM measuring_point mp WHERE mp.kostenstelle IS NOT NULL"
    )
    _drop_kostenstelle_column()


def downgrade() -> None:
    bind = op.get_bind()
    verlust = (
        bind.exec_driver_sql(
            "SELECT measuring_point_id FROM kostenstelle_assignment GROUP BY measuring_point_id "
            "HAVING COUNT(*) > 1 OR SUM(valid_to IS NOT NULL) > 0 ORDER BY measuring_point_id"
        )
        .scalars()
        .all()
    )
    if verlust:
        raise RuntimeError(
            "Downgrade abgebrochen: Messstellen mit Kostenstellen-Historie "
            f"(IDs {list(verlust)}); die Historie ginge verloren."
        )
    # add_column ohne Default: unter SQLite natives ALTER TABLE ADD COLUMN, kein Neuaufbau.
    with op.batch_alter_table("measuring_point", schema=None) as batch_op:
        batch_op.add_column(sa.Column("kostenstelle", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE measuring_point SET kostenstelle = ("
        "SELECT ka.kostenstelle FROM kostenstelle_assignment ka "
        "WHERE ka.measuring_point_id = measuring_point.id AND ka.valid_to IS NULL)"
    )
    op.execute("DROP INDEX IF EXISTS uq_kostenstelle_assignment_open_per_mp")
    op.drop_index("ix_kostenstelle_assignment_measuring_point_id", "kostenstelle_assignment")
    op.drop_table("kostenstelle_assignment")
