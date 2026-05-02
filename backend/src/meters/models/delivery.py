"""Delivery — eine zugekaufte Füllmenge an einem nachfüllbaren Register.

In der Praxis: Heizöl-Lieferungen am ``oil.tank``-Register. Die Lieferungen
fließen in die Verbrauchsberechnung (``services.consumption``) und in die
Bestandsanzeige (``services.state``) ein.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin
from meters.db.types import DecimalText

if TYPE_CHECKING:
    from meters.models.register import Register
    from meters.models.user import User


class Delivery(Base, TimestampMixin):
    """Zugekaufte Füllmenge für ein nachfüllbares Register (z. B. Heizöl-Tank)."""

    __tablename__ = "delivery"

    id: Mapped[int] = mapped_column(primary_key=True)
    register_id: Mapped[int] = mapped_column(
        ForeignKey("register.id", ondelete="CASCADE"), nullable=False, index=True
    )
    delivery_date: Mapped[date] = mapped_column(nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(DecimalText(32), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), index=True
    )

    register: Mapped[Register] = relationship("Register", back_populates="deliveries")
    created_by: Mapped[User | None] = relationship("User")
