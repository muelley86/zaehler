"""Speicher- und Verarbeitungs-Helfer für Reading-Fotos.

Die Fotos liegen im Dateisystem (``settings.media_dir``), nicht in der DB
— CLAUDE.md verlangt explizit "Foto-Uploads NICHT in der DB-Transaktion".
Der Service ist bewusst schmal: Validieren, Reencode via Pillow, Datei
schreiben, Datei löschen. Die DB-Verknüpfung (``Reading.photo_path``)
und das AuditLog macht der Caller (API-Route).

Reencode-Pipeline:

1. MIME prüfen (JPEG/PNG/WebP — HEIC explizit ablehnen, kein
   ``pillow-heif`` installiert).
2. Pillow öffnet den Stream. ``ImageOps.exif_transpose`` korrigiert die
   visuelle Orientierung anhand des EXIF-Orientation-Tags und entfernt
   diesen Tag — sonst würde der Browser am Ende doppelt rotieren.
3. Auf max. Kantenlänge ``MAX_DIMENSION`` skalieren (kürzere Kante
   bleibt proportional).
4. Als JPEG q=85 mit ``exif=…`` ausschreiben. Das **vollständige** EXIF
   (inkl. GPS-Sub-IFD) wird durchgereicht — die GPS-Beweissicherung ist
   gewünscht. Nur Orientation entfällt durch Schritt 2.
"""

from __future__ import annotations

import logging
import secrets
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from meters.core.config import settings
from meters.core.problem import ProblemError

logger = logging.getLogger(__name__)

# Akzeptierte Eingangs-Formate. HEIC wird bewusst nicht unterstützt
# (``pillow-heif`` nicht installiert — der iPhone-Camera-Picker liefert
# bei ``capture="environment"`` ohnehin JPEG, nicht HEIC).
_ACCEPTED_MIME = frozenset({"image/jpeg", "image/png", "image/webp"})

# Längste Kante des reencodierten JPEGs. 2000 px ist Detail genug für
# einen ablesbaren Zählerstand und bringt die Datei auf typ. 200-400 KB.
MAX_DIMENSION = 2000

_JPEG_QUALITY = 85

# EXIF-Tag-ID für "Orientation" — von ``exif_transpose`` bereits entfernt;
# wir setzen den Wert defensiv hier nochmal auf "Normal" für den Fall,
# dass das Roh-EXIF doch noch einen Tag mitbringt.
_ORIENTATION_TAG = 0x0112


# GPS-Sub-IFD im EXIF (PIL.ExifTags.IFD.GPSInfo). Tag-IDs innerhalb des
# Sub-IFD: 1=GPSLatitudeRef, 2=GPSLatitude, 3=GPSLongitudeRef, 4=GPSLongitude.
_GPS_IFD_TAG = 0x8825


def _dms_to_decimal(dms: object) -> float | None:
    """Konvertiert ein GPS-Koordinaten-Tupel (Grad, Minute, Sekunde) in
    Dezimalgrad. Pillow liefert die Werte meist als ``tuple`` von
    ``IFDRational`` oder als ``tuple[float, float, float]``. Bei
    unerwarteten Typen geben wir ``None`` zurueck statt zu crashen.
    """
    try:
        if not isinstance(dms, tuple | list) or len(dms) != 3:
            return None
        deg, minutes, seconds = (float(v) for v in dms)
    except (TypeError, ValueError):
        return None
    return deg + minutes / 60.0 + seconds / 3600.0


def validate_gps(lat: float | None, lon: float | None) -> tuple[float, float] | None:
    """Pruefe ein Lat/Lon-Paar gegen die zulaessigen Bereiche.

    Gibt das Tupel zurueck, wenn beide Werte gesetzt und in Range
    (Lat ∈ [-90, 90], Lon ∈ [-180, 180]) sind — sonst ``None``. Wird
    von ``extract_gps`` (EXIF-Pfad) und vom Form-Fallback im Endpoint
    gemeinsam genutzt, damit beide Pfade dieselben Plausibilitaets-
    Grenzen anwenden.
    """
    if lat is None or lon is None:
        return None
    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
        return None
    return (lat, lon)


def extract_gps(img: Image.Image) -> tuple[float, float] | None:
    """Liest Latitude/Longitude aus dem GPS-Sub-IFD des Bildes.

    Gibt ``None`` zurueck, wenn das Bild keinen GPS-Tag hat oder die
    Werte nicht plausibel sind (z. B. ausserhalb [-90, 90] / [-180, 180]).
    """
    try:
        gps = img.getexif().get_ifd(_GPS_IFD_TAG)
    except (AttributeError, KeyError):
        return None
    if not gps:
        return None
    lat_ref = gps.get(1)
    lat_raw = gps.get(2)
    lon_ref = gps.get(3)
    lon_raw = gps.get(4)
    if lat_ref is None or lat_raw is None or lon_ref is None or lon_raw is None:
        return None
    lat = _dms_to_decimal(lat_raw)
    lon = _dms_to_decimal(lon_raw)
    if lat is None or lon is None:
        return None
    if str(lat_ref).upper().startswith("S"):
        lat = -lat
    if str(lon_ref).upper().startswith("W"):
        lon = -lon
    return validate_gps(lat, lon)


def save_photo(reading_id: int, upload: UploadFile) -> tuple[str, tuple[float, float] | None]:
    """Validiert, reencodiert und speichert das Foto.

    Liefert ``(basename, gps_or_None)``. ``gps`` ist das ``(lat, lon)``-Tupel
    aus dem EXIF (falls vorhanden), sonst ``None``.
    """
    content_type = (upload.content_type or "").lower()
    if content_type == "image/heic" or content_type == "image/heif":
        raise ProblemError(
            status_code=415,
            title="Unsupported image format",
            detail="HEIC/HEIF wird nicht unterstützt. Bitte als JPEG hochladen.",
        )
    if content_type not in _ACCEPTED_MIME:
        raise ProblemError(
            status_code=415,
            title="Unsupported image format",
            detail=f"Erlaubt: {', '.join(sorted(_ACCEPTED_MIME))}.",
        )

    if upload.size is not None and upload.size > settings.photo_max_upload_bytes:
        raise ProblemError(
            status_code=413,
            title="Photo too large",
            detail=(
                f"Maximalgröße {settings.photo_max_upload_bytes // (1024 * 1024)} MB überschritten."
            ),
        )

    try:
        upload.file.seek(0)
        opened = Image.open(upload.file)
        opened.load()
    except Image.DecompressionBombError as exc:
        # Pillows eingebauter Schutz: Bild überschreitet das Pixel-Limit
        # (Decompression-Bomb). Wir senken die Schwelle bewusst NICHT — der
        # Default-Cap deckt reguläre Handyfotos locker ab. Aber wir fangen den
        # Fehler sauber als 413 ab, statt ihn als unbehandelten 500 mit
        # Speicher-Spike durchzulassen.
        raise ProblemError(
            status_code=413,
            title="Photo too large",
            detail="Bildauflösung zu groß. Bitte ein kleineres Foto hochladen.",
        ) from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise ProblemError(
            status_code=422,
            title="Invalid image",
            detail="Datei konnte nicht als Bild gelesen werden.",
        ) from exc

    # exif_transpose erzeugt ein neues Image-Objekt (oder None bei ohne EXIF).
    img: Image.Image = ImageOps.exif_transpose(opened) or opened

    exif_obj = img.getexif()
    # Orientation-Tag entfernen, falls noch enthalten — sonst rotiert der
    # Browser ein zweites Mal auf dem bereits gedrehten Bild.
    if _ORIENTATION_TAG in exif_obj:
        del exif_obj[_ORIENTATION_TAG]
    exif_bytes = exif_obj.tobytes() if len(exif_obj) > 0 else b""

    # GPS-Koordinaten VOR dem Resize/Convert lesen — beides aendert das
    # EXIF nicht, aber so haben wir den Zustand des Original-Bilds.
    gps = extract_gps(img)

    img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    basename = f"{reading_id}-{secrets.token_urlsafe(6)}.jpg"
    target = settings.media_dir / basename
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    try:
        img.save(
            target,
            format="JPEG",
            quality=_JPEG_QUALITY,
            optimize=True,
            exif=exif_bytes,
        )
    except OSError as exc:
        logger.exception("Konnte Foto nicht schreiben: %s", target)
        raise ProblemError(
            status_code=500,
            title="Photo storage failed",
            detail="Foto konnte nicht gespeichert werden.",
        ) from exc
    return basename, gps


def photo_full_path(basename: str) -> Path:
    """Resolved Pfad mit Path-Traversal-Schutz.

    Wirft :class:`ValueError`, wenn der Basename auf etwas außerhalb von
    ``settings.media_dir`` zeigt (z. B. ``../etc/passwd``). Caller muss
    den Fehler in einen 404 verwandeln.
    """
    if not basename or "/" in basename or "\\" in basename or ".." in basename:
        raise ValueError("Invalid photo basename")
    base = settings.media_dir.resolve()
    full = (base / basename).resolve()
    if not full.is_relative_to(base):
        raise ValueError("Path traversal detected")
    return full


def delete_photo(basename: str | None) -> None:
    """Löscht eine Foto-Datei. Fehlt sie schon, ist das ok (idempotent)."""
    if not basename:
        return
    try:
        path = photo_full_path(basename)
    except ValueError:
        # Korrupter Basename in der DB — wir können hier nichts mehr
        # tun, außer es zu loggen.
        logger.warning("Skip delete für ungültigen photo basename: %r", basename)
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.exception("Konnte Foto-Datei nicht löschen: %s", path)
