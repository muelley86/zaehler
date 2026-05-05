"""Zählertausch-Workflow.

``install_first_meter`` wird sowohl beim Anlegen einer Messstelle als auch
beim Tausch genutzt — es legt PhysicalMeter, Register und (optional)
Anfangs-Readings an. ``replace_meter`` orchestriert den Tausch atomar:
Endstände am alten Gerät, alte Register deaktivieren, neues Gerät mit
Anfangsständen anlegen — alles in einer Transaktion.
"""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session as DbSession

from meters.core.obis import RegisterDef, registers_for
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    MeasuringPoint,
    MeterType,
    PhysicalMeter,
    Reading,
    Register,
)
from meters.services.audit import record


def _coerce_decimal_map(values: dict[str, Decimal | str]) -> dict[str, Decimal]:
    out: dict[str, Decimal] = {}
    for key, value in values.items():
        if isinstance(value, Decimal):
            out[key] = value
            continue
        try:
            out[key] = Decimal(str(value))
        except (InvalidOperation, ValueError) as exc:
            raise ProblemError(
                status_code=400,
                title="Ungültiger Zahlenwert",
                detail=f"Wert für '{key}' ist keine gültige Zahl: {value!r}",
            ) from exc
    return out


def install_first_meter(
    db: DbSession,
    *,
    measuring_point: MeasuringPoint,
    serial_number: str,
    installed_at: date,
    initial_values: dict[str, Decimal | str],
    user_id: int | None,
    ip_address: str | None,
    register_defs: list[RegisterDef] | None = None,
) -> PhysicalMeter:
    """Legt den ersten PhysicalMeter einer MeasuringPoint an.

    ``register_defs`` ist nur für ``MeterType.HEATING`` Pflicht (User-
    konfigurierte Liste); für andere Typen werden OBIS-Defaults aus
    ``registers_for`` benutzt, sofern ``register_defs`` nicht gesetzt ist.
    """
    initial = _coerce_decimal_map(initial_values)
    if register_defs is not None:
        defs = list(register_defs)
    else:
        defs = registers_for(
            measuring_point.type,
            is_bidirectional=measuring_point.is_bidirectional,
            has_dual_tariff=measuring_point.has_dual_tariff,
        )
    meter = PhysicalMeter(
        serial_number=serial_number,
        installed_at=installed_at,
        initial_values={k: format(v, "f") for k, v in initial.items()},
    )
    measuring_point.physical_meters.append(meter)
    db.flush()

    for d in defs:
        register = Register(
            physical_meter_id=meter.id,
            obis_code=d.obis_code,
            label=d.label,
            unit=d.unit,
            is_active=True,
            accepts_deliveries=d.accepts_deliveries,
        )
        db.add(register)
        db.flush()
        if d.obis_code in initial:
            db.add(
                Reading(
                    register_id=register.id,
                    value=initial[d.obis_code],
                    reading_at=datetime.combine(installed_at, time(0, 0, 1)),
                    note="Anfangsstand",
                    created_by_user_id=user_id,
                )
            )
    record(
        db,
        user_id=user_id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.PHYSICAL_METER,
        entity_id=meter.id,
        diff={"serial_number": serial_number, "initial_values": meter.initial_values},
        ip_address=ip_address,
    )
    return meter


def replace_meter(
    db: DbSession,
    *,
    measuring_point: MeasuringPoint,
    final_readings: dict[str, Decimal | str],
    removed_at: date,
    new_serial_number: str,
    installed_at: date,
    initial_readings: dict[str, Decimal | str],
    user_id: int | None,
    ip_address: str | None,
) -> PhysicalMeter:
    if installed_at < removed_at:
        raise ProblemError(
            status_code=400,
            title="Invalid replacement",
            detail="installed_at darf nicht vor removed_at liegen.",
        )

    active_meter = next(
        (m for m in measuring_point.physical_meters if m.removed_at is None),
        None,
    )
    if active_meter is None:
        raise ProblemError(
            status_code=409,
            title="No active meter",
            detail="Es ist kein aktiver Zähler installiert, der getauscht werden könnte.",
        )

    finals = _coerce_decimal_map(final_readings)
    expected = {r.obis_code for r in active_meter.registers if r.is_active}
    missing = expected - set(finals)
    if missing:
        raise ProblemError(
            status_code=400,
            title="Missing final readings",
            detail=f"Endstände fehlen: {sorted(missing)}",
        )

    for register in active_meter.registers:
        if register.obis_code in finals and register.is_active:
            db.add(
                Reading(
                    register_id=register.id,
                    value=finals[register.obis_code],
                    reading_at=datetime.combine(removed_at, time(23, 59, 0)),
                    note="Endstand vor Tausch",
                    created_by_user_id=user_id,
                )
            )
        register.is_active = False
    active_meter.removed_at = removed_at

    # Heating: die User-konfigurierte Register-Liste wandert 1:1 vom alten
    # Meter zum neuen mit (Strom/Wasser nehmen weiter die OBIS-Defaults).
    inherited_defs: list[RegisterDef] | None = None
    if measuring_point.type is MeterType.HEATING:
        inherited_defs = [
            RegisterDef(
                obis_code=r.obis_code,
                label=r.label,
                unit=r.unit,
                accepts_deliveries=r.accepts_deliveries,
            )
            for r in active_meter.registers
        ]
    new_meter = install_first_meter(
        db,
        measuring_point=measuring_point,
        serial_number=new_serial_number,
        installed_at=installed_at,
        initial_values=initial_readings,
        user_id=user_id,
        ip_address=ip_address,
        register_defs=inherited_defs,
    )

    record(
        db,
        user_id=user_id,
        action=AuditAction.METER_REPLACED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=measuring_point.id,
        diff={
            "old_meter_id": active_meter.id,
            "new_meter_id": new_meter.id,
            "removed_at": removed_at.isoformat(),
            "installed_at": installed_at.isoformat(),
        },
        ip_address=ip_address,
    )
    return new_meter
