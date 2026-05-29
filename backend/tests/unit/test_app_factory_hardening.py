"""Härtungs-Tests der App-Factory (Tier 1).

OpenAPI/Swagger/ReDoc sollen nur im Dev-Modus (``debug=True``) erreichbar
sein; in Produktion geben sie einem Scanner sonst die komplette API-Landkarte
preis. Das SPA-Frontend nutzt diese Endpunkte nicht.
"""

from __future__ import annotations

import pytest

from meters.core.config import settings
from meters.main import create_app


def test_openapi_disabled_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    # debug=False = Produktion. cookie_secure/trust_proxy auf "sicher" setzen,
    # damit assert_secure_production_config() keine Warnung wirft (die in der
    # Test-Suite via filterwarnings="error" zum Fehler eskalieren würde).
    monkeypatch.setattr(settings, "debug", False)
    monkeypatch.setattr(settings, "cookie_secure", True)
    monkeypatch.setattr(settings, "trust_proxy", True)

    app = create_app()

    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None


def test_openapi_enabled_in_debug(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "debug", True)

    app = create_app()

    assert app.docs_url == "/docs"
    assert app.redoc_url == "/redoc"
    assert app.openapi_url == "/openapi.json"
