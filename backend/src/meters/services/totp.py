"""TOTP-Service: Setup, Verifikation, Backup-Codes, Pending-Challenges.

* Secret-Generierung via :func:`pyotp.random_base32` (160 bit Entropie).
* QR-Code (PNG, base64) wird vom Setup-Endpoint zurückgegeben.
* Backup-Codes sind 10 Stück à ``XXXX-XXXX`` (8 Hex-Zeichen, getrennt) und
  werden nur als HMAC-Hash gespeichert. Beim Verbrauch wird ``used_at``
  gesetzt — der Eintrag bleibt fürs Audit erhalten.
* PendingTotpChallenge ist eine kurzlebige Zwischen-Sitzung (5 min) nach
  erfolgreicher Username/Passwort-Verifikation, vor TOTP-Eingabe.
"""

from __future__ import annotations

import base64
import io
import re
import secrets
from datetime import UTC, datetime, timedelta

import pyotp
import qrcode  # type: ignore[import-untyped]
from qrcode.constants import ERROR_CORRECT_M  # type: ignore[import-untyped]
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from meters.core.config import settings
from meters.core.security import hash_session_token
from meters.models import BackupCode, PendingTotpChallenge, User

PENDING_TTL = timedelta(minutes=5)
BACKUP_CODE_COUNT = 10


def _utcnow() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# Secret + QR-Code
# ---------------------------------------------------------------------------


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(*, secret: str, username: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=settings.app_name)


def qr_png_base64(uri: str) -> str:
    """Liefert ein PNG mit dem ``otpauth://``-URI als Data-URL-Body."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def verify_totp(secret: str, code: str) -> bool:
    """RFC-6238 mit ±1 Step Drift (= ±30 s)."""
    if not re.fullmatch(r"\d{6}", code.strip()):
        return False
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)


# ---------------------------------------------------------------------------
# Backup-Codes
# ---------------------------------------------------------------------------


def _format_backup_code() -> str:
    raw = secrets.token_hex(4) + "-" + secrets.token_hex(4)  # XXXXXXXX-XXXXXXXX (16 hex chars)
    return raw.upper()


def _normalize_backup_code(code: str) -> str:
    return re.sub(r"\s|-", "", code).upper()


def issue_backup_codes(db: DbSession, *, user: User) -> list[str]:
    """Löscht bestehende Codes des Users, erzeugt 10 neue, gibt Klartext zurück."""
    for old in list(user.backup_codes):
        db.delete(old)
    plain_codes: list[str] = []
    for _ in range(BACKUP_CODE_COUNT):
        code = _format_backup_code()
        plain_codes.append(code)
        code_hash = hash_session_token(_normalize_backup_code(code))
        db.add(BackupCode(user_id=user.id, code_hash=code_hash))
    db.flush()
    return plain_codes


def consume_backup_code(db: DbSession, *, user: User, code: str) -> bool:
    """Markiert den passenden, noch ungenutzten Code als verbraucht."""
    normalized = _normalize_backup_code(code)
    if not re.fullmatch(r"[0-9A-F]{16}", normalized):
        return False
    target_hash = hash_session_token(normalized)
    bc = db.scalar(
        select(BackupCode).where(
            BackupCode.user_id == user.id,
            BackupCode.code_hash == target_hash,
            BackupCode.used_at.is_(None),
        )
    )
    if bc is None:
        return False
    bc.used_at = _utcnow()
    return True


def remaining_backup_codes(db: DbSession, *, user: User) -> int:
    return db.query(BackupCode).filter(
        BackupCode.user_id == user.id, BackupCode.used_at.is_(None)
    ).count()


# ---------------------------------------------------------------------------
# Pending Challenge
# ---------------------------------------------------------------------------


def create_pending_challenge(
    db: DbSession,
    *,
    user: User,
    user_agent: str | None,
    ip_address: str | None,
) -> tuple[PendingTotpChallenge, str]:
    token = secrets.token_urlsafe(32)
    challenge = PendingTotpChallenge(
        user_id=user.id,
        token_hash=hash_session_token(token),
        expires_at=_utcnow() + PENDING_TTL,
        user_agent=user_agent[:255] if user_agent else None,
        ip_address=ip_address,
    )
    db.add(challenge)
    db.flush()
    return challenge, token


def resolve_pending_challenge(
    db: DbSession, *, token: str
) -> tuple[User, PendingTotpChallenge] | None:
    if not token:
        return None
    token_hash = hash_session_token(token)
    challenge = db.scalar(
        select(PendingTotpChallenge).where(PendingTotpChallenge.token_hash == token_hash)
    )
    if challenge is None:
        return None
    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= _utcnow():
        db.delete(challenge)
        return None
    user = db.get(User, challenge.user_id)
    if user is None or not user.is_active:
        db.delete(challenge)
        return None
    return user, challenge


def consume_pending_challenge(db: DbSession, *, challenge: PendingTotpChallenge) -> None:
    db.delete(challenge)


def cleanup_expired_challenges(db: DbSession) -> int:
    """Idempotenter Cleanup-Helper für expired challenges (cron-fähig)."""
    rows = list(
        db.scalars(select(PendingTotpChallenge).where(PendingTotpChallenge.expires_at <= _utcnow()))
    )
    for r in rows:
        db.delete(r)
    return len(rows)
