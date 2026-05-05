"""Heating-Migration: Uppercase-Werte (Enum-Namen) korrekt umsetzen.

Revision ID: 0012_heating_uppercase_fix
Revises: 0011_heating_modular
Create Date: 2026-05-05 06:00:00

Migration 0011 hat lowercase-WHERE-Klauseln verwendet (``type='oil'``,
``type='gas'``), aber SQLAlchemy speichert bei ``SAEnum(StrEnum, native_enum=False)``
ohne explizites ``values_callable`` den Python-**Namen** der Enum
(``OIL``, ``GAS``, ``ELECTRICITY`` …) — nicht den ``.value``. Dadurch
matchte das UPDATE auf Containern mit bestehenden Öl-/Gas-Messstellen
nicht; nach 0011 zeigten diese MPs noch ``type='OIL'`` bzw. ``GAS``,
und der List-Endpoint warf ``LookupError: 'OIL' is not among the
defined enum values``, weil ``MeterType.OIL`` im neuen Code fehlt.

Diese Migration räumt das nachträglich auf:
- ``type='OIL'`` → ``type='HEATING', heating_source='OIL'``
- ``type='GAS'`` → ``type='HEATING', heating_source='GAS'``

Auf Containern, die bereits manuell repariert wurden, sind die UPDATEs
no-ops (matchen einfach keine Zeilen mehr).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0012_heating_uppercase_fix"
down_revision: str | None = "0011_heating_modular"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE measuring_point SET type='HEATING', heating_source='OIL' WHERE type='OIL'")
    op.execute("UPDATE measuring_point SET type='HEATING', heating_source='GAS' WHERE type='GAS'")


def downgrade() -> None:
    op.execute(
        "UPDATE measuring_point SET type='OIL', heating_source=NULL "
        "WHERE type='HEATING' AND heating_source='OIL'"
    )
    op.execute(
        "UPDATE measuring_point SET type='GAS', heating_source=NULL "
        "WHERE type='HEATING' AND heating_source='GAS'"
    )
