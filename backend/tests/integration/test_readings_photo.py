"""Integrationstests für die Foto-Endpunkte am Reading (1->N, bis zu 6 Fotos).

Deckt Lifecycle (POST/GET/DELETE je Foto), das 6er-Limit, Berechtigungen
(Recorder/Admin, 24h-Fenster, MP-Filter), Validierung (MIME/Größe) und
EXIF/GPS-Roundtrip ab.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.core.config import settings
from meters.main import app
from meters.models import (
    MeasuringPoint,
    Reading,
    ReadingPhoto,
    User,
    UserMeasuringPointAccess,
)


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
    body: dict[str, Any] = resp.json()
    register_id: int = body["physical_meters"][0]["registers"][0]["id"]
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


def _add_photo(
    client: TestClient,
    rid: int,
    *,
    with_exif: bool = False,
    size: tuple[int, int] = (400, 300),
    data: dict[str, str] | None = None,
) -> Any:
    return client.post(
        f"/api/v1/readings/{rid}/photos",
        files={"photo": ("meter.jpg", _make_jpeg(with_exif=with_exif, size=size), "image/jpeg")},
        data=data or {},
    )


def _photo_paths(db: Session, rid: int) -> list[str]:
    db.expire_all()
    return list(
        db.scalars(
            select(ReadingPhoto.photo_path)
            .where(ReadingPhoto.reading_id == rid)
            .order_by(ReadingPhoto.sort_index)
        )
    )


# --- Lifecycle + Limit -----------------------------------------------------


def test_add_photo_sets_has_photo_and_persists_file(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)

    resp = _add_photo(admin_client, rid)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == rid
    assert body["has_photo"] is True
    assert len(body["photos"]) == 1

    files = _photo_files_in_media_dir()
    assert any(f.name.startswith(f"{rid}-") and f.name.endswith(".jpg") for f in files)


def test_add_up_to_six_then_rejects_seventh(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    for i in range(6):
        resp = _add_photo(admin_client, rid)
        assert resp.status_code == 200, resp.text
        assert len(resp.json()["photos"]) == i + 1
    seventh = _add_photo(admin_client, rid)
    assert seventh.status_code == 409, seventh.text
    assert len(seventh.json().get("photos", [])) == 0  # 409 -> ProblemDetails, keine photos


def test_delete_one_photo_keeps_others(admin_client: TestClient, db: Session) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    ids = [_add_photo(admin_client, rid).json()["photos"][-1]["id"] for _ in range(3)]
    paths_before = _photo_paths(db, rid)
    assert len(paths_before) == 3

    middle = ids[1]
    resp = admin_client.delete(f"/api/v1/readings/{rid}/photos/{middle}")
    assert resp.status_code == 204
    remaining = _photo_paths(db, rid)
    assert len(remaining) == 2
    # Genau die mittlere Datei ist weg, die anderen bleiben.
    for p in remaining:
        assert (settings.media_dir / p).is_file()


def test_delete_photo_idempotent_when_unknown(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    resp = admin_client.delete(f"/api/v1/readings/{rid}/photos/999999")
    assert resp.status_code == 204


def test_get_photo_returns_jpeg_with_no_store_cache(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    pid = _add_photo(admin_client, rid).json()["photos"][0]["id"]

    resp = admin_client.get(f"/api/v1/readings/{rid}/photos/{pid}")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/jpeg")
    assert resp.headers["cache-control"] == "private, no-store"
    assert len(resp.content) > 0


def test_get_photo_404_when_unknown(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    resp = admin_client.get(f"/api/v1/readings/{rid}/photos/999999")
    assert resp.status_code == 404


# --- Validierung -----------------------------------------------------------


def test_reject_heic_format(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    resp = admin_client.post(
        f"/api/v1/readings/{rid}/photos",
        files={"photo": ("foto.heic", b"\x00\x00\x00\x20ftypheic", "image/heic")},
    )
    assert resp.status_code == 415
    assert "HEIC" in resp.json()["detail"]


def test_reject_non_image_mime(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    resp = admin_client.post(
        f"/api/v1/readings/{rid}/photos",
        files={"photo": ("notes.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 415


def test_reject_oversized_upload(admin_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    monkeypatch.setattr(settings, "photo_max_upload_bytes", 50)
    resp = _add_photo(admin_client, rid)
    assert resp.status_code == 413


def test_reject_decompression_bomb(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 10)
    resp = _add_photo(admin_client, rid, size=(400, 300))
    assert resp.status_code == 413, resp.text


# --- Berechtigungen --------------------------------------------------------


def test_recorder_without_mp_access_gets_404_on_post(
    admin_client: TestClient,
    recorder_client: TestClient,
) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    resp = _add_photo(recorder_client, rid)
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

    # Admin legt ein Foto an (Admin unterliegt keinem 24h-Block).
    pid = _add_photo(admin_client, rid).json()["photos"][0]["id"]

    with TestClient(app) as recorder:
        login = recorder.post(
            "/api/v1/auth/login",
            json={"username": "recorder", "password": "recorder-pass-1234"},
        )
        assert login.status_code == 200
        assert _add_photo(recorder, rid).status_code == 403
        assert recorder.delete(f"/api/v1/readings/{rid}/photos/{pid}").status_code == 403
        # GET bleibt erlaubt (kein 24h-Block auf Lesezugriff).
        assert recorder.get(f"/api/v1/readings/{rid}/photos/{pid}").status_code == 200


# --- GPS / EXIF ------------------------------------------------------------


def test_exif_gps_is_preserved_and_extracted(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    body = _add_photo(admin_client, rid, with_exif=True).json()
    photo = body["photos"][0]
    assert abs(photo["photo_lat"] - 52.5) < 1e-4
    assert abs(photo["photo_lon"] - 13.4) < 1e-4

    img = admin_client.get(f"/api/v1/readings/{rid}/photos/{photo['id']}")
    rendered = Image.open(BytesIO(img.content))
    gps = rendered.getexif().get_ifd(0x8825)
    assert gps.get(1) == "N" and gps.get(3) == "E"


def test_upload_without_gps_leaves_coords_null(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    photo = _add_photo(admin_client, rid, with_exif=False).json()["photos"][0]
    assert photo["photo_lat"] is None
    assert photo["photo_lon"] is None


def test_form_gps_used_when_exif_missing(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    photo = _add_photo(
        admin_client, rid, with_exif=False, data={"gps_lat": "48.137154", "gps_lon": "11.576124"}
    ).json()["photos"][0]
    assert abs(photo["photo_lat"] - 48.137154) < 1e-6
    assert abs(photo["photo_lon"] - 11.576124) < 1e-6


def test_exif_gps_wins_over_form_gps(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    photo = _add_photo(
        admin_client, rid, with_exif=True, data={"gps_lat": "48.137154", "gps_lon": "11.576124"}
    ).json()["photos"][0]
    assert abs(photo["photo_lat"] - 52.5) < 1e-4
    assert abs(photo["photo_lon"] - 13.4) < 1e-4


def test_invalid_form_gps_is_ignored(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    photo = _add_photo(
        admin_client, rid, with_exif=False, data={"gps_lat": "200", "gps_lon": "11.5"}
    ).json()["photos"][0]
    assert photo["photo_lat"] is None
    assert photo["photo_lon"] is None


# --- Cascade + Edge --------------------------------------------------------


def test_delete_reading_also_removes_photo_files(admin_client: TestClient, db: Session) -> None:
    register_id = _setup_water_mp(admin_client)
    rid = _create_reading(admin_client, register_id)
    _add_photo(admin_client, rid)
    _add_photo(admin_client, rid)
    paths = _photo_paths(db, rid)
    assert len(paths) == 2
    for p in paths:
        assert (settings.media_dir / p).is_file()

    resp = admin_client.delete(f"/api/v1/readings/{rid}")
    assert resp.status_code == 204
    for p in paths:
        assert not (settings.media_dir / p).exists()


def test_add_photo_returns_404_for_unknown_reading(admin_client: TestClient) -> None:
    resp = _add_photo(admin_client, 99999)
    assert resp.status_code == 404
