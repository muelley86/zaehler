"""Messstellen (admin-only) — CRUD plus Zähler-Wechsel und Bestand-Endpoint.

Eine MeasuringPoint ist die *logische* Messstelle ("Hauptzähler Strom Keller").
Sie hat ein oder mehrere PhysicalMeter (Geräte, die getauscht werden), die
wiederum Register und Readings tragen. Beim Anlegen werden die OBIS-Register
automatisch passend zum Typ erzeugt (siehe ``core.obis``).

Eine Messstelle kann nur gelöscht werden, wenn keine Erfassungen daran hängen
(siehe ``delete_measuring_point``) — das schützt vor versehentlichem Datenverlust.
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import selectinload

from meters.api.deps import AdminUser, CurrentUser, DbDep, client_ip
from meters.core.obis import RegisterDef
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    Location,
    MeasuringPoint,
    MeterType,
    PhysicalMeter,
    Reading,
    Register,
)
from meters.schemas import (
    MeasuringPointCreate,
    MeasuringPointRead,
    MeasuringPointUpdate,
    RegisterStateRead,
    ReplaceMeterRequest,
)
from meters.services.audit import record
from meters.services.meter_replacement import install_first_meter, replace_meter
from meters.services.state import state_for_measuring_point

router = APIRouter(prefix="/measuring-points", tags=["measuring-points"])


def _load_with_meters(db: DbSession, mp_id: int) -> MeasuringPoint | None:
    return db.scalar(
        select(MeasuringPoint)
        .where(MeasuringPoint.id == mp_id)
        .options(
            selectinload(MeasuringPoint.location),
            selectinload(MeasuringPoint.physical_meters).selectinload(PhysicalMeter.registers),
        )
    )


def _to_read(mp: MeasuringPoint) -> MeasuringPointRead:
    data = MeasuringPointRead.model_validate(mp)
    data.location_name = mp.location.name if mp.location else None
    return data


def _ensure_location(db: DbSession, location_id: int | None) -> None:
    if location_id is None:
        return
    if db.get(Location, location_id) is None:
        raise ProblemError(status_code=404, title="Location not found")


@router.get("", response_model=list[MeasuringPointRead])
def list_measuring_points(db: DbDep, _user: CurrentUser) -> list[MeasuringPointRead]:
    items = list(
        db.scalars(
            select(MeasuringPoint)
            .order_by(MeasuringPoint.name)
            .options(
                selectinload(MeasuringPoint.location),
                selectinload(MeasuringPoint.physical_meters).selectinload(PhysicalMeter.registers),
            )
        )
    )
    return [_to_read(m) for m in items]


@router.get("/{mp_id}", response_model=MeasuringPointRead)
def get_measuring_point(mp_id: int, db: DbDep, _user: CurrentUser) -> MeasuringPointRead:
    mp = db.scalar(
        select(MeasuringPoint)
        .where(MeasuringPoint.id == mp_id)
        .options(
            selectinload(MeasuringPoint.location),
            selectinload(MeasuringPoint.physical_meters).selectinload(PhysicalMeter.registers),
        )
    )
    if mp is None:
        raise ProblemError(status_code=404, title="Measuring point not found")
    return _to_read(mp)


@router.post("", response_model=MeasuringPointRead, status_code=status.HTTP_201_CREATED)
def create_measuring_point(
    payload: MeasuringPointCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> MeasuringPointRead:
    _ensure_location(db, payload.location_id)
    mp = MeasuringPoint(
        name=payload.name,
        type=payload.type,
        location_id=payload.location_id,
        is_bidirectional=payload.is_bidirectional,
        has_dual_tariff=payload.has_dual_tariff,
        tank_capacity=payload.tank_capacity,
        transformer_factor=payload.transformer_factor,
        heating_source=payload.heating_source,
    )
    db.add(mp)
    db.flush()

    # Heating: User-konfigurierte Register werden 1:1 als RegisterDef
    # an install_first_meter gereicht. Anfangsstände stammen aus
    # ``HeatingRegisterCreate.initial_value``; der OBIS-Code wird
    # synthetisch aus dem Index gebildet, da Wärme keine Standard-OBIS hat.
    register_defs: list[RegisterDef] | None = None
    initial_values: dict[str, Decimal | str] = dict(payload.initial_values)
    if payload.type is MeterType.HEATING:
        register_defs = []
        for idx, r in enumerate(payload.registers):
            obis_code = f"heat.{idx}"
            register_defs.append(
                RegisterDef(
                    obis_code=obis_code,
                    label=r.label,
                    unit=r.unit,
                    accepts_deliveries=r.accepts_deliveries,
                )
            )
            if r.initial_value is not None:
                initial_values[obis_code] = r.initial_value

    install_first_meter(
        db,
        measuring_point=mp,
        serial_number=payload.serial_number,
        installed_at=payload.installed_at,
        initial_values=initial_values,
        user_id=admin.id,
        ip_address=client_ip(request),
        register_defs=register_defs,
    )

    if payload.type is MeterType.HEATING and register_defs is not None:
        # max_value pro Heating-Register nachträglich setzen, weil
        # RegisterDef das Feld nicht trägt (es ist nur Default-Schema).
        active_meter = mp.physical_meters[0]
        for r_payload, register in zip(payload.registers, active_meter.registers, strict=True):
            if r_payload.max_value is not None:
                register.max_value = r_payload.max_value
    record(
        db,
        user_id=admin.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp.id,
        diff={"name": mp.name, "type": mp.type.value, "location_id": payload.location_id},
        ip_address=client_ip(request),
    )
    db.commit()
    refreshed = _load_with_meters(db, mp.id)
    assert refreshed is not None
    return _to_read(refreshed)


@router.patch("/{mp_id}", response_model=MeasuringPointRead)
def update_measuring_point(
    mp_id: int,
    payload: MeasuringPointUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> MeasuringPointRead:
    mp = db.get(MeasuringPoint, mp_id)
    if mp is None:
        raise ProblemError(status_code=404, title="Measuring point not found")

    diff: dict[str, object] = {}
    if payload.name is not None and payload.name != mp.name:
        diff["name"] = {"from": mp.name, "to": payload.name}
        mp.name = payload.name
    if payload.clear_location:
        if mp.location_id is not None:
            diff["location_id"] = {"from": mp.location_id, "to": None}
            mp.location_id = None
    elif payload.location_id is not None and payload.location_id != mp.location_id:
        _ensure_location(db, payload.location_id)
        diff["location_id"] = {"from": mp.location_id, "to": payload.location_id}
        mp.location_id = payload.location_id
    if payload.is_bidirectional is not None and payload.is_bidirectional != mp.is_bidirectional:
        diff["is_bidirectional"] = {"from": mp.is_bidirectional, "to": payload.is_bidirectional}
        mp.is_bidirectional = payload.is_bidirectional
    if payload.has_dual_tariff is not None and payload.has_dual_tariff != mp.has_dual_tariff:
        diff["has_dual_tariff"] = {"from": mp.has_dual_tariff, "to": payload.has_dual_tariff}
        mp.has_dual_tariff = payload.has_dual_tariff
    if payload.clear_tank_capacity:
        if mp.tank_capacity is not None:
            diff["tank_capacity"] = {"from": format(mp.tank_capacity, "f"), "to": None}
            mp.tank_capacity = None
    elif payload.tank_capacity is not None and payload.tank_capacity != mp.tank_capacity:
        diff["tank_capacity"] = {
            "from": format(mp.tank_capacity, "f") if mp.tank_capacity else None,
            "to": format(payload.tank_capacity, "f"),
        }
        mp.tank_capacity = payload.tank_capacity
    if payload.transformer_factor is not None and mp.type is not MeterType.ELECTRICITY:
        raise ProblemError(
            status_code=422,
            title="Invalid field",
            detail="transformer_factor ist nur für Messstellen vom Typ 'electricity' zulässig",
        )
    if payload.clear_transformer_factor:
        if mp.transformer_factor is not None:
            diff["transformer_factor"] = {"from": mp.transformer_factor, "to": None}
            mp.transformer_factor = None
    elif (
        payload.transformer_factor is not None
        and payload.transformer_factor != mp.transformer_factor
    ):
        diff["transformer_factor"] = {
            "from": mp.transformer_factor,
            "to": payload.transformer_factor,
        }
        mp.transformer_factor = payload.transformer_factor

    if diff:
        record(
            db,
            user_id=admin.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.MEASURING_POINT,
            entity_id=mp.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    db.commit()
    refreshed = _load_with_meters(db, mp.id)
    assert refreshed is not None
    return _to_read(refreshed)


@router.delete("/{mp_id}", status_code=204)
def delete_measuring_point(
    mp_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    mp = db.get(MeasuringPoint, mp_id)
    if mp is None:
        raise ProblemError(status_code=404, title="Measuring point not found")

    reading_count = db.scalar(
        select(func.count(Reading.id))
        .join(Register, Register.id == Reading.register_id)
        .join(PhysicalMeter, PhysicalMeter.id == Register.physical_meter_id)
        .where(PhysicalMeter.measuring_point_id == mp_id)
    )
    if reading_count and reading_count > 0:
        raise ProblemError(
            status_code=409,
            title="Cannot delete measuring point",
            detail=(
                f"Es existieren bereits {reading_count} Erfassungen für diese Messstelle. "
                "Lösche zuerst alle Einträge auf der Erfassungen-Seite."
            ),
            extra={"reading_count": reading_count},
        )

    record(
        db,
        user_id=admin.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp.id,
        diff={"name": mp.name},
        ip_address=client_ip(request),
    )
    db.delete(mp)
    db.commit()


@router.post("/{mp_id}/replace-meter", response_model=MeasuringPointRead)
def replace_meter_endpoint(
    mp_id: int,
    payload: ReplaceMeterRequest,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> MeasuringPointRead:
    mp = _load_with_meters(db, mp_id)
    if mp is None:
        raise ProblemError(status_code=404, title="Measuring point not found")

    try:
        replace_meter(
            db,
            measuring_point=mp,
            final_readings=dict(payload.final_readings),
            removed_at=payload.removed_at,
            new_serial_number=payload.new_serial_number,
            installed_at=payload.installed_at,
            initial_readings=dict(payload.initial_readings),
            user_id=admin.id,
            ip_address=client_ip(request),
        )
        db.commit()
    except IntegrityError as exc:
        # Tritt auf, wenn der partielle UNIQUE-Index `uq_physical_meter_active_per_mp`
        # einen zweiten aktiven Meter pro MP verhindert — Race-Bedingung bei
        # parallelen Tausch-Requests. Sauberes 409 statt 500.
        db.rollback()
        raise ProblemError(
            status_code=409,
            title="Meter replacement conflict",
            detail=(
                "Diese Messstelle hat bereits einen frisch installierten Meter — "
                "ein paralleler Tausch ist gerade durchgelaufen. Bitte erneut laden."
            ),
        ) from exc
    refreshed = _load_with_meters(db, mp.id)
    assert refreshed is not None
    return _to_read(refreshed)


@router.get("/{mp_id}/state", response_model=list[RegisterStateRead])
def get_state(
    mp_id: int,
    db: DbDep,
    _user: CurrentUser,
) -> list[RegisterStateRead]:
    if db.get(MeasuringPoint, mp_id) is None:
        raise ProblemError(status_code=404, title="Measuring point not found")
    states = state_for_measuring_point(db, measuring_point_id=mp_id)
    return [
        RegisterStateRead(
            register_id=s.register_id,
            physical_meter_id=s.physical_meter_id,
            obis_code=s.obis_code,
            label=s.label,
            unit=s.unit,
            is_active=s.is_active,
            accepts_deliveries=s.accepts_deliveries,
            last_reading_at=s.last_reading_at,
            last_reading_value=s.last_reading_value,
            refilled_since=s.refilled_since,
            current_value=s.current_value,
        )
        for s in states
    ]
