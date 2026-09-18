"""Uebertragung eines Abrechnungslaufs nach Agrarmonitor je Empfaenger (Plan Phase 5).

Die Rechnung wird von Hand in das Agrarmonitor-Formular uebertragen; hier wird nur festgehalten,
wer das wann mit welcher Belegnummer getan hat. Ein Eintrag je Lauf und Empfaenger (Name als
Snapshot, damit spaetere Umbenennungen den Lauf nicht veraendern).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from meters.db import Base, TimestampMixin


class BillingTransfer(Base, TimestampMixin):
    __tablename__ = "billing_transfer"
    __table_args__ = (UniqueConstraint("run_id", "owner_name", name="uq_billing_transfer_owner"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(
        ForeignKey("billing_run.id", ondelete="CASCADE"), index=True, nullable=False
    )
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("owner.id", ondelete="SET NULL"))
    owner_name: Mapped[str] = mapped_column(String(200), nullable=False)
    belegnummer: Mapped[str | None] = mapped_column(String(64))
    note: Mapped[str | None] = mapped_column(String(500))
    transferred_at: Mapped[datetime] = mapped_column(nullable=False)
    transferred_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
