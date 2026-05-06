"""Service-Layer für QR-Token-Verheiratung (Feature A).

Erzeugung, Zuweisung und Auflösung von Tokens. Token-IDs sind 8 Zeichen
Crockford-Base32 — ein Alphabet mit 32 Symbolen ohne visuell mehrdeutige
Zeichen (kein I/L/O/U, kein 0/1). Damit sind 32^8 ≈ 1,1 × 10^12
Möglichkeiten erreichbar.

Bei Bulk-Erzeugung versuchen wir bis zu :data:`_MAX_RETRIES` mal pro
Token, falls eine UNIQUE-Kollision auftritt. Bei der erwarteten
Größenordnung (Tausende Tokens, nicht Milliarden) ist eine Kollision
extrem unwahrscheinlich; der Retry ist trotzdem da, damit das System
formal robust bleibt.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from meters.models import QrToken

# Crockford-Base32: 32 Zeichen, ohne I, L, O, U, 0, 1.
# (Das Standard-Crockford-Alphabet enthält 0 und 1, hat dafür kein I/L/O/U;
# wir entfernen zusätzlich 0 und 1, weil die in Druck nahe an O und I/L liegen.
# Alphabet-Länge bleibt 32: 8 Buchstaben aus jeder der vier Spalten unten,
# 8 Ziffern aus 2-9. Wir nehmen die normale Crockford-Variante und
# verzichten auf 0/1 nicht — sie sind in der gesetzten Druck-Schrift
# JetBrains Mono problemlos lesbar.)
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

# Token-Länge — bewusst klein (8 Zeichen), damit man sie vom Etikett
# abtippen kann, ohne sich zu vertippen.
TOKEN_LENGTH = 8

# Maximale Retries pro Token bei UNIQUE-Kollision. Praktisch nie genutzt —
# bei 10^12 Möglichkeiten ist das eine theoretische Absicherung.
_MAX_RETRIES = 5


def generate_token_string() -> str:
    """Liefert einen neuen Token-String (ohne Persistenz, ohne Kollisionscheck)."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(TOKEN_LENGTH))


def _utcnow() -> datetime:
    return datetime.now(UTC)


def create_token(
    db: DbSession,
    *,
    created_by_user_id: int,
) -> QrToken:
    """Erzeugt einen einzelnen Token mit Kollisions-Retry.

    Atomicity: bei UNIQUE-Kollision wird die Session zurückgerollt und ein
    neuer Token-String generiert. Nach :data:`_MAX_RETRIES` erfolglosen
    Versuchen wirft der Aufruf ``IntegrityError`` durch.
    """
    last_error: IntegrityError | None = None
    for _ in range(_MAX_RETRIES):
        token_str = generate_token_string()
        token = QrToken(token=token_str, created_by_user_id=created_by_user_id)
        db.add(token)
        try:
            db.flush()
            return token
        except IntegrityError as exc:  # pragma: no cover — Retry-Pfad
            db.rollback()
            last_error = exc
    assert last_error is not None
    raise last_error


def bulk_create_tokens(
    db: DbSession,
    *,
    count: int,
    created_by_user_id: int,
) -> list[QrToken]:
    """Erzeugt ``count`` Tokens und liefert sie zurück.

    Aufrufer ist für ``commit()`` und Audit-Einträge verantwortlich.
    """
    if count <= 0:
        return []
    return [create_token(db, created_by_user_id=created_by_user_id) for _ in range(count)]


def assign_token(
    db: DbSession,
    *,
    token: QrToken,
    measuring_point_id: int,
    assigned_by_user_id: int,
) -> None:
    """Setzt die MP-Zuweisung. Idempotent für identische Zuweisungen,
    verändert aber ``assigned_at``/``assigned_by_user_id`` nicht erneut,
    wenn der Token bereits genau dieser MP zugeordnet ist."""
    if (
        token.measuring_point_id == measuring_point_id
        and token.assigned_at is not None
    ):
        return
    token.measuring_point_id = measuring_point_id
    token.assigned_at = _utcnow()
    token.assigned_by_user_id = assigned_by_user_id


def unassign_token(db: DbSession, *, token: QrToken) -> bool:
    """Hebt die Zuweisung auf. Liefert True, wenn der Token zuvor zugeordnet
    war, False bei No-op."""
    if token.measuring_point_id is None:
        return False
    token.measuring_point_id = None
    token.assigned_at = None
    token.assigned_by_user_id = None
    return True


def find_by_token(db: DbSession, token_str: str) -> QrToken | None:
    """Lookup über den Token-String (UNIQUE)."""
    return db.scalar(select(QrToken).where(QrToken.token == token_str))
