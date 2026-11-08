"""Request-Body-Limit vor Auth und Parsing (Security-Audit #7).

Ohne gültige Session darf ein Client nur kleine Bodies schicken (Login,
2FA-Verify) — große Uploads werden abgelehnt, BEVOR Starlette sie in den
Multipart-Spool auf Platte oder als JSON in den RAM liest. Mit Session gilt
ein Gesamtlimit (Restore: eigenes, größeres Limit).
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
import starlette.datastructures as sd
from fastapi.testclient import TestClient

from meters.core.config import settings


@pytest.fixture
def spooled(monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    """Zählt, wie viele Bytes Starlette in Upload-Spools schreibt."""
    written = {"n": 0}
    orig = sd.UploadFile.write

    async def counting(self: sd.UploadFile, data: bytes) -> None:
        written["n"] += len(data)
        await orig(self, data)

    monkeypatch.setattr(sd.UploadFile, "write", counting)
    return written


def test_anonymous_large_upload_rejected_before_spooling(
    client: TestClient, spooled: dict[str, int]
) -> None:
    resp = client.post(
        "/api/v1/restore/upload",
        files={"file": ("x.zip", b"\0" * (8 * 1024 * 1024), "application/zip")},
    )
    assert resp.status_code == 413, resp.text
    assert resp.headers["content-type"].startswith("application/problem+json")
    assert spooled["n"] == 0


def test_anonymous_large_json_rejected(client: TestClient) -> None:
    body = b'{"username":"' + b"a" * (1024 * 1024) + b'","password":"x"}'
    resp = client.post(
        "/api/v1/auth/login", content=body, headers={"content-type": "application/json"}
    )
    assert resp.status_code == 413, resp.text


def test_anonymous_chunked_body_rejected(client: TestClient, spooled: dict[str, int]) -> None:
    def chunks() -> Iterator[bytes]:
        for _ in range(64):
            yield b"\0" * (64 * 1024)

    resp = client.post(
        "/api/v1/restore/upload",
        content=chunks(),
        headers={"content-type": "multipart/form-data; boundary=x"},
    )
    assert resp.status_code == 413, resp.text
    assert spooled["n"] == 0


def test_forged_session_cookie_gets_anonymous_limit(
    client: TestClient, spooled: dict[str, int]
) -> None:
    client.cookies.set("meters_session", "gefaelscht")
    resp = client.post(
        "/api/v1/readings/1/photos",
        files={"photo": ("m.jpg", b"\0" * (2 * 1024 * 1024), "image/jpeg")},
    )
    assert resp.status_code == 413, resp.text
    assert spooled["n"] == 0


def test_login_still_works(admin_user: object, client: TestClient) -> None:
    resp = client.post(
        "/api/v1/auth/login", json={"username": "admin", "password": "admin-pass-12345"}
    )
    assert resp.status_code == 200, resp.text


def test_authenticated_body_over_limit_rejected(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "request_max_body_bytes", 512 * 1024)
    monkeypatch.setattr(settings, "photo_max_upload_bytes", 0)
    resp = admin_client.post(
        "/api/v1/readings/1/photos",
        files={"photo": ("m.jpg", b"\0" * (2 * 1024 * 1024), "image/jpeg")},
    )
    assert resp.status_code == 413, resp.text


def test_raised_photo_limit_raises_body_limit(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "request_max_body_bytes", 512 * 1024)
    monkeypatch.setattr(settings, "photo_max_upload_bytes", 4 * 1024 * 1024)
    resp = admin_client.post(
        "/api/v1/readings/999999/photos",
        files={"photo": ("m.jpg", b"\0" * (2 * 1024 * 1024), "image/jpeg")},
    )
    assert resp.status_code == 404, resp.text


def test_authenticated_chunked_body_over_limit_rejected(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "request_max_body_bytes", 512 * 1024)
    monkeypatch.setattr(settings, "photo_max_upload_bytes", 0)

    def chunks() -> Iterator[bytes]:
        for _ in range(32):
            yield b"\0" * (64 * 1024)

    resp = admin_client.post(
        "/api/v1/readings/1/photos",
        content=chunks(),
        headers={"content-type": "multipart/form-data; boundary=x"},
    )
    assert resp.status_code == 413, resp.text


def test_authenticated_body_within_limit_reaches_route(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/readings/999999/photos",
        files={"photo": ("m.jpg", b"\0" * (1024 * 1024), "image/jpeg")},
    )
    # Nicht vom Limit abgefangen — die Route selbst antwortet (Reading fehlt).
    assert resp.status_code == 404, resp.text


def test_restore_has_its_own_larger_limit(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "request_max_body_bytes", 512 * 1024)
    resp = admin_client.post(
        "/api/v1/restore/upload",
        files={"file": ("x.zip", b"\0" * (1024 * 1024), "application/zip")},
    )
    assert resp.status_code != 413, resp.text
