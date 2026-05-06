"""QR-Code-Erzeugung für Messstellen-Etiketten und 2FA-Setup.

Beide Use-Cases (TOTP-Setup und Messstellen-Deeplinks) brauchen nur Bytes
in PNG- oder SVG-Form. Die Service-Funktionen sind reine Helper ohne
DB-Abhängigkeit; daneben stellt :func:`build_measuring_point_url` den
Origin aus dem aktuellen Request her, sodass der QR-Code zur tatsächlich
erreichbaren App-URL führt — auch hinter einem Reverse-Proxy.
"""

from __future__ import annotations

import io

import qrcode  # type: ignore[import-untyped]
import qrcode.image.svg  # type: ignore[import-untyped]
from qrcode.constants import ERROR_CORRECT_M  # type: ignore[import-untyped]
from starlette.requests import Request


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


def build_measuring_point_url(request: Request, mp_id: int) -> str:
    """Konstruiert die Deeplink-URL `${scheme}://${host}/erfassen?mp=${id}`.

    Starlette wertet ``request.url`` bereits inklusive Forwarded-Header aus,
    sofern :class:`starlette.middleware.proxy_headers.ProxyHeadersMiddleware`
    aktiv ist. Wir verwenden Scheme und Netloc aus ``request.url`` direkt —
    das funktioniert mit und ohne Reverse-Proxy.
    """
    scheme = request.url.scheme or "http"
    host = request.url.netloc or request.headers.get("host", "")
    return f"{scheme}://{host}/erfassen?mp={mp_id}"
