"""Unit-Tests für ``meters.services.qr``.

Reine Helper-Funktionen ohne DB-Abhängigkeit — daher hier kein Fixture-Setup
nötig. Wir prüfen nur die Bytes/URL-Formate.
"""

from __future__ import annotations

from starlette.requests import Request

from meters.services.qr import build_measuring_point_url, qr_png_bytes, qr_svg_bytes


def _make_request(*, scheme: str = "http", host: str = "zaehler.example") -> Request:
    """Minimaler ASGI-Scope für eine Starlette-``Request``-Instanz."""
    scope = {
        "type": "http",
        "method": "GET",
        "scheme": scheme,
        "server": ("zaehler.example", 80 if scheme == "http" else 443),
        "path": "/api/v1/measuring-points/1/qr",
        "raw_path": b"/api/v1/measuring-points/1/qr",
        "query_string": b"",
        "headers": [(b"host", host.encode("ascii"))],
        "root_path": "",
    }
    return Request(scope)


def test_qr_png_bytes_returns_png_signature() -> None:
    body = qr_png_bytes("https://example.com/erfassen?mp=1")
    assert body[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(body) > 100


def test_qr_svg_bytes_returns_svg_root() -> None:
    body = qr_svg_bytes("https://example.com/erfassen?mp=1")
    text = body.decode("utf-8")
    assert "<svg" in text
    # SvgPathImage rendert den QR als einzelnen <path>-Eintrag.
    assert "<path" in text


def test_qr_png_box_size_changes_image_size() -> None:
    small = qr_png_bytes("payload", box_size=4)
    large = qr_png_bytes("payload", box_size=12)
    assert len(large) > len(small)


def test_build_url_uses_host_header() -> None:
    request = _make_request(host="zaehler.intern.local:8000")
    url = build_measuring_point_url(request, 42)
    assert url == "http://zaehler.intern.local:8000/erfassen?mp=42"


def test_build_url_respects_https_scheme() -> None:
    request = _make_request(scheme="https", host="zaehler.example.com")
    url = build_measuring_point_url(request, 7)
    assert url == "https://zaehler.example.com/erfassen?mp=7"
