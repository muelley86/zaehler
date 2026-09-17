"""QR-Code-Erzeugung für Messstellen-Etiketten und 2FA-Setup.

Beide Use-Cases (TOTP-Setup und Messstellen-Deeplinks) brauchen nur Bytes
in PNG- oder SVG-Form. Die Service-Funktionen sind reine Helper ohne
DB-Abhängigkeit.
"""

from __future__ import annotations

import io

import qrcode  # type: ignore[import-untyped]
import qrcode.image.svg  # type: ignore[import-untyped]
from qrcode.constants import ERROR_CORRECT_M  # type: ignore[import-untyped]


def qr_png_bytes(data: str, *, box_size: int = 8, border: int = 2) -> bytes:
    """Erzeugt einen QR-Code als PNG-Bytes (schwarz/weiß, ECC-Level M)."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def qr_svg_bytes(data: str, *, box_size: int = 8, border: int = 2) -> bytes:
    """Erzeugt einen QR-Code als SVG-Bytes (single-path, druckfreundlich).

    SVG ist beim Drucken verlustfrei skalierbar — der Druck-Workflow nutzt
    dieses Format daher bevorzugt für die Etiketten.
    """
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
        image_factory=qrcode.image.svg.SvgPathImage,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image()
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue()
