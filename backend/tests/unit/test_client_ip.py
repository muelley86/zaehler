"""Unit-Tests für ``client_ip()`` inkl. optionalem Proxy-Pinning (Tier-2/3-Härtung).

``client_ip`` entscheidet, welche IP in Rate-Limit-Buckets und Audit-Log landet.
Ein gefälschter ``X-Forwarded-For`` darf das nur beeinflussen, wenn ein
vertrauenswürdiger Proxy davorsteht.
"""

from __future__ import annotations

import pytest
from starlette.requests import Request

from meters.api.deps import client_ip
from meters.core import config as cfg


def _make_request(*, client_host: str, xff: str | None = None) -> Request:
    """Minimaler ASGI-Scope mit gesetzter Verbindungs-IP und optionalem XFF."""
    headers: list[tuple[bytes, bytes]] = []
    if xff is not None:
        headers.append((b"x-forwarded-for", xff.encode("ascii")))
    scope = {
        "type": "http",
        "method": "GET",
        "scheme": "http",
        "server": ("zaehler.example", 80),
        "path": "/api/v1/auth/login",
        "query_string": b"",
        "headers": headers,
        "client": (client_host, 12345),
    }
    return Request(scope)


def test_direct_ip_when_trust_proxy_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cfg.settings, "trust_proxy", False)
    req = _make_request(client_host="10.0.0.5", xff="1.2.3.4")
    assert client_ip(req) == "10.0.0.5"


def test_xff_used_when_trust_proxy_on_and_no_allowlist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cfg.settings, "trust_proxy", True)
    monkeypatch.setattr(cfg.settings, "trusted_proxy_ips", [])
    req = _make_request(client_host="10.0.0.5", xff="1.2.3.4")
    assert client_ip(req) == "1.2.3.4"


def test_pinning_rejects_xff_from_unlisted_peer(monkeypatch: pytest.MonkeyPatch) -> None:
    """Allowlist gesetzt + direkte IP NICHT gelistet → XFF ignoriert, die
    direkte (Angreifer-)IP zählt. Verhindert Spoofing, wenn die App neben dem
    Proxy auch direkt erreichbar ist."""
    monkeypatch.setattr(cfg.settings, "trust_proxy", True)
    monkeypatch.setattr(cfg.settings, "trusted_proxy_ips", ["10.0.0.1"])
    req = _make_request(client_host="203.0.113.9", xff="1.2.3.4")
    assert client_ip(req) == "203.0.113.9"


def test_pinning_accepts_xff_from_listed_proxy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cfg.settings, "trust_proxy", True)
    monkeypatch.setattr(cfg.settings, "trusted_proxy_ips", ["10.0.0.1"])
    req = _make_request(client_host="10.0.0.1", xff="1.2.3.4")
    assert client_ip(req) == "1.2.3.4"


def test_malformed_xff_falls_back_to_direct(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cfg.settings, "trust_proxy", True)
    monkeypatch.setattr(cfg.settings, "trusted_proxy_ips", [])
    req = _make_request(client_host="10.0.0.5", xff="not-an-ip")
    assert client_ip(req) == "10.0.0.5"
