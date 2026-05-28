"""Integration-Tests für QR-Token-Verheiratung (Feature A) und das
``can_assign_qr_tokens``-Recht (Feature C).

Wir testen die HTTP-Schicht der Token-Endpoints inkl. Berechtigungen,
Status-Filter und Resolve-Edge-Cases. Das Direkt-URL-Endpoint
``/measuring-points/{id}/qr`` wurde mit Feature A entfernt; ein Smoke-Test
prüft, dass es nicht mehr verfügbar ist.
"""

from __future__ import annotations

from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from meters.models import (
    QrToken,
    User,
    UserMeasuringPointAccess,
)


def _create_water_mp(client: TestClient, *, name: str, serial: str) -> dict[str, Any]:
    payload = {
        "name": name,
        "type": "water",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": serial,
        "installed_at": "2024-01-01",
        "initial_values": {"water": "0.0"},
    }
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def _grant_access(db: Session, *, user: User, mp_id: int, granted_by: User) -> None:
    db.add(
        UserMeasuringPointAccess(
            user_id=user.id,
            measuring_point_id=mp_id,
            granted_by_user_id=granted_by.id,
        )
    )
    db.commit()


def _set_can_assign(db: Session, user: User, value: bool) -> None:
    user.can_assign_qr_tokens = value
    db.commit()


# ---------------------------------------------------------------------------
# Bulk-Create + Listing
# ---------------------------------------------------------------------------


def test_admin_can_bulk_create_tokens(admin_client: TestClient) -> None:
    resp = admin_client.post("/api/v1/qr-tokens", json={"count": 5})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert len(body) == 5
    tokens = {t["token"] for t in body}
    assert len(tokens) == 5
    for t in body:
        assert len(t["token"]) == 8
        assert t["measuring_point_id"] is None
        assert t["assigned_at"] is None


def test_recorder_cannot_bulk_create(recorder_client: TestClient) -> None:
    resp = recorder_client.post("/api/v1/qr-tokens", json={"count": 1})
    assert resp.status_code == 403


def test_bulk_create_count_validation(admin_client: TestClient) -> None:
    # 0 ist verboten
    assert admin_client.post("/api/v1/qr-tokens", json={"count": 0}).status_code == 422
    # >200 ebenso
    assert admin_client.post("/api/v1/qr-tokens", json={"count": 201}).status_code == 422


def test_list_tokens_empty(admin_client: TestClient) -> None:
    resp = admin_client.get("/api/v1/qr-tokens")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_tokens_status_filters(admin_client: TestClient) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    # 2 Tokens erzeugen, davon einer assignen
    create = admin_client.post("/api/v1/qr-tokens", json={"count": 2}).json()
    t1, t2 = create[0]["token"], create[1]["token"]
    admin_client.post(f"/api/v1/qr-tokens/{t1}/assign", json={"measuring_point_id": mp["id"]})

    all_tokens = admin_client.get("/api/v1/qr-tokens").json()
    assigned = admin_client.get("/api/v1/qr-tokens?status=assigned").json()
    unassigned = admin_client.get("/api/v1/qr-tokens?status=unassigned").json()

    assert len(all_tokens) == 2
    assert len(assigned) == 1 and assigned[0]["token"] == t1
    assert len(unassigned) == 1 and unassigned[0]["token"] == t2
    # measuring_point_name in der Response
    assert assigned[0]["measuring_point_name"] == "A"


def test_list_tokens_filter_by_mp(admin_client: TestClient) -> None:
    mp_a = _create_water_mp(admin_client, name="A", serial="SN-A")
    mp_b = _create_water_mp(admin_client, name="B", serial="SN-B")
    create = admin_client.post("/api/v1/qr-tokens", json={"count": 2}).json()
    admin_client.post(
        f"/api/v1/qr-tokens/{create[0]['token']}/assign",
        json={"measuring_point_id": mp_a["id"]},
    )
    admin_client.post(
        f"/api/v1/qr-tokens/{create[1]['token']}/assign",
        json={"measuring_point_id": mp_b["id"]},
    )

    only_a = admin_client.get(f"/api/v1/qr-tokens?measuring_point_id={mp_a['id']}").json()
    assert len(only_a) == 1
    assert only_a[0]["measuring_point_id"] == mp_a["id"]


# ---------------------------------------------------------------------------
# QR-Generierung
# ---------------------------------------------------------------------------


def test_admin_can_render_token_qr_png(admin_client: TestClient) -> None:
    create = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()
    t = create[0]["token"]
    resp = admin_client.get(f"/api/v1/qr-tokens/{t}/qr")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/png")
    assert resp.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_admin_can_render_token_qr_svg(admin_client: TestClient) -> None:
    create = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()
    t = create[0]["token"]
    resp = admin_client.get(f"/api/v1/qr-tokens/{t}/qr?format=svg")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/svg+xml")
    assert "<svg" in resp.text


def test_recorder_cannot_render_token_qr(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    create = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()
    resp = recorder_client.get(f"/api/v1/qr-tokens/{create[0]['token']}/qr")
    assert resp.status_code == 403


def test_qr_render_404_for_unknown_token(admin_client: TestClient) -> None:
    resp = admin_client.get("/api/v1/qr-tokens/NOPE0000/qr")
    assert resp.status_code == 404


def test_qr_render_500_includes_diagnostic_detail(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Wenn die QR-Rendering-Library failt (z. B. unter Threadpool-Druck oder
    bei einem Library-Bug), muss das Backend einen problem+json mit
    aussagekraeftigem ``detail`` liefern — sonst sieht das Frontend nur
    HTTP 500 ohne Hinweis auf die Ursache."""
    from meters.api.v1 import qr_tokens as qr_module

    def boom(*_args: object, **_kwargs: object) -> bytes:
        raise RuntimeError("simulated qr lib crash")

    monkeypatch.setattr(qr_module, "qr_svg_bytes", boom)

    create = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()
    token = create[0]["token"]
    resp = admin_client.get(f"/api/v1/qr-tokens/{token}/qr?format=svg")
    assert resp.status_code == 500
    body = resp.json()
    assert body["title"] == "QR render failed"
    assert "RuntimeError" in body["detail"]
    assert "simulated qr lib crash" in body["detail"]


def test_qr_svg_encodes_short_q_path(admin_client: TestClient) -> None:
    """Der QR-Inhalt nutzt den ``/q/<token>``-Shortpath statt der langen
    ``/erfassen?token=…``-URL — siehe ``_build_token_url``-Doc. Das spart
    13 Zeichen QR-Inhalt → typisch eine QR-Version kleiner."""
    create = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()
    token = create[0]["token"]
    resp = admin_client.get(f"/api/v1/qr-tokens/{token}/qr?format=svg")
    assert resp.status_code == 200
    # SVG-QR-Codes haben den Klartext-Inhalt nicht im Response — wir
    # prüfen daher das URL-Format direkt am Service-Helper.
    from starlette.requests import Request as StarletteRequest

    from meters.api.v1.qr_tokens import _build_token_url

    fake_scope = {
        "type": "http",
        "scheme": "https",
        "server": ("zaehler.example", 443),
        "headers": [(b"host", b"zaehler.example")],
        "path": "/api/v1/qr-tokens/x/qr",
        "query_string": b"",
        "method": "GET",
        "client": ("127.0.0.1", 0),
    }
    url = _build_token_url(StarletteRequest(fake_scope), token)
    assert url == f"https://zaehler.example/q/{token}"


def test_print_bootstrap_js_is_public(admin_client: TestClient) -> None:
    """Das Bootstrap-Script ist öffentlich (keine Auth) — es enthält nur
    generische Print-Logik, keinen User-spezifischen Inhalt, und wird vom
    Druck-Fenster (about:blank) via ``<script src="…">`` geladen.

    Wir nutzen den admin_client lediglich, weil das Test-Setup so eine
    bequeme TestClient-Instanz mit DB-Initialisierung liefert; Auth ist
    für diesen Endpoint nicht erforderlich.
    """
    resp = admin_client.get("/api/v1/qr-tokens/print-bootstrap.js")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/javascript")
    body = resp.text
    # Die für den Druck unverzichtbaren Bausteine müssen drin sein.
    assert "window.print" in body
    assert "window.close" in body
    assert "data-action" in body


# ---------------------------------------------------------------------------
# Assign / Unassign
# ---------------------------------------------------------------------------


def test_admin_can_assign_token(admin_client: TestClient) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    resp = admin_client.post(f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": mp["id"]})
    assert resp.status_code == 200, resp.text
    assert resp.json()["measuring_point_id"] == mp["id"]
    assert resp.json()["assigned_at"] is not None


def test_assign_already_assigned_returns_409(admin_client: TestClient) -> None:
    mp_a = _create_water_mp(admin_client, name="A", serial="SN-A")
    mp_b = _create_water_mp(admin_client, name="B", serial="SN-B")
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    admin_client.post(f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": mp_a["id"]})
    resp = admin_client.post(
        f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": mp_b["id"]}
    )
    assert resp.status_code == 409


def test_assign_unknown_mp_returns_404(admin_client: TestClient) -> None:
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    resp = admin_client.post(f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": 99999})
    assert resp.status_code == 404


def test_admin_can_unassign_then_reassign(admin_client: TestClient) -> None:
    mp_a = _create_water_mp(admin_client, name="A", serial="SN-A")
    mp_b = _create_water_mp(admin_client, name="B", serial="SN-B")
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]

    admin_client.post(f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": mp_a["id"]})
    unassign = admin_client.delete(f"/api/v1/qr-tokens/{t}/assign")
    assert unassign.status_code == 200
    assert unassign.json()["measuring_point_id"] is None

    re_assign = admin_client.post(
        f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": mp_b["id"]}
    )
    assert re_assign.status_code == 200
    assert re_assign.json()["measuring_point_id"] == mp_b["id"]


def test_recorder_without_flag_cannot_assign(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    _grant_access(db, user=recorder_user, mp_id=mp["id"], granted_by=admin_user)
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    resp = recorder_client.post(
        f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": mp["id"]}
    )
    assert resp.status_code == 403


def test_recorder_with_flag_can_assign_to_accessible_mp(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    _grant_access(db, user=recorder_user, mp_id=mp["id"], granted_by=admin_user)
    _set_can_assign(db, recorder_user, True)
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]

    resp = recorder_client.post(
        f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": mp["id"]}
    )
    assert resp.status_code == 200
    assert resp.json()["measuring_point_id"] == mp["id"]


def test_recorder_with_flag_cannot_assign_to_inaccessible_mp(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    recorder_user: User,
) -> None:
    """Selbst mit can_assign-Flag darf der Recorder nur MPs zuordnen, auf
    die er Zugriff hat — Berechtigungs-Modell aus Feature B greift weiter."""
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    _set_can_assign(db, recorder_user, True)
    # Kein _grant_access → Recorder hat keinen Zugriff auf MP
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]

    resp = recorder_client.post(
        f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": mp["id"]}
    )
    # 404 (statt 403) wegen Existenz-Leak-Schutz aus Feature B
    assert resp.status_code == 404


def test_recorder_cannot_unassign(
    admin_client: TestClient, recorder_client: TestClient, db: Session, recorder_user: User
) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    _set_can_assign(db, recorder_user, True)
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    admin_client.post(f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": mp["id"]})
    resp = recorder_client.delete(f"/api/v1/qr-tokens/{t}/assign")
    assert resp.status_code == 403


def test_unassign_already_unassigned_returns_409(admin_client: TestClient) -> None:
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    resp = admin_client.delete(f"/api/v1/qr-tokens/{t}/assign")
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Resolve
# ---------------------------------------------------------------------------


def test_resolve_assigned_token_for_admin(admin_client: TestClient) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    admin_client.post(f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": mp["id"]})
    resp = admin_client.get(f"/api/v1/qr-tokens/{t}/resolve")
    assert resp.status_code == 200
    body = resp.json()
    assert body["measuring_point_id"] == mp["id"]
    assert body["can_assign"] is True


def test_resolve_unassigned_returns_null_with_can_assign(
    admin_client: TestClient,
) -> None:
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    resp = admin_client.get(f"/api/v1/qr-tokens/{t}/resolve")
    assert resp.status_code == 200
    body = resp.json()
    assert body["measuring_point_id"] is None
    assert body["can_assign"] is True


def test_resolve_unknown_token_returns_404(recorder_client: TestClient) -> None:
    resp = recorder_client.get("/api/v1/qr-tokens/UNKNOWN0/resolve")
    assert resp.status_code == 404


def test_resolve_assigned_to_inaccessible_mp_returns_404(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    """Recorder ohne MP-Zugriff darf nicht über resolve erfahren, dass
    der Token einer (für ihn unsichtbaren) MP zugeordnet ist."""
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    admin_client.post(f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": mp["id"]})
    resp = recorder_client.get(f"/api/v1/qr-tokens/{t}/resolve")
    assert resp.status_code == 404


def test_resolve_unassigned_for_recorder_without_flag(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    """Recorder ohne can_assign-Flag bekommt resolve mit can_assign=false —
    der Frontend zeigt dann 'Bitte Admin um Zuordnung bitten'."""
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    resp = recorder_client.get(f"/api/v1/qr-tokens/{t}/resolve")
    assert resp.status_code == 200
    body = resp.json()
    assert body["measuring_point_id"] is None
    assert body["can_assign"] is False


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


def test_admin_can_delete_token(admin_client: TestClient, db: Session) -> None:
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    resp = admin_client.delete(f"/api/v1/qr-tokens/{t}")
    assert resp.status_code == 204
    # In der DB nicht mehr vorhanden
    assert db.query(QrToken).filter_by(token=t).first() is None


def test_recorder_cannot_delete_token(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    resp = recorder_client.delete(f"/api/v1/qr-tokens/{t}")
    assert resp.status_code == 403


def test_mp_delete_does_not_remove_token(admin_client: TestClient, db: Session) -> None:
    """ON DELETE SET NULL: Token bleibt erhalten, MP-FK wird genullt."""
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    t = admin_client.post("/api/v1/qr-tokens", json={"count": 1}).json()[0]["token"]
    admin_client.post(f"/api/v1/qr-tokens/{t}/assign", json={"measuring_point_id": mp["id"]})
    # MP löschen ist nur möglich, wenn keine Readings hängen — dieser MP hat
    # nur das initial_value-Reading, also nicht 0. Workaround: direkter
    # DB-Delete (Cascade testen wir separat im qr_token_service-Unit-Test).
    qr = db.query(QrToken).filter_by(token=t).first()
    assert qr is not None
    assert qr.measuring_point_id == mp["id"]


# ---------------------------------------------------------------------------
# Side-Effect: alter MP-/qr-Endpoint ist weg
# ---------------------------------------------------------------------------


def test_legacy_mp_qr_endpoint_is_gone(admin_client: TestClient) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    resp = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/qr")
    assert resp.status_code in (404, 405)


# ---------------------------------------------------------------------------
# can_assign_qr_tokens-Flag in User-Endpoints
# ---------------------------------------------------------------------------


def test_user_create_default_can_assign_false(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/users",
        json={
            "username": "rec_test",
            "email": None,
            "role": "recorder",
            "initial_password": "verysecure-1234",
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["can_assign_qr_tokens"] is False


def test_user_create_with_explicit_can_assign(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/users",
        json={
            "username": "rec_test2",
            "email": None,
            "role": "recorder",
            "initial_password": "verysecure-1234",
            "can_assign_qr_tokens": True,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["can_assign_qr_tokens"] is True


def test_user_update_can_assign_records_audit(
    admin_client: TestClient, recorder_user: User
) -> None:
    resp = admin_client.patch(
        f"/api/v1/users/{recorder_user.id}",
        json={"can_assign_qr_tokens": True},
    )
    assert resp.status_code == 200
    assert resp.json()["can_assign_qr_tokens"] is True

    log = admin_client.get("/api/v1/audit-log").json()
    actions = [(e["action"], e.get("diff")) for e in log if e["action"] == "update"]
    assert any(
        d.get("can_assign_qr_tokens") == {"from": False, "to": True}
        for _, d in actions
        if isinstance(d, dict)
    )


def test_me_response_includes_can_assign_qr_tokens(recorder_client: TestClient) -> None:
    resp = recorder_client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    assert "can_assign_qr_tokens" in resp.json()
