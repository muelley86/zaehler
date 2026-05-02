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


def hash_password(password: str) -> str:
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
