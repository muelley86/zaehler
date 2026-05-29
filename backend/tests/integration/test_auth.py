from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from meters.models import User


def test_login_sets_cookie(client: TestClient, admin_user: User) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin-pass-12345"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["requires_2fa"] is False
    assert body["me"]["username"] == "admin"
    assert "meters_session" in resp.cookies


def test_login_rejects_wrong_password(client: TestClient, admin_user: User) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "wrong-password-123"},
    )
    assert resp.status_code == 401
    assert resp.headers["content-type"].startswith("application/problem+json")


def test_me_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401


def test_me_returns_self(admin_client: TestClient) -> None:
    resp = admin_client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"


def test_logout_clears_session(admin_client: TestClient) -> None:
    resp = admin_client.post("/api/v1/auth/logout")
    assert resp.status_code == 204
    follow_up = admin_client.get("/api/v1/auth/me")
    assert follow_up.status_code == 401


def test_rate_limit_locks_after_repeated_failures(client: TestClient, admin_user: User) -> None:
    for _ in range(5):
        client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "wrong"},
        )
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin-pass-12345"},
    )
    assert resp.status_code == 429


def test_change_password(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "admin-pass-12345", "new_password": "neues-passwort-1234"},
    )
    assert resp.status_code == 200
    relogin = admin_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "neues-passwort-1234"},
    )
    assert relogin.status_code == 200


def test_2fa_setup_activate_and_login_flow(admin_client: TestClient) -> None:
    import pyotp

    setup = admin_client.post("/api/v1/auth/2fa/setup")
    assert setup.status_code == 200
    secret = setup.json()["secret"]
    assert len(secret) >= 16

    bad = admin_client.post("/api/v1/auth/2fa/activate", json={"code": "000000"})
    assert bad.status_code == 400

    valid_code = pyotp.TOTP(secret).now()
    activated = admin_client.post("/api/v1/auth/2fa/activate", json={"code": valid_code})
    assert activated.status_code == 200
    backup_codes = activated.json()["backup_codes"]
    assert len(backup_codes) == 10

    status = admin_client.get("/api/v1/auth/2fa/status")
    assert status.status_code == 200
    assert status.json()["enabled"] is True
    assert status.json()["backup_codes_remaining"] == 10

    # Login Step 1: Username/Passwort → fordert 2FA
    fresh = TestClient(admin_client.app)
    step1 = fresh.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin-pass-12345"},
    )
    assert step1.status_code == 200
    body = step1.json()
    assert body["requires_2fa"] is True
    assert body["me"] is None
    challenge = body["challenge_token"]
    assert "meters_session" not in fresh.cookies

    # Login Step 2: TOTP-Code
    step2 = fresh.post(
        "/api/v1/auth/2fa/verify",
        json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
    )
    assert step2.status_code == 200
    assert step2.json()["username"] == "admin"
    assert "meters_session" in fresh.cookies

    # Backup-Code-Login funktioniert
    fresh2 = TestClient(admin_client.app)
    s1 = fresh2.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin-pass-12345"},
    )
    s2 = fresh2.post(
        "/api/v1/auth/2fa/verify",
        json={"challenge_token": s1.json()["challenge_token"], "code": backup_codes[0]},
    )
    assert s2.status_code == 200
    # Verbrauchter Code geht nicht zweimal
    fresh3 = TestClient(admin_client.app)
    s3 = fresh3.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin-pass-12345"},
    )
    s4 = fresh3.post(
        "/api/v1/auth/2fa/verify",
        json={"challenge_token": s3.json()["challenge_token"], "code": backup_codes[0]},
    )
    assert s4.status_code == 401


def test_2fa_disable_requires_password_and_code(admin_client: TestClient) -> None:
    import pyotp

    setup = admin_client.post("/api/v1/auth/2fa/setup")
    secret = setup.json()["secret"]
    admin_client.post(
        "/api/v1/auth/2fa/activate",
        json={"code": pyotp.TOTP(secret).now()},
    )

    bad_pw = admin_client.post(
        "/api/v1/auth/2fa/disable",
        json={"current_password": "wrong-pw-1234", "code": pyotp.TOTP(secret).now()},
    )
    assert bad_pw.status_code == 400

    no_code = admin_client.post(
        "/api/v1/auth/2fa/disable",
        json={"current_password": "admin-pass-12345"},
    )
    assert no_code.status_code == 400

    ok = admin_client.post(
        "/api/v1/auth/2fa/disable",
        json={
            "current_password": "admin-pass-12345",
            "code": pyotp.TOTP(secret).now(),
        },
    )
    assert ok.status_code == 200
    assert ok.json()["totp_enabled"] is False


def test_2fa_challenge_expires_after_ttl(admin_client: TestClient) -> None:
    """Audit 5.4: Pending-Challenge wird nach 5 Min abgelehnt.

    Der Datenbank-Zeitstempel wird künstlich in die Vergangenheit gesetzt;
    danach muss ``/2fa/verify`` mit 401 ablehnen, auch wenn der TOTP-Code
    formal gültig wäre.
    """
    from datetime import UTC, datetime, timedelta

    import pyotp

    from meters.db import SessionLocal
    from meters.models import PendingTotpChallenge

    setup = admin_client.post("/api/v1/auth/2fa/setup")
    secret = setup.json()["secret"]
    admin_client.post(
        "/api/v1/auth/2fa/activate",
        json={"code": pyotp.TOTP(secret).now()},
    )

    fresh = TestClient(admin_client.app)
    step1 = fresh.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin-pass-12345"},
    )
    challenge_token = step1.json()["challenge_token"]
    assert challenge_token

    # Künstlich altern lassen: setze expires_at 1 Sekunde in die Vergangenheit
    with SessionLocal() as db:
        ch = db.query(PendingTotpChallenge).first()
        assert ch is not None
        ch.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()

    expired = fresh.post(
        "/api/v1/auth/2fa/verify",
        json={"challenge_token": challenge_token, "code": pyotp.TOTP(secret).now()},
    )
    assert expired.status_code == 401


def test_2fa_drift_tolerance(admin_client: TestClient) -> None:
    """Audit 5.4: pyotp.verify mit ``valid_window=1`` toleriert ±30 s Drift."""
    import pyotp

    setup = admin_client.post("/api/v1/auth/2fa/setup")
    secret = setup.json()["secret"]
    admin_client.post(
        "/api/v1/auth/2fa/activate",
        json={"code": pyotp.TOTP(secret).now()},
    )

    fresh = TestClient(admin_client.app)
    step1 = fresh.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin-pass-12345"},
    )
    challenge = step1.json()["challenge_token"]

    # Code aus dem vorherigen 30-Sekunden-Fenster (-1 Step) sollte akzeptiert sein
    totp = pyotp.TOTP(secret)
    now_t = int(__import__("time").time())
    prev_code = totp.at(now_t - 30)
    resp = fresh.post(
        "/api/v1/auth/2fa/verify",
        json={"challenge_token": challenge, "code": prev_code},
    )
    assert resp.status_code == 200, resp.text


def test_force_password_change_blocks_other_endpoints(client: TestClient, admin_user: User) -> None:
    """Audit 5.10: User mit ``force_password_change=true`` darf keine anderen
    Endpoints aufrufen — er muss erst ``/auth/change-password`` durchlaufen."""
    from meters.db import SessionLocal

    # Flag setzen
    with SessionLocal() as db:
        u = db.query(User).filter(User.username == "admin").first()
        assert u is not None
        u.force_password_change = True
        db.commit()

    login = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin-pass-12345"},
    )
    assert login.status_code == 200
    assert login.json()["me"]["force_password_change"] is True

    # Aufruf eines normalen Endpoints sollte abgewiesen werden
    blocked = client.get("/api/v1/measuring-points")
    assert blocked.status_code in (401, 403)

    # /auth/change-password muss durchgehen
    change = client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "admin-pass-12345",
            "new_password": "neues-passwort-1234",
        },
    )
    assert change.status_code == 200
    assert change.json()["force_password_change"] is False

    # Jetzt funktioniert auch der Listen-Endpoint
    after = client.get("/api/v1/measuring-points")
    assert after.status_code == 200


def test_2fa_challenge_bound_to_user_agent(admin_client: TestClient) -> None:
    """Pending-Challenge wird beim Erzeugen mit UA gespeichert; eine
    Verify-Request mit anderer UA muss abgelehnt werden, sonst wäre der
    abgegriffene Challenge-Token wiederverwendbar."""
    import pyotp

    # Setup: 2FA aktivieren
    setup = admin_client.post("/api/v1/auth/2fa/setup")
    secret = setup.json()["secret"]
    admin_client.post(
        "/api/v1/auth/2fa/activate",
        json={"code": pyotp.TOTP(secret).now()},
    )

    # Login Step 1 in einem neuen Client (UA = "test-agent-A")
    a = TestClient(admin_client.app, headers={"user-agent": "test-agent-A"})
    step1 = a.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin-pass-12345"},
    )
    assert step1.status_code == 200
    challenge_token = step1.json()["challenge_token"]
    assert challenge_token

    # Step 2 in einem anderen Client (UA = "test-agent-B") — gleicher
    # Challenge-Token, aber andere UA → muss 401 sein.
    import time

    time.sleep(1)  # neuer TOTP-Counter, damit Code nicht aus Step 1 wirkt
    b = TestClient(admin_client.app, headers={"user-agent": "test-agent-B"})
    bad = b.post(
        "/api/v1/auth/2fa/verify",
        json={"challenge_token": challenge_token, "code": pyotp.TOTP(secret).now()},
    )
    assert bad.status_code == 401, bad.text


def test_datetimes_serialized_as_utc_with_z_suffix(
    admin_client: TestClient, admin_user: User
) -> None:
    """Server-erzeugte Zeitstempel müssen mit ``Z`` enden, sonst interpretiert
    der Browser sie als lokale Zeit (ES2017) und die Anzeige ist um den UTC-
    Offset verschoben."""
    me = admin_client.get("/api/v1/auth/me")
    assert me.status_code == 200
    last_login = me.json()["last_login_at"]
    assert isinstance(last_login, str)
    assert last_login.endswith("Z"), last_login

    users = admin_client.get("/api/v1/users")
    assert users.status_code == 200
    rows = users.json()
    assert rows
    for row in rows:
        assert row["created_at"].endswith("Z"), row
        if row["last_login_at"] is not None:
            assert row["last_login_at"].endswith("Z"), row


def test_login_blocked_for_inactive_user(client: TestClient, db: Session) -> None:
    """Deaktivierter User (is_active=False) darf nicht einloggen — auch nicht
    mit korrektem Passwort."""
    from meters.core.security import hash_password
    from meters.models import User, UserRole

    db.add(
        User(
            username="deactivated",
            email=None,
            password_hash=hash_password("ungelogen-1234"),
            role=UserRole.RECORDER,
            is_active=False,
            force_password_change=False,
        )
    )
    db.commit()

    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "deactivated", "password": "ungelogen-1234"},
    )
    assert resp.status_code == 401, resp.text


def test_2fa_verify_throttled_per_username(admin_client: TestClient, client: TestClient) -> None:
    """Tier-1-Härtung: ``/2fa/verify`` drosselt zusätzlich pro Username.

    Schützt gegen 2FA-Code-Brute-Force, wenn ein Angreifer per IP-Rotation den
    IP-Limiter umgeht. Ein legitimer Nutzer mit korrektem Code ist nicht
    betroffen — geprüft wird die Sperre, nicht der Code.
    """
    import pyotp

    from meters.services.rate_limit import username_limiter

    setup = admin_client.post("/api/v1/auth/2fa/setup")
    secret = setup.json()["secret"]
    activated = admin_client.post(
        "/api/v1/auth/2fa/activate", json={"code": pyotp.TOTP(secret).now()}
    )
    assert activated.status_code == 200, activated.text

    login = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin-pass-12345"},
    )
    assert login.json()["requires_2fa"] is True
    challenge = login.json()["challenge_token"]

    # Username-Bucket hart sperren, ohne den IP-Limiter zu triggern (der
    # erfolgreiche Passwort-Schritt oben hat beide Buckets geleert).
    username_limiter._state.clear()
    for _ in range(username_limiter._max):
        username_limiter.record_failure("admin")

    try:
        resp = client.post(
            "/api/v1/auth/2fa/verify",
            json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
        )
        assert resp.status_code == 429, resp.text
        assert "2FA" in resp.json()["detail"]
    finally:
        # username_limiter wird (anders als login_limiter) vom conftest-
        # Cleanup nicht zurückgesetzt — hier selbst aufräumen.
        username_limiter._state.clear()
