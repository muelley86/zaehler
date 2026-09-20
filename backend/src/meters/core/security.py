"""Krypto-Helfer für Passwörter und Session-Tokens.

Passwörter: ``bcrypt`` mit konfigurierbarem Cost-Faktor.
Session-Tokens: zufällige URL-safe Strings; wir speichern nur den HMAC-SHA256
über das Server-Geheimnis, damit DB-Leaks die Cookies nicht direkt preisgeben.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

import bcrypt

from meters.core.config import settings

#: bcrypt hasht nur die ersten 72 Bytes und wirft ab Version 4 bei laengeren
#: Eingaben, statt still abzuschneiden. Gezaehlt wird in *Bytes*: ein Umlaut
#: braucht in UTF-8 zwei.
MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    """Hasht ein Passwort. Wirft ``ValueError`` bei ueber 72 Bytes.

    Die Grenze wird hier geprueft und nicht nur in den Pydantic-Schemas:
    ``hash_password`` ist der einzige Punkt, durch den alle Pfade muessen
    (HTTP-API, CLI, kuenftige Aufrufer). Die Schemas bleiben trotzdem
    zustaendig — sie liefern eine feldbezogene 422 statt einer 500.
    """
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Passwort darf hoechstens {MAX_PASSWORD_BYTES} Bytes lang sein.")
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=settings.bcrypt_rounds),
    ).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    """HMAC-SHA256 mit Server-Secret. Keine bcrypt-Cost notwendig (Tokens sind hochentropisch)."""
    digest = hmac.new(
        settings.secret_key.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest


SESSION_COOKIE_NAME = "meters_session"
