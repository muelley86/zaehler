"""UserMeasuringPointAccess — Berechtigung eines Recorders auf eine Messstelle.

Composite-PK ``(user_id, measuring_point_id)``: maximal ein Eintrag pro
Kombination, automatisches Cascade-Delete bei User- bzw. MP-Löschung.

``granted_by_user_id`` ist eine Schnell-Lookup-Spalte für direkte Queries
("wer hat das gewährt"), zusätzlich zum AuditLog. Beide sind redundant, aber
die Spalte hier erlaubt Listings ohne AuditLog-Join.

Admins haben implizit auf alle MPs Zugriff — diese Tabelle wird für
``role=admin`` nicht konsultiert (siehe :mod:`meters.services.access`).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from meters.db import Base


class UserMeasuringPointAccess(Base):
    __tablename__ = "user_measuring_point_access"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        primary_key=True,
    )
    measuring_point_id: Mapped[int] = mapped_column(
        ForeignKey("measuring_point.id", ondelete="CASCADE"),
        primary_key=True,
    )
    granted_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp(),
        nullable=False,
    )
    # Nicht ondelete=CASCADE: wenn der Admin gelöscht wird, sollen die
    # Grants nicht verschwinden. Wir setzen stattdessen RESTRICT (Default).
    granted_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id"),
        nullable=False,
    )
