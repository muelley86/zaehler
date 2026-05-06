"""Integration-Tests für ``GET /measuring-points/{id}/qr``.

QR-Erzeugung ist admin-only und liefert PNG (Default) oder SVG. Der QR-Code
selbst zeigt auf ``/erfassen?mp={id}`` — wir verifizieren das nicht über
einen Decoder, sondern über die Service-Helper-Tests; hier prüfen wir nur
die HTTP-Schicht (Auth, Content-Type, Cache-Control, Edge-Cases).
"""

from __future__ import annotations

from typing import Any, cast

from fastapi.testclient import TestClient


def _create_water(client: TestClient) -> dict[str, Any]:
    payload = {
        "name": "Wasseruhr Garten",
        "type": "water",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": "W-QR-1",
        "installed_at": "2024-01-01",
        "initial_values": {"water": "0.0"},
    }
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def test_admin_can_get_qr_png(admin_client: TestClient) -> None:
    mp = _create_water(admin_client)
    resp = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/qr")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("image/png")
    assert resp.headers["cache-control"] == "no-store"
    assert resp.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_admin_can_get_qr_svg(admin_client: TestClient) -> None:
    mp = _create_water(admin_client)
    resp = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/qr?format=svg")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("image/svg+xml")
    body = resp.text
    assert "<svg" in body


def test_qr_size_param_changes_payload(admin_client: TestClient) -> None:
    mp = _create_water(admin_client)
    small = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/qr?size=small")
    large = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/qr?size=large")
    assert small.status_code == 200
    assert large.status_code == 200
    # Größere box_size → mehr Pixel → mehr PNG-Bytes.
    assert len(large.content) > len(small.content)


def test_recorder_cannot_get_qr(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    mp = _create_water(admin_client)
    resp = recorder_client.get(f"/api/v1/measuring-points/{mp['id']}/qr")
    assert resp.status_code == 403


def test_anonymous_cannot_get_qr(admin_client: TestClient, client: TestClient) -> None:
    mp = _create_water(admin_client)
    resp = client.get(f"/api/v1/measuring-points/{mp['id']}/qr")
    assert resp.status_code == 401


def test_qr_returns_404_for_missing_mp(admin_client: TestClient) -> None:
    resp = admin_client.get("/api/v1/measuring-points/99999/qr")
    assert resp.status_code == 404


def test_qr_invalid_format_returns_422(admin_client: TestClient) -> None:
    mp = _create_water(admin_client)
    resp = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/qr?format=jpg")
    assert resp.status_code == 422


def test_permissions_policy_allows_camera_self(admin_client: TestClient) -> None:
    """Verifiziert: nach Aktivierung des In-App-Scanners erlaubt die Policy
    Same-Origin-Kamera-Zugriff. Ohne diesen Header lehnt der Browser
    ``getUserMedia`` ab."""
    resp = admin_client.get("/api/v1/measuring-points")
    policy = resp.headers["permissions-policy"]
    assert "camera=(self)" in policy
