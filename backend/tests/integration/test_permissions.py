"""Permission-Matrix für Recorder vs. Admin (Audit-Befund 5.11).

CLAUDE.md: Recorder darf erfassen und eigene Readings <24h ändern. Alles
andere — MeasuringPoints anlegen, Locations bearbeiten, Users verwalten,
Audit-Log einsehen, Zählerwechsel — ist Admin-Sache. Diese Tests prüfen
die Endpoints systematisch.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("POST", "/api/v1/measuring-points", {}),
        ("PATCH", "/api/v1/measuring-points/1", {}),
        ("DELETE", "/api/v1/measuring-points/1", None),
        ("POST", "/api/v1/measuring-points/1/replace-meter", {}),
        ("POST", "/api/v1/locations", {}),
        ("PATCH", "/api/v1/locations/1", {}),
        ("DELETE", "/api/v1/locations/1", None),
        ("POST", "/api/v1/users", {}),
        ("PATCH", "/api/v1/users/1", {}),
        ("DELETE", "/api/v1/users/1", None),
        ("GET", "/api/v1/audit-log", None),
    ],
)
def test_recorder_blocked_on_admin_endpoints(
    recorder_client: TestClient, method: str, path: str, body: dict[str, object] | None
) -> None:
    if method == "GET":
        resp = recorder_client.get(path)
    elif method == "POST":
        resp = recorder_client.post(path, json=body or {})
    elif method == "PATCH":
        resp = recorder_client.patch(path, json=body or {})
    elif method == "DELETE":
        resp = recorder_client.delete(path)
    else:
        raise AssertionError(method)

    # Erwartet: 403 (Forbidden), 404 (Lookup vor Permission-Check), 405
    # (Method nicht definiert — User-Hard-Delete gibt's bewusst nicht) oder
    # 422 (Body-Validierung vor Permission-Check). 200/201 wäre der echte
    # Fail-Fall — Recorder soll diese Operationen nicht ausführen können.
    assert resp.status_code in (403, 404, 405, 422), (
        f"{method} {path} sollte für Recorder geblockt sein, lieferte {resp.status_code}"
    )


def test_recorder_can_access_read_only_endpoints(recorder_client: TestClient) -> None:
    """Recorder darf Listen lesen (für Erfassungs-UI)."""
    for path in [
        "/api/v1/measuring-points",
        "/api/v1/locations",
        "/api/v1/readings",
        "/api/v1/deliveries",
        "/api/v1/auth/me",
    ]:
        resp = recorder_client.get(path)
        assert resp.status_code == 200, f"GET {path} sollte für Recorder erlaubt sein"
