"""Erfassungen (Readings) — Anlegen, Listen, Bearbeiten, Löschen.

Wichtige Plausibilitätsregel: bei kumulativen Zählern (alle außer Heizöl-Tank)
muss der Wert monoton in die Zeitreihe passen — sowohl beim normalen Erfassen
als auch beim Nachtragen rückdatierter Stände. Tank-Register sind ausgenommen,
weil ihr Stand sinken oder durch Lieferungen springen kann.

Berechtigungen: jeder eingeloggte User darf erfassen. Ändern/Löschen darf
ein Admin immer; ein Recorder nur eigene Erfassungen innerhalb 24 h.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Query, Request, status
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
    Register,
    User,
    UserRole,
)
from meters.schemas import ConsumptionPoint, ReadingCreate, ReadingRead, ReadingUpdate
from meters.services.audit import record
from meters.services.consumption import consumption_for_measuring_point

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
        raise ProblemError(
            status_code=STATUS_PLAUSIBILITY_WARNING,
            title="Wert kleiner als vorheriger Stand",
            detail=(
                f"Vorheriger Stand am {before.reading_at.isoformat(sep=' ', timespec='minutes')}: "
                f"{format(before.value, 'f')}. Bei Strom-, Gas-, Wasserzählern und "
                "Betriebsstunden darf der Wert normalerweise nicht zurückgehen. "
                "Wenn das beabsichtigt ist (Rollover, Korrektur), bestätige die Warnung."
            ),
            extra={
                "warning": "value_below_previous",
                "acknowledge_field": "acknowledge_warnings",
                "previous": {
                    "id": before.id,
                    "reading_at": before.reading_at.isoformat(),
                    "value": format(before.value, "f"),
                },
            },
        )
    if after is not None and value > after.value:
        after_str = after.reading_at.isoformat(sep=" ", timespec="minutes")
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
                    "reading_at": after.reading_at.isoformat(),
                    "value": format(after.value, "f"),
                },
            },
        )


@router.get("/readings", response_model=list[ReadingRead])
def list_readings(
    db: DbDep,
    _user: CurrentUser,
    register_id: int | None = Query(None),
    measuring_point_id: int | None = Query(None),
    from_at: datetime | None = Query(None),
    to_at: datetime | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
) -> list[ReadingRead]:
    stmt = (
        select(Reading)
        .options(selectinload(Reading.created_by))
        .order_by(Reading.reading_at.desc(), Reading.id.desc())
    )
    if register_id is not None:
        stmt = stmt.where(Reading.register_id == register_id)
    if measuring_point_id is not None:
        stmt = (
            stmt.join(Reading.register)
            .join(Register.physical_meter)
            .where(PhysicalMeter.measuring_point_id == measuring_point_id)
        )
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
            "reading_at": payload.reading_at.isoformat(),
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
            "from": reading.reading_at.isoformat(),
            "to": payload.reading_at.isoformat(),
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
            "reading_at": reading.reading_at.isoformat(),
        },
        ip_address=client_ip(request),
    )
    db.delete(reading)
    db.commit()


@router.get(
    "/measuring-points/{mp_id}/consumption",
    response_model=list[ConsumptionPoint],
)
def consumption(
    mp_id: int,
    db: DbDep,
    _user: CurrentUser,
) -> list[ConsumptionPoint]:
    points = consumption_for_measuring_point(db, measuring_point_id=mp_id)
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
