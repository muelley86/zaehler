"""Tests für den SPA-Fallback-Routing-Layer in :mod:`meters.main`.

Die Catch-All-Route ``GET /{full_path:path}`` muss drei verschiedene
Eingaben sauber unterscheiden:

1. **Unbekannter API-Pfad** (``/api/...``) -> 404 als ``application/
   problem+json``. Vorher wurde stattdessen die ``index.html`` mit 200
   ausgeliefert -- API-Clients bekamen HTML statt Fehler-JSON.
2. **Echte Static-Files** (``manifest.webmanifest``, ``sw.js``, Icons,
   ``theme-bootstrap.js``) -> direkt aus dem Static-Dir.
3. **Frontend-Routen** (``/``, ``/erfassen``, ``/q/X``, beliebig) ->
   ``index.html`` mit Status 200, damit der React-Router clientseitig
   übernehmen kann.
"""

from __future__ import annotations

import asyncio
from collections.abc import MutableMapping
from typing import Any

from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# 1) Unbekannter /api/-Pfad -> RFC-7807-404
# ---------------------------------------------------------------------------


def test_unknown_api_path_returns_problem_json_404(admin_client: TestClient) -> None:
    resp = admin_client.get("/api/v1/dieses-endpoint-existiert-nicht")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/problem+json")
    body = resp.json()
    assert body["status"] == 404
    assert body["title"] == "Not Found"
    assert "Unbekannter API-Pfad" in body["detail"]


def test_unknown_api_path_works_unauthenticated(admin_client: TestClient) -> None:
    """Auch ohne Login muss ein unbekannter API-Pfad als JSON-404 kommen
    -- nicht als index.html. Wir nutzen den admin_client lediglich als
    bequeme TestClient-Source, der Logout passiert via Cookie-Reset."""
    admin_client.cookies.clear()
    resp = admin_client.get("/api/v1/foo/bar/baz")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/problem+json")


def test_legacy_mp_qr_endpoint_returns_404(admin_client: TestClient) -> None:
    """Konkreter Regressions-Anker: Der frühere Endpoint
    ``/measuring-points/{id}/qr`` wurde mit Feature A entfernt; ein
    Aufruf darf nicht heimlich auf der SPA landen."""
    payload = {
        "name": "QR-Smoketest",
        "type": "water",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": "SN-SPA",
        "installed_at": "2024-01-01",
        "initial_values": {"water": "0.0"},
    }
    mp = admin_client.post("/api/v1/measuring-points", json=payload).json()
    resp = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/qr")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/problem+json")


# ---------------------------------------------------------------------------
# 2) Static-Files passieren weiterhin
# ---------------------------------------------------------------------------


def test_manifest_is_served_directly(admin_client: TestClient) -> None:
    resp = admin_client.get("/manifest.webmanifest")
    assert resp.status_code == 200
    # Echte Datei -- kein HTML-Inhalt.
    assert "<!doctype html" not in resp.text.lower()


# ---------------------------------------------------------------------------
# 3) Frontend-Routen liefern index.html
# ---------------------------------------------------------------------------


def test_root_serves_index_html(admin_client: TestClient) -> None:
    resp = admin_client.get("/")
    assert resp.status_code == 200
    assert "<!doctype html" in resp.text.lower() or "<html" in resp.text.lower()


def test_arbitrary_frontend_route_serves_index_html(admin_client: TestClient) -> None:
    """``/q/<token>`` oder beliebige andere Client-Routen müssen das
    SPA-Shell laden, damit der React-Router übernehmen kann."""
    resp = admin_client.get("/q/K7MP3X9F")
    assert resp.status_code == 200
    assert "<!doctype html" in resp.text.lower() or "<html" in resp.text.lower()


def test_deeply_nested_frontend_route_serves_index_html(admin_client: TestClient) -> None:
    resp = admin_client.get("/messstellen/42/details")
    assert resp.status_code == 200
    assert "<!doctype html" in resp.text.lower() or "<html" in resp.text.lower()


# ---------------------------------------------------------------------------
# 4) Path-Traversal im SPA-Fallback
# ---------------------------------------------------------------------------


def _raw_get(client: TestClient, raw_path: str) -> tuple[int, bytes]:
    """Ruft die ASGI-App mit einem *unnormalisierten* Pfad auf.

    Der Umweg ist notwendig: ``TestClient``/httpx loesen ``..`` bereits
    clientseitig auf, ein Test ueber ``client.get(...)`` wuerde also am
    Problem vorbeilaufen und immer gruen sein. uvicorn reicht den Pfad
    dagegen prozentdekodiert und unnormalisiert in ``scope["path"]``
    durch -- genau das bilden wir hier nach.
    """
    scope: MutableMapping[str, Any] = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": raw_path,
        "raw_path": raw_path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(b"host", b"testserver")],
        "client": ("127.0.0.1", 9999),
        "server": ("testserver", 80),
    }
    status: list[int] = []
    body = bytearray()

    async def receive() -> MutableMapping[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: MutableMapping[str, Any]) -> None:
        if message["type"] == "http.response.start":
            status.append(int(message["status"]))
        elif message["type"] == "http.response.body":
            body.extend(bytes(message.get("body", b"")))

    async def drive() -> None:
        await client.app(scope, receive, send)

    asyncio.run(drive())
    return status[0], bytes(body)


def test_spa_fallback_rejects_path_traversal(admin_client: TestClient) -> None:
    """Unauthentifizierter Arbitrary File Read ueber die Catch-All-Route.

    Vor dem Fix lieferte ``GET /..%2f..%2f..%2f..%2fdata%2fmeters.db``
    die komplette SQLite-Datenbank mit 200 aus -- ohne Login, weil die
    Route bewusst keine Auth-Dependency hat. Betroffen waren damit auch
    ``.env`` (METERS_SECRET_KEY) und alle Fotos unter ``data/media/``.
    """
    admin_client.cookies.clear()
    for raw_path in (
        "/../../../pyproject.toml",
        "/../../../../data/meters.db",
        "/../../../../.env",
        "/..%2f..%2f..%2fpyproject.toml",
        "/static/../../../pyproject.toml",
    ):
        status, body = _raw_get(admin_client, raw_path)
        # Der Fallback darf hoechstens die SPA-Shell ausliefern, niemals
        # eine Datei ausserhalb des Static-Verzeichnisses.
        assert b"SQLite format 3" not in body, raw_path
        assert b"[project]" not in body, raw_path
        assert b"METERS_SECRET_KEY" not in body, raw_path
        if status == 200:
            assert b"<!doctype html" in body.lower() or b"<html" in body.lower(), raw_path


def test_spa_fallback_still_serves_static_files_via_raw_scope(
    admin_client: TestClient,
) -> None:
    """Gegenprobe: der Containment-Check darf legitime Dateien nicht blocken."""
    status, body = _raw_get(admin_client, "/manifest.webmanifest")
    assert status == 200
    assert b"<!doctype html" not in body.lower()
