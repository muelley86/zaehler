"""Integrationstests für die Foto-Endpunkte am Reading.

Deckt Lifecycle (PUT/GET/DELETE), Berechtigungen (Recorder/Admin, 24h-
Fenster, MP-Filter), Validierung (MIME/Größe) und EXIF-Roundtrip ab.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.core.config import settings
from meters.main import app
from meters.models import MeasuringPoint, Reading, User, UserMeasuringPointAccess


def _setup_water_mp(admin_client: TestClient) -> int:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasser Garten",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "W-PHOTO",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "100.000"},
        },
    )
    assert resp.status_code == 201, resp.text
    body: dict[str, object] = resp.json()
    register_id: int = body["physical_meters"][0]["registers"][0]["id"]  # type: ignore[index]
    return register_id


def _grant_recorder_access(db: Session, *, recorder: User, granted_by: User) -> None:
    for mp_id in db.scalars(select(MeasuringPoint.id)):
        if db.get(UserMeasuringPointAccess, (recorder.id, mp_id)) is not None:
            continue
        db.add(
            UserMeasuringPointAccess(
                user_id=recorder.id,
                measuring_point_id=mp_id,
                granted_by_user_id=granted_by.id,
            )
        )
    db.commit()


def _create_reading(
    admin_client: TestClient,
    register_id: int,
    at: str = "2025-07-01T10:00:00",
) -> int:
    resp = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "150.0", "reading_at": at},
    )
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _make_jpeg(*, with_exif: bool = True, size: tuple[int, int] = (400, 300)) -> bytes:
    img = Image.new("RGB", size, color=(200, 50, 50))
    buf = BytesIO()
    if with_exif:
        exif = img.getexif()
        exif[0x010E] = "Zaehler-Test"  # ImageDescription
        exif[0x0110] = "PyTest-Camera"  # Model
        # GPS-Sub-IFD: Berlin-Zentrum als Sample
        gps = exif.get_ifd(0x8825)
        gps[1] = "N"
        gps[2] = (52.0, 30.0, 0.0)
        gps[3] = "E"
        gps[4] = (13.0, 24.0, 0.0)
        img.save(buf, format="JPEG", exif=exif)
    else:
        img.save(buf, format="JPEG")
    return buf.getvalue()


def _photo_files_in_media_dir() -> list[Path]:
    return list(settings.media_dir.glob("*.jpg"))


def test_put_photo_sets_has_photo_and_persists_file(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)

    resp = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("meter.jpg", _make_jpeg(), "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == rid
    assert body["has_photo"] is True

    files = _photo_files_in_media_dir()
    assert any(f.name.startswith(f"{rid}-") and f.name.endswith(".jpg") for f in files)


def test_put_photo_replaces_previous_file(admin_client: TestClient, db: Session) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)

    first = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("a.jpg", _make_jpeg(size=(300, 200)), "image/jpeg")},
    )
    assert first.status_code == 200
    db.expire_all()
    first_basename = db.get(Reading, rid).photo_path  # type: ignore[union-attr]
    assert first_basename is not None
    first_path = settings.media_dir / first_basename
    assert first_path.is_file()

    second = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("b.jpg", _make_jpeg(size=(500, 400)), "image/jpeg")},
    )
    assert second.status_code == 200
    db.expire_all()
    second_basename = db.get(Reading, rid).photo_path  # type: ignore[union-attr]
    assert second_basename is not None
    assert second_basename != first_basename
    assert not first_path.exists()
    assert (settings.media_dir / second_basename).is_file()


def test_delete_photo_clears_field_and_removes_file(admin_client: TestClient, db: Session) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("a.jpg", _make_jpeg(), "image/jpeg")},
    )
    db.expire_all()
    basename = db.get(Reading, rid).photo_path  # type: ignore[union-attr]
    assert basename is not None

    resp = admin_client.delete(f"/api/v1/readings/{rid}/photo")
    assert resp.status_code == 204

    db.expire_all()
    assert db.get(Reading, rid).photo_path is None  # type: ignore[union-attr]
    assert not (settings.media_dir / basename).exists()


def test_delete_photo_idempotent_when_no_photo(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    resp = admin_client.delete(f"/api/v1/readings/{rid}/photo")
    assert resp.status_code == 204


def test_get_photo_returns_jpeg_with_no_store_cache(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("a.jpg", _make_jpeg(), "image/jpeg")},
    )

    resp = admin_client.get(f"/api/v1/readings/{rid}/photo")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/jpeg")
    assert resp.headers["cache-control"] == "private, no-store"
    assert len(resp.content) > 0


def test_get_photo_404_when_missing(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    resp = admin_client.get(f"/api/v1/readings/{rid}/photo")
    assert resp.status_code == 404


def test_reject_heic_format(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    resp = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("foto.heic", b"\x00\x00\x00\x20ftypheic", "image/heic")},
    )
    assert resp.status_code == 415
    assert "HEIC" in resp.json()["detail"]


def test_reject_non_image_mime(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    resp = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("notes.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 415


def test_reject_oversized_upload(admin_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    # Limit auf 50 Bytes setzen — die kleinste valide JPEG ist deutlich
    # größer, also greift der 413-Check sicher.
    monkeypatch.setattr(settings, "photo_max_upload_bytes", 50)
    resp = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("a.jpg", _make_jpeg(), "image/jpeg")},
    )
    assert resp.status_code == 413


def test_recorder_without_mp_access_gets_404_on_put(
    admin_client: TestClient,
    recorder_client: TestClient,
) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    # Recorder hat KEINEN MP-Zugriff: Existenz-Leak verhindern → 404.
    resp = recorder_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("a.jpg", _make_jpeg(), "image/jpeg")},
    )
    assert resp.status_code == 404


def test_recorder_outside_24h_window_cannot_modify_photo(
    admin_client: TestClient,
    recorder_user: User,
    admin_user: User,
    db: Session,
) -> None:
    register_id = _setup_water_mp(admin_client)
    _grant_recorder_access(db, recorder=recorder_user, granted_by=admin_user)
    reading = Reading(
        register_id=register_id,
        value=Decimal("250"),
        reading_at=datetime(2025, 5, 1, 12, 0, 0),
        created_by_user_id=recorder_user.id,
    )
    db.add(reading)
    db.flush()
    reading.created_at = datetime.now(UTC) - timedelta(hours=25)
    db.commit()
    rid = reading.id

    with TestClient(app) as recorder:
        login = recorder.post(
            "/api/v1/auth/login",
            json={"username": "recorder", "password": "recorder-pass-1234"},
        )
        assert login.status_code == 200

        put = recorder.put(
            f"/api/v1/readings/{rid}/photo",
            files={"photo": ("a.jpg", _make_jpeg(), "image/jpeg")},
        )
        assert put.status_code == 403
        delete = recorder.delete(f"/api/v1/readings/{rid}/photo")
        assert delete.status_code == 403

    # Admin legt das Foto an — Recorder darf es danach trotzdem ansehen
    # (kein 24h-Block auf GET, nur auf Mutationen).
    admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("a.jpg", _make_jpeg(), "image/jpeg")},
    )
    with TestClient(app) as recorder:
        recorder.post(
            "/api/v1/auth/login",
            json={"username": "recorder", "password": "recorder-pass-1234"},
        )
        get = recorder.get(f"/api/v1/readings/{rid}/photo")
        assert get.status_code == 200


def test_exif_with_gps_is_preserved_after_reencode(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("with-gps.jpg", _make_jpeg(with_exif=True), "image/jpeg")},
    )
    resp = admin_client.get(f"/api/v1/readings/{rid}/photo")
    assert resp.status_code == 200

    rendered = Image.open(BytesIO(resp.content))
    exif = rendered.getexif()
    assert exif.get(0x010E) == "Zaehler-Test"
    gps = exif.get_ifd(0x8825)
    assert gps, "GPS-Sub-IFD darf nach Reencode nicht leer sein."
    assert gps.get(1) == "N"
    assert gps.get(3) == "E"


def test_delete_reading_also_removes_photo_file(admin_client: TestClient, db: Session) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("a.jpg", _make_jpeg(), "image/jpeg")},
    )
    db.expire_all()
    basename = db.get(Reading, rid).photo_path  # type: ignore[union-attr]
    assert basename is not None
    assert (settings.media_dir / basename).is_file()

    resp = admin_client.delete(f"/api/v1/readings/{rid}")
    assert resp.status_code == 204
    assert not (settings.media_dir / basename).exists()


def test_put_photo_returns_404_for_unknown_reading(admin_client: TestClient) -> None:
    resp = admin_client.put(
        "/api/v1/readings/99999/photo",
        files={"photo": ("a.jpg", _make_jpeg(), "image/jpeg")},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GPS-Extraktion: photo_lat / photo_lon in ReadingRead
# ---------------------------------------------------------------------------


def test_upload_extracts_gps_into_reading_fields(admin_client: TestClient) -> None:
    """Test-JPEG aus ``_make_jpeg(with_exif=True)`` hat GPS = Berlin (52, 13).
    Nach Upload muessen ``photo_lat``/``photo_lon`` im Reading gesetzt sein.
    """
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id, at="2025-07-01T11:00:00")
    resp = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("with-gps.jpg", _make_jpeg(with_exif=True), "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["photo_lat"] is not None
    assert body["photo_lon"] is not None
    # Test-Fixture setzt 52°30'0" N und 13°24'0" E.
    assert abs(body["photo_lat"] - 52.5) < 1e-4
    assert abs(body["photo_lon"] - 13.4) < 1e-4


def test_upload_without_gps_leaves_coords_null(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id, at="2025-07-01T12:00:00")
    resp = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("no-gps.jpg", _make_jpeg(with_exif=False), "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["photo_lat"] is None
    assert body["photo_lon"] is None


def test_replacing_photo_updates_gps_fields(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id, at="2025-07-01T13:00:00")
    # Erst MIT GPS hochladen
    admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("with.jpg", _make_jpeg(with_exif=True), "image/jpeg")},
    )
    # Dann mit einem GPS-freien Foto ersetzen — Felder muessen wieder NULL werden.
    resp = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("without.jpg", _make_jpeg(with_exif=False), "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["has_photo"] is True
    assert body["photo_lat"] is None
    assert body["photo_lon"] is None


def test_form_gps_used_when_exif_missing(admin_client: TestClient) -> None:
    """Foto OHNE EXIF-GPS + Form-Felder gps_lat/gps_lon → Form-Werte landen
    in der DB (Fallback fuer iOS-Strip-Verhalten)."""
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id, at="2025-08-01T10:00:00")
    resp = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("no-gps.jpg", _make_jpeg(with_exif=False), "image/jpeg")},
        data={"gps_lat": "48.137154", "gps_lon": "11.576124"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["photo_lat"] is not None
    assert body["photo_lon"] is not None
    assert abs(body["photo_lat"] - 48.137154) < 1e-6
    assert abs(body["photo_lon"] - 11.576124) < 1e-6


def test_exif_gps_wins_over_form_gps(admin_client: TestClient) -> None:
    """Foto MIT EXIF-GPS (Berlin) + abweichende Form-Felder (Muenchen) →
    EXIF gewinnt, Form-Werte werden ignoriert."""
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id, at="2025-08-01T11:00:00")
    resp = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("berlin.jpg", _make_jpeg(with_exif=True), "image/jpeg")},
        data={"gps_lat": "48.137154", "gps_lon": "11.576124"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Test-Fixture EXIF: ~52.5 / 13.4 (Berlin), nicht 48.1 / 11.5 (Muenchen).
    assert abs(body["photo_lat"] - 52.5) < 1e-4
    assert abs(body["photo_lon"] - 13.4) < 1e-4


def test_invalid_form_gps_is_ignored(admin_client: TestClient) -> None:
    """Foto ohne EXIF + Form-Werte ausserhalb [-90,90]/[-180,180] →
    photo_lat/photo_lon bleiben None."""
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id, at="2025-08-01T12:00:00")
    resp = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("no-gps.jpg", _make_jpeg(with_exif=False), "image/jpeg")},
        data={"gps_lat": "200", "gps_lon": "11.5"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["photo_lat"] is None
    assert body["photo_lon"] is None


def test_delete_photo_clears_gps_fields(admin_client: TestClient, db: Session) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id, at="2025-07-01T14:00:00")
    admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("with.jpg", _make_jpeg(with_exif=True), "image/jpeg")},
    )
    resp = admin_client.delete(f"/api/v1/readings/{rid}/photo")
    assert resp.status_code == 204
    db.expire_all()
    reloaded = db.get(Reading, rid)
    assert reloaded is not None
    assert reloaded.photo_path is None
    assert reloaded.photo_lat is None
    assert reloaded.photo_lon is None


def test_reject_decompression_bomb(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Tier-1-Härtung: Pillow-DecompressionBombError wird als 413 abgefangen.

    Das Pixel-Limit wird in der Produktion NICHT gesenkt (Default-Cap deckt
    Handyfotos ab); hier setzen wir es nur testweise drastisch herab, damit ein
    normales Testfoto das 2-fache MAX_IMAGE_PIXELS überschreitet und greift —
    sauberes 413 statt unbehandeltem 500.
    """
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 10)
    resp = admin_client.put(
        f"/api/v1/readings/{rid}/photo",
        files={"photo": ("bomb.jpg", _make_jpeg(size=(400, 300)), "image/jpeg")},
    )
    assert resp.status_code == 413, resp.text
