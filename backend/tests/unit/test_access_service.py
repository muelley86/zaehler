"""Unit-Tests für ``meters.services.access``.

Wir testen die Berechtigungs-Helper isoliert: Admin sieht alles (Sentinel
``None`` bzw. Query unverändert), Recorder ohne Eintrag sieht nichts,
Recorder mit Eintrag sieht genau die zugewiesenen MPs.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.core.problem import ProblemError
from meters.core.security import hash_password
from meters.models import (
    MeasuringPoint,
    MeterType,
    PhysicalMeter,
    Register,
    User,
    UserMeasuringPointAccess,
    UserRole,
)
from meters.services.access import (
    accessible_mp_ids,
    assert_can_access_mp,
    assert_can_access_register,
    grant_access,
    restrict_mp_query,
    revoke_access,
)


def _mk_user(db: Session, *, username: str, role: UserRole) -> User:
    user = User(
        username=username,
        email=None,
        password_hash=hash_password("test-pass-12345"),
        role=role,
        is_active=True,
        force_password_change=False,
    )
    db.add(user)
    db.flush()
    return user


def _mk_mp(db: Session, *, name: str) -> MeasuringPoint:
    mp = MeasuringPoint(
        name=name,
        type=MeterType.WATER,
        is_bidirectional=False,
        has_dual_tariff=False,
    )
    db.add(mp)
    db.flush()
    return mp


def _mk_register(db: Session, *, mp: MeasuringPoint, obis: str = "water") -> Register:
    """Legt für die Register-Tests einen MP + Meter + Register-Tripel an."""
    meter = PhysicalMeter(
        measuring_point_id=mp.id,
        serial_number=f"SN-{mp.id}-{obis}",
        installed_at=date(2024, 1, 1),
    )
    db.add(meter)
    db.flush()
    register = Register(
        physical_meter_id=meter.id,
        obis_code=obis,
        label="Test",
        unit="m³",
        is_active=True,
    )
    db.add(register)
    db.flush()
    return register


# ---------------------------------------------------------------------------
# accessible_mp_ids
# ---------------------------------------------------------------------------


def test_accessible_mp_ids_admin_returns_none(db: Session) -> None:
    admin = _mk_user(db, username="admin1", role=UserRole.ADMIN)
    _mk_mp(db, name="A")
    _mk_mp(db, name="B")
    assert accessible_mp_ids(db, admin) is None


def test_accessible_mp_ids_recorder_without_entries_returns_empty(db: Session) -> None:
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    _mk_mp(db, name="A")
    assert accessible_mp_ids(db, rec) == set()


def test_accessible_mp_ids_recorder_with_entries(db: Session) -> None:
    admin = _mk_user(db, username="admin1", role=UserRole.ADMIN)
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    mp_a = _mk_mp(db, name="A")
    mp_b = _mk_mp(db, name="B")
    _mk_mp(db, name="C")  # nicht zugewiesen
    grant_access(db, user=rec, mp=mp_a, granted_by=admin)
    grant_access(db, user=rec, mp=mp_b, granted_by=admin)
    assert accessible_mp_ids(db, rec) == {mp_a.id, mp_b.id}


# ---------------------------------------------------------------------------
# assert_can_access_mp
# ---------------------------------------------------------------------------


def test_assert_can_access_mp_admin_passes(db: Session) -> None:
    admin = _mk_user(db, username="admin1", role=UserRole.ADMIN)
    mp = _mk_mp(db, name="A")
    assert_can_access_mp(db, admin, mp.id)  # darf nicht werfen


def test_assert_can_access_mp_recorder_with_grant(db: Session) -> None:
    admin = _mk_user(db, username="admin1", role=UserRole.ADMIN)
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    mp = _mk_mp(db, name="A")
    grant_access(db, user=rec, mp=mp, granted_by=admin)
    assert_can_access_mp(db, rec, mp.id)


def test_assert_can_access_mp_recorder_without_grant_404(db: Session) -> None:
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    mp = _mk_mp(db, name="A")
    try:
        assert_can_access_mp(db, rec, mp.id)
    except ProblemError as e:
        assert e.status_code == 404
    else:
        raise AssertionError("ProblemError 404 erwartet")


def test_assert_can_access_mp_recorder_unknown_mp_404(db: Session) -> None:
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    try:
        assert_can_access_mp(db, rec, 99999)
    except ProblemError as e:
        assert e.status_code == 404
    else:
        raise AssertionError("ProblemError 404 erwartet")


# ---------------------------------------------------------------------------
# assert_can_access_register
# ---------------------------------------------------------------------------


def test_assert_can_access_register_admin_passes(db: Session) -> None:
    admin = _mk_user(db, username="admin1", role=UserRole.ADMIN)
    mp = _mk_mp(db, name="A")
    reg = _mk_register(db, mp=mp)
    assert_can_access_register(db, admin, reg.id)


def test_assert_can_access_register_recorder_with_grant(db: Session) -> None:
    admin = _mk_user(db, username="admin1", role=UserRole.ADMIN)
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    mp = _mk_mp(db, name="A")
    reg = _mk_register(db, mp=mp)
    grant_access(db, user=rec, mp=mp, granted_by=admin)
    assert_can_access_register(db, rec, reg.id)


def test_assert_can_access_register_recorder_without_grant_404(db: Session) -> None:
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    mp = _mk_mp(db, name="A")
    reg = _mk_register(db, mp=mp)
    try:
        assert_can_access_register(db, rec, reg.id)
    except ProblemError as e:
        assert e.status_code == 404
    else:
        raise AssertionError("ProblemError 404 erwartet")


def test_assert_can_access_register_unknown_register_404(db: Session) -> None:
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    try:
        assert_can_access_register(db, rec, 99999)
    except ProblemError as e:
        assert e.status_code == 404
    else:
        raise AssertionError("ProblemError 404 erwartet")


# ---------------------------------------------------------------------------
# restrict_mp_query
# ---------------------------------------------------------------------------


def test_restrict_mp_query_admin_unchanged(db: Session) -> None:
    admin = _mk_user(db, username="admin1", role=UserRole.ADMIN)
    _mk_mp(db, name="A")
    _mk_mp(db, name="B")
    base = select(MeasuringPoint)
    restricted = restrict_mp_query(base, admin, mp_id_column=MeasuringPoint.id)
    rows = list(db.scalars(restricted))
    assert len(rows) == 2  # admin sieht alles


def test_restrict_mp_query_recorder_filters(db: Session) -> None:
    admin = _mk_user(db, username="admin1", role=UserRole.ADMIN)
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    mp_a = _mk_mp(db, name="A")
    _mk_mp(db, name="B")  # nicht zugewiesen
    grant_access(db, user=rec, mp=mp_a, granted_by=admin)
    base = select(MeasuringPoint)
    restricted = restrict_mp_query(base, rec, mp_id_column=MeasuringPoint.id)
    rows = list(db.scalars(restricted))
    assert [r.id for r in rows] == [mp_a.id]


def test_restrict_mp_query_recorder_without_grants_returns_empty(db: Session) -> None:
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    _mk_mp(db, name="A")
    base = select(MeasuringPoint)
    restricted = restrict_mp_query(base, rec, mp_id_column=MeasuringPoint.id)
    rows = list(db.scalars(restricted))
    assert rows == []


# ---------------------------------------------------------------------------
# grant_access / revoke_access
# ---------------------------------------------------------------------------


def test_grant_access_idempotent(db: Session) -> None:
    admin = _mk_user(db, username="admin1", role=UserRole.ADMIN)
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    mp = _mk_mp(db, name="A")
    first = grant_access(db, user=rec, mp=mp, granted_by=admin)
    second = grant_access(db, user=rec, mp=mp, granted_by=admin)
    assert first is not None
    assert second is None  # zweite Vergabe ist No-op


def test_revoke_access_returns_true_when_existed(db: Session) -> None:
    admin = _mk_user(db, username="admin1", role=UserRole.ADMIN)
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    mp = _mk_mp(db, name="A")
    grant_access(db, user=rec, mp=mp, granted_by=admin)
    assert revoke_access(db, user=rec, mp_id=mp.id) is True
    assert revoke_access(db, user=rec, mp_id=mp.id) is False  # idempotent


def test_mp_delete_cascades_access_entries(db: Session) -> None:
    admin = _mk_user(db, username="admin1", role=UserRole.ADMIN)
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    mp = _mk_mp(db, name="A")
    grant_access(db, user=rec, mp=mp, granted_by=admin)
    db.commit()
    db.delete(mp)
    db.commit()
    rows = list(
        db.scalars(
            select(UserMeasuringPointAccess).where(UserMeasuringPointAccess.user_id == rec.id)
        )
    )
    assert rows == []


def test_user_delete_cascades_access_entries(db: Session) -> None:
    admin = _mk_user(db, username="admin1", role=UserRole.ADMIN)
    rec = _mk_user(db, username="rec1", role=UserRole.RECORDER)
    mp = _mk_mp(db, name="A")
    grant_access(db, user=rec, mp=mp, granted_by=admin)
    db.commit()
    db.delete(rec)
    db.commit()
    rows = list(
        db.scalars(
            select(UserMeasuringPointAccess).where(
                UserMeasuringPointAccess.measuring_point_id == mp.id
            )
        )
    )
    assert rows == []
