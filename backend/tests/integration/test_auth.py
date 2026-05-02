from __future__ import annotations

from fastapi.testclient import TestClient

from meters.models import User


def test_login_sets_cookie(client: TestClient, admin_user: User) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin-pass-12345"},
    )
    assert resp.status_code == 200
    assert resp.json()["username"] == "admin"
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
