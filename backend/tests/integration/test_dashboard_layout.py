"""Dashboard-Layout je Benutzer: ``GET/PUT /api/v1/auth/me/dashboard-layout``."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from meters.models import User

URL = "/api/v1/auth/me/dashboard-layout"
DEFAULT = {"order": ["kpi", "due", "insights", "top"], "collapsed": []}


def test_default_ohne_gespeichertes_layout(admin_client: TestClient) -> None:
    resp = admin_client.get(URL)
    assert resp.status_code == 200, resp.text
    assert resp.json() == DEFAULT


def test_put_und_get_roundtrip(admin_client: TestClient) -> None:
    layout = {"order": ["top", "due", "kpi", "insights"], "collapsed": ["kpi", "top"]}
    resp = admin_client.put(URL, json=layout)
    assert resp.status_code == 200, resp.text
    assert resp.json() == layout
    assert admin_client.get(URL).json() == layout


def test_layout_ist_je_benutzer(admin_client: TestClient, recorder_client: TestClient) -> None:
    admin_client.put(URL, json={"order": ["top", "insights", "due", "kpi"], "collapsed": ["due"]})
    assert recorder_client.get(URL).json() == DEFAULT


def test_fehlende_kacheln_werden_angehaengt(admin_client: TestClient) -> None:
    resp = admin_client.put(URL, json={"order": ["insights"], "collapsed": []})
    assert resp.status_code == 200, resp.text
    assert resp.json()["order"] == ["insights", "kpi", "due", "top"]


def test_unbekannte_kachel_wird_abgelehnt(admin_client: TestClient) -> None:
    resp = admin_client.put(URL, json={"order": ["kpi", "chart"], "collapsed": []})
    assert resp.status_code == 422


def test_doppelte_kachel_wird_abgelehnt(admin_client: TestClient) -> None:
    resp = admin_client.put(URL, json={"order": ["kpi", "kpi"], "collapsed": []})
    assert resp.status_code == 422
    resp = admin_client.put(URL, json={"order": ["kpi"], "collapsed": ["due", "due"]})
    assert resp.status_code == 422


def test_gespeichertes_altlayout_wird_beim_lesen_bereinigt(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    admin_user.dashboard_layout = {"order": ["top", "entfernt", "top"], "collapsed": "kaputt"}
    db.commit()
    assert admin_client.get(URL).json() == {
        "order": ["top", "kpi", "due", "insights"],
        "collapsed": [],
    }


def test_ohne_session_401(client: TestClient) -> None:
    assert client.get(URL).status_code == 401
    assert client.put(URL, json=DEFAULT).status_code == 401
