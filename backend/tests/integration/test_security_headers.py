"""Regressions-Guards für die Security-Response-Header.

Insbesondere: ``img-src`` muss ``blob:`` erlauben, sonst blockiert die CSP die
lokale Foto-Vorschau beim Erfassen (``URL.createObjectURL(file)`` → ``blob:``-URL)
auf jedem Browser — ein zuvor lange unbemerkter Bug, weil jsdom in den
Frontend-Tests keine CSP durchsetzt.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _csp_directives(csp: str) -> dict[str, list[str]]:
    """CSP-Header in ``{direktive: [tokens]}`` zerlegen."""
    directives: dict[str, list[str]] = {}
    for part in csp.split(";"):
        tokens = part.split()
        if tokens:
            directives[tokens[0]] = tokens[1:]
    return directives


def test_csp_img_src_allows_blob_for_photo_preview(client: TestClient) -> None:
    resp = client.get("/api/v1/health")

    csp = resp.headers.get("Content-Security-Policy")
    assert csp is not None, "CSP-Header fehlt"

    img_src = _csp_directives(csp).get("img-src")
    assert img_src is not None, "img-src-Direktive fehlt in der CSP"

    # blob: ist zwingend für die lokale Foto-Vorschau (Object-URLs).
    assert "blob:" in img_src, f"img-src ohne blob: — Foto-Vorschau bricht: {img_src}"
    # Bestehende Erlaubnisse bleiben erhalten.
    assert "'self'" in img_src
    assert "data:" in img_src


def test_core_security_headers_present(client: TestClient) -> None:
    resp = client.get("/api/v1/health")

    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert "Content-Security-Policy" in resp.headers
