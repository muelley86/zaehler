"""BackupCode — Recovery-Codes für 2FA.

Beim Aktivieren von TOTP werden 10 zufällige Codes generiert. Wir speichern
nur den HMAC-SHA256-Hash (gleicher Mechanismus wie bei Session-Tokens), damit
ein DB-Leak die Klartext-Codes nicht freigibt. Jeder Code ist single-use und
wird beim Verbrauch mit ``used_at`` markiert (statt gelöscht — fürs Audit).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:
    from meters.models.user import User


class BackupCode(Base, TimestampMixin):
    __tablename__ = "backup_code"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column()

    user: Mapped[User] = relationship("User", back_populates="backup_codes")


class PendingTotpChallenge(Base, TimestampMixin):
    """Zwischenschritt nach Username/Passwort-Erfolg, vor TOTP-Verifikation.

    Statt einen "halben" Session-Eintrag zu führen, gibt's eine eigene
    Tabelle: kürzere Lebensdauer, klare Semantik, einfache Cleanup-Logik.
    """

    __tablename__ = "pending_totp_challenge"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(45))
