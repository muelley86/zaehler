"""Delivery — eine zugekaufte Füllmenge an einem nachfüllbaren Register.

In der Praxis: Heizöl-Lieferungen am ``oil.tank``-Register. Die Lieferungen
fließen in die Verbrauchsberechnung (``services.consumption``) und in die
Bestandsanzeige (``services.state``) ein.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin
from meters.db.types import DecimalText

if TYPE_CHECKING:
    from meters.models.register import Register
    from meters.models.user import User


class Delivery(Base, TimestampMixin):
    """Zugekaufte Füllmenge für ein nachfüllbares Register (z. B. Heizöl-Tank)."""

    __tablename__ = "delivery"
    __table_args__ = (
        UniqueConstraint("register_id", "delivery_at", name="uq_delivery_register_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    register_id: Mapped[int] = mapped_column(
        ForeignKey("register.id", ondelete="CASCADE"), nullable=False, index=True
    )
    delivery_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(DecimalText(32), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    # NOT NULL + SET NULL = effektives RESTRICT (siehe Reading-Model).
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=False, index=True
    )

    register: Mapped[Register] = relationship("Register", back_populates="deliveries")
    created_by: Mapped[User] = relationship("User")
