"""Session — server-seitige Login-Session, referenziert per Cookie-Token.

Wir speichern den HMAC-Hash des Tokens, damit ein DB-Leak die Session-Cookies
nicht direkt preisgibt. ``expires_at`` wird bei jedem Aufruf "rolling"
verlängert (siehe ``services.auth.resolve_session``), bis ``Logout`` oder
manueller Widerruf das Eintrag löscht.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:
    from meters.models.user import User


class Session(Base, TimestampMixin):
    __tablename__ = "session"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(45))

    user: Mapped[User] = relationship("User", back_populates="sessions")
