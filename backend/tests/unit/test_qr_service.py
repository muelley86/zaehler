"""Unit-Tests für ``meters.services.qr``.

Reine Helper-Funktionen ohne DB-Abhängigkeit — daher hier kein Fixture-Setup
nötig. Wir prüfen nur die Bytes-Formate.
"""

from __future__ import annotations

from meters.services.qr import qr_png_bytes, qr_svg_bytes


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
