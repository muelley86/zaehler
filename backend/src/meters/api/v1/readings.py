"""Erfassungen (Readings) — Anlegen, Listen, Bearbeiten, Löschen.

Wichtige Plausibilitätsregel: bei kumulativen Zählern (alle außer Heizöl-Tank)
muss der Wert monoton in die Zeitreihe passen — sowohl beim normalen Erfassen
als auch beim Nachtragen rückdatierter Stände. Tank-Register sind ausgenommen,
weil ihr Stand sinken oder durch Lieferungen springen kann.

Berechtigungen: jeder eingeloggte User darf erfassen. Ändern/Löschen darf
ein Admin immer; ein Recorder nur eigene Erfassungen innerhalb 24 h.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from meters.api.deps import CurrentUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    PhysicalMeter,
    Reading,
    ReadingPhoto,
    Register,
    User,
    UserRole,
)
from meters.schemas import ConsumptionPoint, ReadingCreate, ReadingRead, ReadingUpdate
from meters.schemas.common import to_utc_iso
from meters.schemas.reading import ReadingPhotoRead
from meters.services.access import (
    assert_can_access_mp,
    assert_can_access_register,
    restrict_mp_query,
)
from meters.services.audit import record
from meters.services.consumption import aggregate_consumption, consumption_for_measuring_point
from meters.services.monthly_consumption import monthly_points_for_measuring_point
from meters.services.reading_photo import (
    delete_photo,
    photo_full_path,
    save_photo,
    validate_gps,
)

router = APIRouter(tags=["readings"])

EDIT_WINDOW = timedelta(hours=24)

# Plausibilitätswarnung: 400 mit ``extra.acknowledge_field``. Pragmatischer
# Pattern, in dem das Frontend die Warnung dem User zeigt und mit
# ``acknowledge_warnings=True`` erneut postet. 422 wäre semantisch
# ebenso, aber 400 ist hier konsistent mit der Frontend-Logik.
STATUS_PLAUSIBILITY_WARNING = 400


def _to_read(reading: Reading) -> ReadingRead:
    return ReadingRead(
        id=reading.id,
        register_id=reading.register_id,
        value=reading.value,
        reading_at=reading.reading_at,
        note=reading.note,
        created_at=reading.created_at,
        created_by_user_id=reading.created_by_user_id,
        created_by_username=reading.created_by.username if reading.created_by else None,
        has_photo=len(reading.photos) > 0,
        photos=[
            ReadingPhotoRead(id=p.id, photo_lat=p.photo_lat, photo_lon=p.photo_lon)
            for p in reading.photos
        ],
    )


def _can_edit(user: User, reading: Reading) -> bool:
    if user.role is UserRole.ADMIN:
        return True
    if reading.created_by_user_id != user.id:
        return False
    created_at = reading.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    return datetime.now(UTC) - created_at <= EDIT_WINDOW


def _check_value_in_series(
    db: DbDep,
    *,
    register: Register,
    reading_at: datetime,
    value: Decimal,
    exclude_id: int | None = None,
    acknowledge_warnings: bool = False,
) -> None:
    """Plausibilitätsprüfung für kumulative Register.

    CLAUDE.md verlangt eine Warnung, keinen harten Block. Im ersten POST/PATCH
    ohne ``acknowledge_warnings`` wirft die Funktion 400 mit ``previous``/``next``
    in ``extra`` — das Frontend zeigt darauf einen Confirm-Dialog und sendet
    die zweite Anfrage mit ``acknowledge_warnings=True``, wodurch der Block
    übersprungen wird. Tank-Register (accepts_deliveries) sind grundsätzlich
    ausgenommen.
    """
    if register.accepts_deliveries:
        return
    if acknowledge_warnings:
        return

    before_stmt = (
        select(Reading)
        .where(Reading.register_id == register.id)
        .where(Reading.reading_at < reading_at)
        .order_by(Reading.reading_at.desc())
        .limit(1)
    )
    after_stmt = (
        select(Reading)
        .where(Reading.register_id == register.id)
        .where(Reading.reading_at > reading_at)
        .order_by(Reading.reading_at.asc())
        .limit(1)
    )
    if exclude_id is not None:
        before_stmt = before_stmt.where(Reading.id != exclude_id)
        after_stmt = after_stmt.where(Reading.id != exclude_id)

    before = db.scalar(before_stmt)
    after = db.scalar(after_stmt)

    if before is not None and value < before.value:
        before_str = before.reading_at.strftime("%d.%m.%Y %H:%M")
        raise ProblemError(
            status_code=STATUS_PLAUSIBILITY_WARNING,
            title="Wert kleiner als vorheriger Stand",
            detail=(
                f"Vorheriger Stand am {before_str}: "
                f"{format(before.value, 'f')}. Bei Strom-, Gas-, Wasserzählern und "
                "Betriebsstunden darf der Wert normalerweise nicht zurückgehen. "
                "Wenn das beabsichtigt ist (Rollover, Korrektur), bestätige die Warnung."
            ),
            extra={
                "warning": "value_below_previous",
                "acknowledge_field": "acknowledge_warnings",
                "previous": {
                    "id": before.id,
                    "reading_at": to_utc_iso(before.reading_at),
                    "value": format(before.value, "f"),
                },
            },
        )
    if after is not None and value > after.value:
        after_str = after.reading_at.strftime("%d.%m.%Y %H:%M")
        raise ProblemError(
            status_code=STATUS_PLAUSIBILITY_WARNING,
            title="Wert größer als nachfolgender Stand",
            detail=(
                f"Nachfolgender Stand am {after_str}: {format(after.value, 'f')}. "
                "Der nachgetragene Wert würde die Zeitreihe brechen. "
                "Wenn das beabsichtigt ist, bestätige die Warnung."
            ),
            extra={
                "warning": "value_above_next",
                "acknowledge_field": "acknowledge_warnings",
                "next": {
                    "id": after.id,
                    "reading_at": to_utc_iso(after.reading_at),
                    "value": format(after.value, "f"),
                },
            },
        )


@router.get("/readings", response_model=list[ReadingRead])
def list_readings(
    db: DbDep,
    user: CurrentUser,
    register_id: int | None = Query(None),
    measuring_point_id: int | None = Query(None),
    from_at: datetime | None = Query(None),
    to_at: datetime | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
) -> list[ReadingRead]:
    stmt = (
        select(Reading)
        .options(selectinload(Reading.created_by), selectinload(Reading.photos))
        .order_by(Reading.reading_at.desc(), Reading.id.desc())
    )
    # Recorder: immer per Join über Register/PhysicalMeter filtern, damit
    # nur Readings auf zugänglichen MPs zurückkommen. Admin: Join nur
    # nötig, wenn measuring_point_id explizit gefiltert wird.
    needs_mp_join = user.role is not UserRole.ADMIN or measuring_point_id is not None
    if needs_mp_join:
        stmt = stmt.join(Reading.register).join(Register.physical_meter)
    if register_id is not None:
        stmt = stmt.where(Reading.register_id == register_id)
    if measuring_point_id is not None:
        stmt = stmt.where(PhysicalMeter.measuring_point_id == measuring_point_id)
    stmt = restrict_mp_query(stmt, user, mp_id_column=PhysicalMeter.measuring_point_id)
    if from_at is not None:
        stmt = stmt.where(Reading.reading_at >= from_at)
    if to_at is not None:
        stmt = stmt.where(Reading.reading_at <= to_at)
    stmt = stmt.limit(limit)
    rows = list(db.scalars(stmt))
    return [_to_read(r) for r in rows]


@router.post("/readings", response_model=ReadingRead, status_code=status.HTTP_201_CREATED)
def create_reading(
    payload: ReadingCreate,
    request: Request,
    db: DbDep,
    user: CurrentUser,
) -> ReadingRead:
    register = db.get(Register, payload.register_id)
    if register is None or not register.is_active:
        raise ProblemError(status_code=404, title="Register not found or inactive")
    assert_can_access_register(db, user, register.id)

    _check_value_in_series(
        db,
        register=register,
        reading_at=payload.reading_at,
        value=payload.value,
        acknowledge_warnings=payload.acknowledge_warnings,
    )

    reading = Reading(
        register_id=register.id,
        value=payload.value,
        reading_at=payload.reading_at,
        note=payload.note,
        created_by_user_id=user.id,
    )
    db.add(reading)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        existing = db.scalar(
            select(Reading).where(
                Reading.register_id == register.id,
                Reading.reading_at == payload.reading_at,
            )
        )
        extra: dict[str, object] = {}
        if existing is not None:
            extra = {
                "existing": {
                    "id": existing.id,
                    "value": format(existing.value, "f"),
                    "created_by_user_id": existing.created_by_user_id,
                }
            }
        raise ProblemError(
            status_code=409,
            title="Reading already exists at this timestamp",
            detail="Für dieses Register und diesen Zeitpunkt existiert bereits ein Reading.",
            extra=extra,
        ) from exc

    record(
        db,
        user_id=user.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.READING,
        entity_id=reading.id,
        diff={
            "register_id": register.id,
            "value": format(payload.value, "f"),
            "reading_at": to_utc_iso(payload.reading_at),
        },
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(reading)
    return _to_read(reading)


@router.patch("/readings/{reading_id}", response_model=ReadingRead)
def update_reading(
    reading_id: int,
    payload: ReadingUpdate,
    request: Request,
    db: DbDep,
    user: CurrentUser,
) -> ReadingRead:
    reading = db.get(Reading, reading_id)
    if reading is None:
        raise ProblemError(status_code=404, title="Reading not found")
    # Zugriff auf die zugehörige Messstelle ist Vorbedingung — selbst wenn
    # der Recorder Ersteller dieses Readings war, darf er es nach Entzug
    # des MP-Zugriffs nicht mehr ändern.
    assert_can_access_register(db, user, reading.register_id)
    if not _can_edit(user, reading):
        raise ProblemError(status_code=403, title="Cannot edit this reading")

    new_value = payload.value if payload.value is not None else reading.value
    new_at = payload.reading_at if payload.reading_at is not None else reading.reading_at
    if payload.value is not None or payload.reading_at is not None:
        _check_value_in_series(
            db,
            register=reading.register,
            reading_at=new_at,
            value=new_value,
            exclude_id=reading.id,
            acknowledge_warnings=payload.acknowledge_warnings,
        )

    diff: dict[str, object] = {}
    if payload.value is not None and payload.value != reading.value:
        diff["value"] = {"from": format(reading.value, "f"), "to": format(payload.value, "f")}
        reading.value = payload.value
    if payload.reading_at is not None and payload.reading_at != reading.reading_at:
        diff["reading_at"] = {
            "from": to_utc_iso(reading.reading_at),
            "to": to_utc_iso(payload.reading_at),
        }
        reading.reading_at = payload.reading_at
    if payload.note is not None and payload.note != reading.note:
        diff["note"] = {"from": reading.note, "to": payload.note}
        reading.note = payload.note

    if diff:
        record(
            db,
            user_id=user.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.READING,
            entity_id=reading.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(
            status_code=409,
            title="Reading already exists at this timestamp",
        ) from exc
    db.refresh(reading)
    return _to_read(reading)


@router.delete("/readings/{reading_id}", status_code=204)
def delete_reading(
    reading_id: int,
    request: Request,
    db: DbDep,
    user: CurrentUser,
) -> None:
    reading = db.get(Reading, reading_id)
    if reading is None:
        raise ProblemError(status_code=404, title="Reading not found")
    assert_can_access_register(db, user, reading.register_id)
    if not _can_edit(user, reading):
        raise ProblemError(status_code=403, title="Cannot delete this reading")

    record(
        db,
        user_id=user.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.READING,
        entity_id=reading.id,
        diff={
            "register_id": reading.register_id,
            "value": format(reading.value, "f"),
            "reading_at": to_utc_iso(reading.reading_at),
        },
        ip_address=client_ip(request),
    )
    # Alle Foto-Basenames vor dem Löschen merken (DB-Cascade entfernt die
    # reading_photo-Zeilen, aber nicht die Dateien).
    photo_basenames = [p.photo_path for p in reading.photos]
    db.delete(reading)
    db.commit()
    # Dateien erst nach erfolgreichem DB-Commit löschen — andernfalls wären
    # die Fotos weg, das Reading aber noch da.
    for basename in photo_basenames:
        delete_photo(basename)


# Bis zu 6 Fotos je Erfassung (z. B. Zählwerk, Plombe, Umgebung, Schild).
MAX_PHOTOS_PER_READING = 6


@router.post("/readings/{reading_id}/photos", response_model=ReadingRead)
def add_reading_photo(
    reading_id: int,
    request: Request,
    db: DbDep,
    user: CurrentUser,
    photo: Annotated[UploadFile, File()],
    gps_lat: Annotated[float | None, Form()] = None,
    gps_lon: Annotated[float | None, Form()] = None,
) -> ReadingRead:
    reading = db.get(Reading, reading_id)
    if reading is None:
        raise ProblemError(status_code=404, title="Reading not found")
    assert_can_access_register(db, user, reading.register_id)
    if not _can_edit(user, reading):
        raise ProblemError(status_code=403, title="Cannot edit this reading")
    if len(reading.photos) >= MAX_PHOTOS_PER_READING:
        raise ProblemError(
            status_code=409,
            title="Zu viele Fotos",
            detail=f"Maximal {MAX_PHOTOS_PER_READING} Fotos je Erfassung.",
        )

    new_basename, gps = save_photo(reading.id, photo)
    # Fallback: wenn das EXIF keine GPS-Tags hatte, akzeptiere die vom
    # Client (Browser-Geolocation) mitgegebenen Koordinaten — mobile
    # Safari strippt EXIF-GPS aus per ``capture``-Input aufgenommenen Fotos.
    if gps is None:
        gps = validate_gps(gps_lat, gps_lon)
    next_index = max((p.sort_index for p in reading.photos), default=-1) + 1
    db.add(
        ReadingPhoto(
            reading_id=reading.id,
            photo_path=new_basename,
            photo_lat=gps[0] if gps is not None else None,
            photo_lon=gps[1] if gps is not None else None,
            sort_index=next_index,
        )
    )
    record(
        db,
        user_id=user.id,
        action=AuditAction.UPDATE,
        entity_type=AuditEntityType.READING,
        entity_id=reading.id,
        diff={"photo": {"action": "added", "count": len(reading.photos) + 1}},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(reading)
    return _to_read(reading)


@router.delete("/readings/{reading_id}/photos/{photo_id}", status_code=204)
def delete_reading_photo(
    reading_id: int,
    photo_id: int,
    request: Request,
    db: DbDep,
    user: CurrentUser,
) -> None:
    photo = db.get(ReadingPhoto, photo_id)
    if photo is None or photo.reading_id != reading_id:
        # Nicht (mehr) vorhanden — idempotent als 204 zurückgeben.
        return
    reading = photo.reading
    assert_can_access_register(db, user, reading.register_id)
    if not _can_edit(user, reading):
        raise ProblemError(status_code=403, title="Cannot edit this reading")
    basename = photo.photo_path
    db.delete(photo)
    record(
        db,
        user_id=user.id,
        action=AuditAction.UPDATE,
        entity_type=AuditEntityType.READING,
        entity_id=reading.id,
        diff={"photo": {"action": "removed", "photo_id": photo_id}},
        ip_address=client_ip(request),
    )
    db.commit()
    delete_photo(basename)


@router.get("/readings/{reading_id}/photos/{photo_id}")
def get_reading_photo(
    reading_id: int,
    photo_id: int,
    db: DbDep,
    user: CurrentUser,
) -> Response:
    photo = db.get(ReadingPhoto, photo_id)
    if photo is None or photo.reading_id != reading_id:
        raise ProblemError(status_code=404, title="No photo for this reading")
    # Auslieferung läuft über die API (nicht StaticFiles), damit der
    # Recorder-MP-Filter greift — sonst könnten User mit der URL fremde
    # Fotos laden.
    assert_can_access_register(db, user, photo.reading.register_id)
    try:
        path = photo_full_path(photo.photo_path)
    except ValueError as exc:
        raise ProblemError(status_code=404, title="Photo file not found") from exc
    if not path.is_file():
        raise ProblemError(status_code=404, title="Photo file not found")
    # ``no-store`` verhindert, dass der Service Worker (VitePWA, NetworkFirst)
    # nach einem Ersetzen das alte Bild aus dem Cache liefert.
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, no-store"},
    )


@router.get(
    "/measuring-points/{mp_id}/consumption",
    response_model=list[ConsumptionPoint],
)
def consumption(
    mp_id: int,
    db: DbDep,
    user: CurrentUser,
    granularity: Literal["day", "week", "month", "year"] | None = Query(None),
    from_at: date | None = Query(None),
    to_at: date | None = Query(None),
) -> list[ConsumptionPoint]:
    assert_can_access_mp(db, user, mp_id)
    # Monats-Granularität aus der materialisierten Tabelle lesen (schnell, ohne
    # alle Readings zu laden); andere Granularitäten weiterhin on-the-fly. Beide
    # nutzen dieselbe Interpolations-Logik -> identische Werte.
    if granularity == "month":
        points = monthly_points_for_measuring_point(db, mp_id)
    else:
        points = consumption_for_measuring_point(db, measuring_point_id=mp_id)
    points = aggregate_consumption(
        points, granularity=granularity, from_date=from_at, to_date=to_at
    )
    return [
        ConsumptionPoint(
            period_start=p.period_start,
            period_end=p.period_end,
            register_id=p.register_id,
            obis_code=p.obis_code,
            consumption=p.consumption,
            unit=p.unit,
        )
        for p in points
    ]
