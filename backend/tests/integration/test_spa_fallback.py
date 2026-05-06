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
