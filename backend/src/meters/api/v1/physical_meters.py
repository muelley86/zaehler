"""Detail-Bearbeitung physischer Zähler und Register (admin-only).

Hier landen Korrekturen wie Tippfehler in der Seriennummer, falsches
Einbau-/Ausbaudatum oder kosmetische Änderungen am Register-Label.
Strukturelle Änderungen (Zähler tauschen) gehen über
``measuring_points.replace_meter_endpoint``.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from meters.api.deps import AdminUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    PhysicalMeter,
    Register,
)
from meters.schemas import (
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
    if payload.is_active is not None and payload.is_active != register.is_active:
        diff["is_active"] = {"from": register.is_active, "to": payload.is_active}
        register.is_active = payload.is_active
    if payload.max_value is not None and payload.max_value != register.max_value:
        diff["max_value"] = {
            "from": format(register.max_value, "f"),
            "to": format(payload.max_value, "f"),
        }
        register.max_value = payload.max_value

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
