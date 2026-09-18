"""Wandlerfaktor vom MeasuringPoint an den PhysicalMeter verschieben.

Revision ID: 0035_transformer_factor_meter
Revises: 0034_virtual_mp_location
Create Date: 2026-09-17 10:00:00

Der Wandlerfaktor gehoert zur Einbausituation eines Geraets und aendert sich praktisch nur beim Zaehler- oder
Wandlertausch. Bisher galt ein Faktor an der Messstelle rueckwirkend fuer alle Ablesungen; nach einem Tausch mit
anderem Faktor waeren fruehere Monate falsch berechnet worden. Jetzt traegt jedes Geraet seinen Faktor.

Upgrade: jedes Geraet uebernimmt den bisherigen Faktor seiner Messstelle (Verbrauchswerte bleiben identisch, der
Monats-Cache muss nicht neu berechnet werden). Downgrade: die Messstelle uebernimmt den Faktor des aktiven Geraets.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0035_transformer_factor_meter"
down_revision: str | None = "0034_virtual_mp_location"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_SPALTEN = {("measuring_point", "transformer_factor"), ("physical_meter", "transformer_factor")}


def _drop_column(table: str, column: str) -> None:
    """Spalte entfernen OHNE Tabellen-Neuaufbau.

    ``batch_alter_table`` baut die Tabelle unter SQLite neu auf (neu anlegen, kopieren, alte
    DROP). Bei ``foreign_keys=ON`` loest das DROP ``ON DELETE CASCADE`` aus und loescht Zaehler,
    Register und Ablesungen; ``PRAGMA foreign_keys = OFF`` wirkt innerhalb der Migrations-
    Transaktion nicht (an einer Backup-Kopie am 17.09.2026 festgestellt). SQLite >= 3.35 kann
    ``ALTER TABLE ... DROP COLUMN`` direkt; aeltere Versionen brechen ab statt Daten zu verlieren.
    """
    # Nur feste Bezeichner aus dieser Migration (f-String unten, keine Eingaben).
    assert (table, column) in _SPALTEN, (table, column)
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.drop_column(table, column)
        return
    version = tuple(
        int(teil)
        for teil in bind.exec_driver_sql("select sqlite_version()").scalar_one().split(".")
    )
    if version < (3, 35):
        raise RuntimeError(
            f"SQLite {version} kann DROP COLUMN nicht ohne Tabellen-Neuaufbau (>= 3.35 noetig)"
        )
    op.execute(f"ALTER TABLE {table} DROP COLUMN {column}")


def upgrade() -> None:
    with op.batch_alter_table("physical_meter", schema=None) as batch_op:
        batch_op.add_column(sa.Column("transformer_factor", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE physical_meter SET transformer_factor = ("
        "SELECT mp.transformer_factor FROM measuring_point mp "
        "WHERE mp.id = physical_meter.measuring_point_id)"
    )
    _drop_column("measuring_point", "transformer_factor")


def downgrade() -> None:
    # Die Messstelle kann nur einen Faktor tragen. Haben ihre Geraete verschiedene Faktoren, ginge
    # die Historie verloren, und ein erneutes Upgrade wuerde den aktiven Faktor auf alle Geraete
    # kopieren (fruehere Monate falsch) — daher Abbruch statt stillem Verlust.
    abweichend = (
        op.get_bind()
        .exec_driver_sql(
            "SELECT measuring_point_id FROM physical_meter GROUP BY measuring_point_id "
            "HAVING COUNT(DISTINCT COALESCE(transformer_factor, 0)) > 1 ORDER BY measuring_point_id"
        )
        .scalars()
        .all()
    )
    if abweichend:
        raise RuntimeError(
            "Downgrade abgebrochen: Messstellen mit unterschiedlichem Wandlerfaktor je Zaehler "
            f"(IDs {list(abweichend)}); die Faktoren alter Zaehler gingen verloren."
        )
    with op.batch_alter_table("measuring_point", schema=None) as batch_op:
        batch_op.add_column(sa.Column("transformer_factor", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE measuring_point SET transformer_factor = ("
        "SELECT pm.transformer_factor FROM physical_meter pm "
        "WHERE pm.measuring_point_id = measuring_point.id AND pm.removed_at IS NULL)"
    )
    _drop_column("physical_meter", "transformer_factor")
