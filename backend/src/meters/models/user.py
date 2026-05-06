"""User — angemeldeter Benutzer der App.

Zwei Rollen: ``admin`` (volle Rechte) und ``recorder`` (darf erfassen, eigene
Erfassungen <24h ändern, sonst nur lesen). ``force_password_change`` zwingt
beim ersten Login zum Passwortwechsel.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin
from meters.models._enums import UserRole

if TYPE_CHECKING:
    from meters.models.backup_code import BackupCode
    from meters.models.session import Session


class User(Base, TimestampMixin):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role", native_enum=False, length=16),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    force_password_change: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column()

    # TOTP-2FA — wenn ``totp_enabled``, gilt der Login-Zwei-Schritt-Flow.
    # ``totp_secret`` ist die Base32-kodierte Quelle für RFC 6238; wir
    # speichern sie aktuell im Klartext (DB ist nur lokal lesbar; das Cookie
    # wäre der eigentliche Schadensschritt). Verschlüsselung at-rest wäre
    # eine Erweiterung für später.
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    totp_secret: Mapped[str | None] = mapped_column(String(64))

    # Recorder-Berechtigung: darf unzugeordnete QR-Codes selbst einer MP
    # zuordnen. Default false — Admin schaltet pro Mitarbeiter explizit frei.
    # Für Admins ist der Wert irrelevant, da sie die Berechtigung implizit
    # haben.
    can_assign_qr_tokens: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="0",
    )

    sessions: Mapped[list[Session]] = relationship(
        "Session",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    backup_codes: Mapped[list[BackupCode]] = relationship(
        "BackupCode",
        back_populates="user",
        cascade="all, delete-orphan",
    )
