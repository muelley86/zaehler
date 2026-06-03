from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from meters.models import MeasuringPoint, User, UserMeasuringPointAccess


def _setup_water_mp(admin_client: TestClient) -> int:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasser Garten",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "W-0001",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "100.000"},
        },
    )
    assert resp.status_code == 201, resp.text
    body: dict[str, object] = resp.json()
    register_id: int = body["physical_meters"][0]["registers"][0]["id"]  # type: ignore[index]
    return register_id


def _grant_recorder_access_to_first_mp(db: Session, *, recorder: User, granted_by: User) -> None:
    """Per-Recorder MP-Zugriff (Feature B): seit 78f79fe haben Recorder
    standardmäßig keinen MP-Zugriff. Diese Helper-Funktion vergibt der
    Recorder-User Zugriff auf alle existierenden MPs — ausreichend für
    die Reading-Lifecycle-Tests, die sich nicht für die Filter-Semantik
    interessieren, sondern den Reading-Workflow als Recorder testen."""
    for mp_id in db.scalars(select(MeasuringPoint.id)):
        existing = db.get(UserMeasuringPointAccess, (recorder.id, mp_id))
        if existing is not None:
            continue
        db.add(
            UserMeasuringPointAccess(
                user_id=recorder.id,
                measuring_point_id=mp_id,
                granted_by_user_id=granted_by.id,
            )
        )
    db.commit()


def test_create_reading(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    resp = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "123.456", "reading_at": "2025-01-01T12:00:00"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["value"] == "123.456"


def test_duplicate_date_returns_409_with_existing(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "120.0", "reading_at": "2025-01-01T12:00:00"},
    )
    resp = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "121.0", "reading_at": "2025-01-01T12:00:00"},
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["title"] == "Reading already exists at this timestamp"
    assert "existing" in body
    assert body["existing"]["value"] == "120.0"


def test_recorder_can_create_but_only_edit_within_window(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    register_id = _setup_water_mp(admin_client)
    _grant_recorder_access_to_first_mp(db, recorder=recorder_user, granted_by=admin_user)
    create = recorder_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "150.0", "reading_at": "2025-02-01T12:00:00"},
    )
    assert create.status_code == 201, create.text
    rid = create.json()["id"]
    update = recorder_client.patch(f"/api/v1/readings/{rid}", json={"note": "korrigiert"})
    assert update.status_code == 200


def test_recorder_cannot_edit_others_reading(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    register_id = _setup_water_mp(admin_client)
    _grant_recorder_access_to_first_mp(db, recorder=recorder_user, granted_by=admin_user)
    create = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "150.0", "reading_at": "2025-03-01T12:00:00"},
    )
    rid = create.json()["id"]
    update = recorder_client.patch(f"/api/v1/readings/{rid}", json={"note": "fremd"})
    assert update.status_code == 403


def test_filter_by_measuring_point_and_date(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    for d, v in [
        ("2025-01-15T12:00:00", "120"),
        ("2025-02-15T12:00:00", "140"),
        ("2025-03-15T12:00:00", "160"),
    ]:
        admin_client.post(
            "/api/v1/readings",
            json={"register_id": register_id, "value": v, "reading_at": d},
        )
    # Filter via from/to
    resp = admin_client.get(
        "/api/v1/readings",
        params={"from_at": "2025-02-01T00:00:00", "to_at": "2025-02-28T23:59:59"},
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["reading_at"].startswith("2025-02-15")


def test_multiple_readings_per_day(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    a = admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "150",
            "reading_at": "2025-04-01T08:00:00",
        },
    )
    b = admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "152",
            "reading_at": "2025-04-01T18:00:00",
        },
    )
    assert a.status_code == 201, a.text
    assert b.status_code == 201, b.text


def test_cumulative_value_must_not_decrease(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "200",
            "reading_at": "2025-05-01T12:00:00",
        },
    )
    # Niedrigerer Wert NACH einem höheren → Fehler
    resp = admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "180",
            "reading_at": "2025-05-15T12:00:00",
        },
    )
    assert resp.status_code == 400
    assert "previous" in resp.json()


def test_backdated_reading_must_fit_series(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "200",
            "reading_at": "2025-06-01T12:00:00",
        },
    )
    # Rückdatieren mit höherem Wert als der bereits vorhandene → Fehler
    resp = admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "250",
            "reading_at": "2025-05-15T12:00:00",
        },
    )
    assert resp.status_code == 400
    assert "next" in resp.json()
    # Rückdatieren mit Wert in der gültigen Bandbreite → OK
    ok = admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "150",
            "reading_at": "2025-05-15T12:00:00",
        },
    )
    assert ok.status_code == 201, ok.text


def test_filter_by_measuring_point(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "200", "reading_at": "2025-04-01T12:00:00"},
    )
    # Hole MP-ID aus dem Register-Pfad
    points = admin_client.get("/api/v1/measuring-points").json()
    mp_id = points[0]["id"]
    resp = admin_client.get("/api/v1/readings", params={"measuring_point_id": mp_id})
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_409_includes_existing_creator(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    """Audit 5.3: 409 Conflict bei doppeltem (register_id, reading_at) liefert
    den Ersteller-Hinweis (Vergleichsdialog im Frontend)."""
    register_id = _setup_water_mp(admin_client)
    _grant_recorder_access_to_first_mp(db, recorder=recorder_user, granted_by=admin_user)
    first = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "300", "reading_at": "2025-07-01T12:00:00"},
    )
    assert first.status_code == 201
    # Recorder versucht denselben Slot — bekommt 409 mit existing.created_by_user_id
    conflict = recorder_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "301", "reading_at": "2025-07-01T12:00:00"},
    )
    assert conflict.status_code == 409
    body = conflict.json()
    assert body["existing"]["value"] == "300"
    assert body["existing"]["created_by_user_id"] is not None


def test_acknowledge_warnings_overrides_plausibility_block(admin_client: TestClient) -> None:
    """Audit 5.8: Plausibilitäts-Verstoß ist Warnung, kein harter Block.

    CLAUDE.md fordert: ``Warnung, nicht harter Block``. Das Backend wirft im
    ersten Aufruf 400, akzeptiert aber bei ``acknowledge_warnings=true`` den
    Wert — das Frontend zeigt dazwischen einen Confirm-Dialog.
    """
    register_id = _setup_water_mp(admin_client)
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "300", "reading_at": "2025-07-01T12:00:00"},
    )

    # Erster Versuch: Wert kleiner als Vorgänger → 400 mit acknowledge_field
    blocked = admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "250",
            "reading_at": "2025-08-01T12:00:00",
        },
    )
    assert blocked.status_code == 400
    body = blocked.json()
    assert body.get("acknowledge_field") == "acknowledge_warnings"
    assert "previous" in body

    # Zweiter Versuch mit acknowledge_warnings=true → 201 (Frontend hat
    # Bestätigung eingeholt, Backend speichert ohne weitere Prüfung).
    confirmed = admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "250",
            "reading_at": "2025-08-01T12:00:00",
            "acknowledge_warnings": True,
        },
    )
    assert confirmed.status_code == 201, confirmed.text


def test_acknowledge_warnings_on_update(admin_client: TestClient) -> None:
    """Audit 5.8: Auch beim PATCH wirkt ``acknowledge_warnings``."""
    register_id = _setup_water_mp(admin_client)
    a = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "300", "reading_at": "2025-09-01T12:00:00"},
    ).json()
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "320", "reading_at": "2025-10-01T12:00:00"},
    )

    # Versuche, den 09-01-Reading auf 350 zu erhöhen → würde Nachfolger 320 brechen
    blocked = admin_client.patch(
        f"/api/v1/readings/{a['id']}",
        json={"value": "350"},
    )
    assert blocked.status_code == 400
    assert blocked.json().get("acknowledge_field") == "acknowledge_warnings"

    # Mit Bestätigung → durchgelassen
    ok = admin_client.patch(
        f"/api/v1/readings/{a['id']}",
        json={"value": "350", "acknowledge_warnings": True},
    )
    assert ok.status_code == 200


def test_recorder_24h_boundary(
    admin_client: TestClient,
    recorder_user: User,
    admin_user: User,
    db: Session,
) -> None:
    """Audit 5.6: nach Ablauf des 24h-Fensters ist PATCH/DELETE für recorder verboten."""
    from datetime import UTC, datetime, timedelta

    from meters.models import Reading

    register_id = _setup_water_mp(admin_client)
    _grant_recorder_access_to_first_mp(db, recorder=recorder_user, granted_by=admin_user)
    # Reading direkt in der DB anlegen mit künstlich altem created_at
    reading = Reading(
        register_id=register_id,
        value=__import__("decimal").Decimal("250"),
        reading_at=datetime(2025, 6, 1, 12, 0, 0),
        created_by_user_id=recorder_user.id,
    )
    db.add(reading)
    db.flush()
    # Created_at künstlich auf vor 25 Stunden zurückdrehen
    reading.created_at = datetime.now(UTC) - timedelta(hours=25)
    db.commit()
    rid = reading.id

    # Recorder-Login + Edit-Versuch
    with TestClient(__import__("meters.main", fromlist=["app"]).app) as recorder:
        login = recorder.post(
            "/api/v1/auth/login",
            json={"username": "recorder", "password": "recorder-pass-1234"},
        )
        assert login.status_code == 200
        edit = recorder.patch(f"/api/v1/readings/{rid}", json={"note": "spät"})
        assert edit.status_code == 403


def test_reading_at_now_with_z_suffix_is_accepted(admin_client: TestClient) -> None:
    """Frontend muss aware ISO mit Z senden — sonst wuerde der Backend-
    Future-Validator naive Strings als UTC interpretieren und lokale
    Zeiten aus Zonen oestlich von UTC als Zukunft verwerfen.

    Dokumentiert, dass das Backend "jetzt" als aware ISO-Z akzeptiert.
    """
    from datetime import UTC, datetime

    register_id = _setup_water_mp(admin_client)
    now_z = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    resp = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "200.0", "reading_at": now_z},
    )
    assert resp.status_code == 201, resp.text


def test_reading_at_naive_local_time_two_hours_ahead_rejected(
    admin_client: TestClient,
) -> None:
    """Negativ-Doku: ein naiver String, der als UTC um den lokalen Offset
    in der Zukunft liegt (z. B. CEST-User sendet 22:00 ohne Z, Backend
    liest 22:00 UTC waehrend echtes Jetzt 20:00 UTC ist), wird vom
    Future-Validator mit 422 abgelehnt. Genau dieser Pfad war der Bug
    vor dem ``localInputToIso``-Frontend-Fix.
    """
    from datetime import UTC, datetime, timedelta

    register_id = _setup_water_mp(admin_client)
    # +2h naiv (kein Z, keine Offset-Angabe) simuliert lokale CEST-Zeit,
    # die das Backend irrtuemlich als UTC liest.
    future_naive = (datetime.now(UTC) + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S")
    resp = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "200.0", "reading_at": future_naive},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert "errors" in body
    assert any("Zukunft" in str(e) for e in body["errors"])


def _second_water_mp(admin_client: TestClient) -> int:
    """Zweite Wasser-MP (anderer Serial) für No-Access-Szenarien."""
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasser Hof",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "W-0002",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "10.000"},
        },
    )
    assert resp.status_code == 201, resp.text
    body: dict[str, object] = resp.json()
    register_id: int = body["physical_meters"][0]["registers"][0]["id"]  # type: ignore[index]
    return register_id


def _create_reading(admin_client: TestClient, register_id: int, value: str, at: str) -> int:
    resp = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": value, "reading_at": at},
    )
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def test_bulk_delete_readings_admin(admin_client: TestClient, db: Session) -> None:
    """Admin löscht mehrere Erfassungen auf einmal; pro Eintrag ein Audit-DELETE."""
    from meters.models import AuditAction, AuditEntityType, AuditLog

    register_id = _setup_water_mp(admin_client)
    ids = [
        _create_reading(admin_client, register_id, "110", "2025-01-01T12:00:00"),
        _create_reading(admin_client, register_id, "120", "2025-02-01T12:00:00"),
        _create_reading(admin_client, register_id, "130", "2025-03-01T12:00:00"),
    ]

    resp = admin_client.post("/api/v1/readings/bulk-delete", json={"ids": ids})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted"] == 3
    assert body["skipped"] == []

    # Die MP-Anlage erzeugt eine Initial-Erfassung — nur die 3 erzeugten IDs
    # dürfen weg sein.
    remaining = {r["id"] for r in admin_client.get("/api/v1/readings").json()}
    assert remaining.isdisjoint(ids)
    audit_count = db.scalar(
        select(func.count())
        .select_from(AuditLog)
        .where(
            AuditLog.action == AuditAction.DELETE,
            AuditLog.entity_type == AuditEntityType.READING,
        )
    )
    assert audit_count == 3


def test_bulk_delete_readings_skips_unknown(admin_client: TestClient) -> None:
    """Unbekannte IDs werden übersprungen (not_found), der Rest gelöscht."""
    register_id = _setup_water_mp(admin_client)
    a = _create_reading(admin_client, register_id, "110", "2025-01-01T12:00:00")
    b = _create_reading(admin_client, register_id, "120", "2025-02-01T12:00:00")

    resp = admin_client.post("/api/v1/readings/bulk-delete", json={"ids": [a, 999999, b]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted"] == 2
    assert body["skipped"] == [{"id": 999999, "reason": "not_found"}]
    remaining = {r["id"] for r in admin_client.get("/api/v1/readings").json()}
    assert remaining.isdisjoint({a, b})


def test_bulk_delete_readings_empty_list_rejected(admin_client: TestClient) -> None:
    """Leere ID-Liste verstößt gegen min_length → 422."""
    resp = admin_client.post("/api/v1/readings/bulk-delete", json={"ids": []})
    assert resp.status_code == 422


def test_bulk_delete_readings_recorder_permissions(
    admin_client: TestClient,
    recorder_client: TestClient,
    recorder_user: User,
    admin_user: User,
    db: Session,
) -> None:
    """Recorder löscht im Batch nur eigene <24h auf zugänglichen MPs;
    fremde/alte → forbidden, nicht-zugängliche MP → no_access."""
    from datetime import UTC, datetime, timedelta
    from decimal import Decimal

    from meters.models import Reading

    register_id = _setup_water_mp(admin_client)
    _grant_recorder_access_to_first_mp(db, recorder=recorder_user, granted_by=admin_user)
    # Zweite MP NACH dem Grant anlegen → Recorder hat hierauf KEINEN Zugriff.
    other_register_id = _second_water_mp(admin_client)

    # A: eigene, frische Erfassung des Recorders → löschbar
    a = _create_reading(recorder_client, register_id, "150", "2025-05-01T12:00:00")
    # B: Erfassung des Admins (nicht des Recorders) → forbidden
    b = _create_reading(admin_client, register_id, "160", "2025-06-01T12:00:00")
    # D: Erfassung auf nicht-zugänglicher MP → no_access
    d = _create_reading(admin_client, other_register_id, "20", "2025-06-01T12:00:00")
    # C: eigene Erfassung des Recorders, aber künstlich > 24h alt → forbidden
    old = Reading(
        register_id=register_id,
        value=Decimal("170"),
        reading_at=datetime(2025, 4, 1, 12, 0, 0),
        created_by_user_id=recorder_user.id,
    )
    db.add(old)
    db.flush()
    old.created_at = datetime.now(UTC) - timedelta(hours=25)
    db.commit()
    c = old.id

    resp = recorder_client.post("/api/v1/readings/bulk-delete", json={"ids": [a, b, c, d]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted"] == 1
    reasons = {item["id"]: item["reason"] for item in body["skipped"]}
    assert reasons == {b: "forbidden", c: "forbidden", d: "no_access"}

    # Nur A ist weg; B, C, D bestehen weiter (neben den Initial-Erfassungen).
    remaining = {r["id"] for r in admin_client.get("/api/v1/readings").json()}
    assert a not in remaining
    assert {b, c, d} <= remaining
