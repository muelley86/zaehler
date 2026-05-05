"""Detail-Bearbeitung physischer Zähler und Register (admin-only).

Hier landen Korrekturen wie Tippfehler in der Seriennummer, falsches
Einbau-/Ausbaudatum oder kosmetische Änderungen am Register-Label.
Strukturelle Änderungen (Zähler tauschen) gehen über
``measuring_points.replace_meter_endpoint``.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, status
from sqlalchemy import func, select

from meters.api.deps import AdminUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    Delivery,
    PhysicalMeter,
    Reading,
    Register,
)
from meters.schemas import (
    HeatingRegisterCreate,
    PhysicalMeterRead,
    PhysicalMeterUpdate,
    RegisterRead,
    RegisterUpdate,
)
from meters.services.audit import record

router = APIRouter(tags=["physical-meters"])


@router.patch("/physical-meters/{meter_id}", response_model=PhysicalMeterRead)
def update_physical_meter(
    meter_id: int,
    payload: PhysicalMeterUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> PhysicalMeterRead:
    meter = db.get(PhysicalMeter, meter_id)
    if meter is None:
        raise ProblemError(status_code=404, title="Physical meter not found")

    diff: dict[str, object] = {}
    if payload.serial_number is not None and payload.serial_number != meter.serial_number:
        diff["serial_number"] = {"from": meter.serial_number, "to": payload.serial_number}
        meter.serial_number = payload.serial_number
    if payload.installed_at is not None and payload.installed_at != meter.installed_at:
        diff["installed_at"] = {
            "from": meter.installed_at.isoformat(),
            "to": payload.installed_at.isoformat(),
        }
        meter.installed_at = payload.installed_at
    if payload.clear_removed_at:
        if meter.removed_at is not None:
            diff["removed_at"] = {"from": meter.removed_at.isoformat(), "to": None}
            meter.removed_at = None
    elif payload.removed_at is not None and payload.removed_at != meter.removed_at:
        diff["removed_at"] = {
            "from": meter.removed_at.isoformat() if meter.removed_at else None,
            "to": payload.removed_at.isoformat(),
        }
        meter.removed_at = payload.removed_at

    if meter.removed_at is not None and meter.removed_at < meter.installed_at:
        raise ProblemError(
            status_code=400,
            title="Invalid dates",
            detail="removed_at darf nicht vor installed_at liegen.",
        )

    if diff:
        record(
            db,
            user_id=admin.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.PHYSICAL_METER,
            entity_id=meter.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    db.commit()
    db.refresh(meter)
    return PhysicalMeterRead.model_validate(meter)


@router.patch("/registers/{register_id}", response_model=RegisterRead)
def update_register(
    register_id: int,
    payload: RegisterUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> RegisterRead:
    register = db.get(Register, register_id)
    if register is None:
        raise ProblemError(status_code=404, title="Register not found")

    diff: dict[str, object] = {}
    if payload.label is not None and payload.label != register.label:
        diff["label"] = {"from": register.label, "to": payload.label}
        register.label = payload.label
    if payload.unit is not None and payload.unit != register.unit:
        diff["unit"] = {"from": register.unit, "to": payload.unit}
        register.unit = payload.unit
    if payload.is_active is not None and payload.is_active != register.is_active:
        diff["is_active"] = {"from": register.is_active, "to": payload.is_active}
        register.is_active = payload.is_active
    if payload.max_value is not None and payload.max_value != register.max_value:
        diff["max_value"] = {
            "from": format(register.max_value, "f"),
            "to": format(payload.max_value, "f"),
        }
        register.max_value = payload.max_value
    if (
        payload.accepts_deliveries is not None
        and payload.accepts_deliveries != register.accepts_deliveries
    ):
        # Lieferungen vorhanden? Dann nicht ohne Weiteres deaktivieren.
        if not payload.accepts_deliveries:
            existing = db.scalar(
                select(func.count(Delivery.id)).where(Delivery.register_id == register.id)
            )
            if existing and existing > 0:
                raise ProblemError(
                    status_code=409,
                    title="Cannot disable deliveries",
                    detail=(
                        f"Es existieren bereits {existing} Lieferungen an diesem Register; "
                        "Lieferungen müssen erst gelöscht werden."
                    ),
                )
        diff["accepts_deliveries"] = {
            "from": register.accepts_deliveries,
            "to": payload.accepts_deliveries,
        }
        register.accepts_deliveries = payload.accepts_deliveries

    if diff:
        record(
            db,
            user_id=admin.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.REGISTER,
            entity_id=register.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    db.commit()
    db.refresh(register)
    return RegisterRead.model_validate(register)


@router.post(
    "/physical-meters/{meter_id}/registers",
    response_model=RegisterRead,
    status_code=status.HTTP_201_CREATED,
)
def create_register(
    meter_id: int,
    payload: HeatingRegisterCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> RegisterRead:
    """Neues Register an einem aktiven PhysicalMeter anhängen.

    Aktuell nur für Wärme-Messstellen vorgesehen — der OBIS-Code wird
    synthetisch fortlaufend (``heat.N``) erzeugt.
    """
    meter = db.get(PhysicalMeter, meter_id)
    if meter is None:
        raise ProblemError(status_code=404, title="Physical meter not found")
    if meter.removed_at is not None:
        raise ProblemError(
            status_code=409,
            title="Meter is inactive",
            detail="Register kann nur an einem aktiven Zähler hinzugefügt werden.",
        )
    existing_codes = {r.obis_code for r in meter.registers}
    idx = len(meter.registers)
    while f"heat.{idx}" in existing_codes:
        idx += 1
    register = Register(
        physical_meter_id=meter.id,
        obis_code=f"heat.{idx}",
        label=payload.label,
        unit=payload.unit,
        is_active=True,
        accepts_deliveries=payload.accepts_deliveries,
    )
    if payload.max_value is not None:
        register.max_value = payload.max_value
    db.add(register)
    db.flush()
    record(
        db,
        user_id=admin.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.REGISTER,
        entity_id=register.id,
        diff={
            "physical_meter_id": meter.id,
            "obis_code": register.obis_code,
            "label": register.label,
            "unit": register.unit,
            "accepts_deliveries": register.accepts_deliveries,
        },
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(register)
    return RegisterRead.model_validate(register)


@router.delete("/registers/{register_id}", status_code=204)
def delete_register(
    register_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    register = db.get(Register, register_id)
    if register is None:
        raise ProblemError(status_code=404, title="Register not found")
    reading_count = db.scalar(
        select(func.count(Reading.id)).where(Reading.register_id == register.id)
    )
    delivery_count = db.scalar(
        select(func.count(Delivery.id)).where(Delivery.register_id == register.id)
    )
    if (reading_count and reading_count > 0) or (delivery_count and delivery_count > 0):
        raise ProblemError(
            status_code=409,
            title="Register has data",
            detail=(
                f"Register hat noch {reading_count or 0} Erfassungen "
                f"und {delivery_count or 0} Lieferungen — bitte vorher löschen."
            ),
            extra={"reading_count": reading_count, "delivery_count": delivery_count},
        )
    record(
        db,
        user_id=admin.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.REGISTER,
        entity_id=register.id,
        diff={"obis_code": register.obis_code, "label": register.label},
        ip_address=client_ip(request),
    )
    db.delete(register)
    db.commit()
