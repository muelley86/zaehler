"""Unit-Tests für ``meters.services.qr_token``."""

from __future__ import annotations

from sqlalchemy.orm import Session

from meters.core.security import hash_password
from meters.models import (
    MeasuringPoint,
    MeterType,
    QrToken,
    User,
    UserRole,
)
from meters.services.qr_token import (
    TOKEN_LENGTH,
    assign_token,
    bulk_create_tokens,
    create_token,
    find_by_token,
    generate_token_string,
    unassign_token,
)


def _admin(db: Session, *, username: str = "admin1") -> User:
    user = User(
        username=username,
        email=None,
        password_hash=hash_password("test-pass-12345"),
        role=UserRole.ADMIN,
        is_active=True,
        force_password_change=False,
    )
    db.add(user)
    db.flush()
    return user


def _mp(db: Session, *, name: str = "A") -> MeasuringPoint:
    mp = MeasuringPoint(
        name=name,
        type=MeterType.WATER,
        is_bidirectional=False,
        has_dual_tariff=False,
    )
    db.add(mp)
    db.flush()
    return mp


def test_generate_token_string_has_correct_length() -> None:
    s = generate_token_string()
    assert len(s) == TOKEN_LENGTH
    # Crockford-Base32-Alphabet
    for c in s:
        assert c in "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def test_generate_token_string_is_unique_in_practice() -> None:
    seen = {generate_token_string() for _ in range(1000)}
    # Bei 32^8 ≈ 10^12 Möglichkeiten und nur 1000 Samples sind Kollisionen
    # praktisch unmöglich. Toleranz für edge-cases: erwarten 1000.
    assert len(seen) == 1000


def test_create_token_persists_with_creator(db: Session) -> None:
    admin = _admin(db)
    token = create_token(db, created_by_user_id=admin.id)
    db.commit()
    fresh = db.get(QrToken, token.id)
    assert fresh is not None
    assert fresh.created_by_user_id == admin.id
    assert fresh.measuring_point_id is None
    assert fresh.assigned_at is None
    assert fresh.assigned_by_user_id is None


def test_bulk_create_tokens_returns_correct_count(db: Session) -> None:
    admin = _admin(db)
    tokens = bulk_create_tokens(db, count=12, created_by_user_id=admin.id)
    db.commit()
    assert len(tokens) == 12
    # Alle Token-Strings sind unterschiedlich
    assert len({t.token for t in tokens}) == 12


def test_bulk_create_zero_count_returns_empty(db: Session) -> None:
    admin = _admin(db)
    tokens = bulk_create_tokens(db, count=0, created_by_user_id=admin.id)
    assert tokens == []


def test_assign_token_sets_mp_and_audit_fields(db: Session) -> None:
    admin = _admin(db)
    mp = _mp(db)
    token = create_token(db, created_by_user_id=admin.id)
    assign_token(
        db,
        token=token,
        measuring_point_id=mp.id,
        assigned_by_user_id=admin.id,
    )
    db.commit()
    fresh = db.get(QrToken, token.id)
    assert fresh is not None
    assert fresh.measuring_point_id == mp.id
    assert fresh.assigned_at is not None
    assert fresh.assigned_by_user_id == admin.id


def test_assign_token_idempotent_for_same_mp(db: Session) -> None:
    admin = _admin(db)
    mp = _mp(db)
    token = create_token(db, created_by_user_id=admin.id)
    assign_token(db, token=token, measuring_point_id=mp.id, assigned_by_user_id=admin.id)
    db.commit()
    first_assigned_at = token.assigned_at

    # Zweiter Aufruf darf assigned_at nicht überschreiben
    assign_token(db, token=token, measuring_point_id=mp.id, assigned_by_user_id=admin.id)
    db.commit()
    assert token.assigned_at == first_assigned_at


def test_unassign_token_clears_fields(db: Session) -> None:
    admin = _admin(db)
    mp = _mp(db)
    token = create_token(db, created_by_user_id=admin.id)
    assign_token(db, token=token, measuring_point_id=mp.id, assigned_by_user_id=admin.id)
    db.commit()

    changed = unassign_token(db, token=token)
    db.commit()
    assert changed is True
    assert token.measuring_point_id is None
    assert token.assigned_at is None
    assert token.assigned_by_user_id is None


def test_unassign_token_noop_when_already_unassigned(db: Session) -> None:
    admin = _admin(db)
    token = create_token(db, created_by_user_id=admin.id)
    assert unassign_token(db, token=token) is False


def test_find_by_token_returns_match(db: Session) -> None:
    admin = _admin(db)
    token = create_token(db, created_by_user_id=admin.id)
    db.commit()
    found = find_by_token(db, token.token)
    assert found is not None
    assert found.id == token.id


def test_find_by_token_returns_none_for_unknown(db: Session) -> None:
    assert find_by_token(db, "NONEXIST") is None


def test_mp_delete_sets_token_unassigned(db: Session) -> None:
    """ON DELETE SET NULL: Token bleibt erhalten, MP-FK wird genullt."""
    admin = _admin(db)
    mp = _mp(db)
    token = create_token(db, created_by_user_id=admin.id)
    assign_token(db, token=token, measuring_point_id=mp.id, assigned_by_user_id=admin.id)
    db.commit()

    db.delete(mp)
    db.commit()

    fresh = db.get(QrToken, token.id)
    assert fresh is not None
    assert fresh.measuring_point_id is None
