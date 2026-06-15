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
    MieterAssignment,
    OwnerAssignment,
    PhysicalMeter,
    Reading,
    Register,
    SupplierAssignment,
    User,
    UserMeasuringPointAccess,
    UserRole,
)
from meters.schemas import (
    ChangeMieterRequest,
    ChangeOwnerRequest,
    ChangeSupplierRequest,
    MeasuringPointCreate,
    MeasuringPointRead,
    MeasuringPointUpdate,
    MieterAssignmentCreate,
    MieterAssignmentRead,
    MieterAssignmentUpdate,
    MpAccessUserRead,
    OwnerAssignmentCreate,
    OwnerAssignmentRead,
    OwnerAssignmentUpdate,
    RegisterStateRead,
    ReplaceMeterRequest,
    SupplierAssignmentCreate,
    SupplierAssignmentRead,
    SupplierAssignmentUpdate,
)
from meters.services.access import assert_can_access_mp, restrict_mp_query
from meters.services.audit import record
from meters.services.meter_replacement import install_first_meter, replace_meter

# Mieter-Service mit Aliassen — strukturgleich zum Owner-/Supplier-Service.
from meters.services.mieter_assignment import (
    assign_mieter,
)
from meters.services.mieter_assignment import (
    create_assignment as create_mieter_assignment,
)
from meters.services.mieter_assignment import (
    current_assignment as current_mieter_assignment,
)
from meters.services.mieter_assignment import (
    current_assignments_bulk as current_mieter_assignments_bulk,
)
from meters.services.mieter_assignment import (
    delete_assignment as delete_mieter_assignment,
)
from meters.services.mieter_assignment import (
    list_history as list_mieter_history_service,
)
from meters.services.mieter_assignment import (
    update_assignment as update_mieter_assignment,
)
from meters.services.owner_assignment import (
    assign_owner,
    create_assignment,
    current_assignment,
    current_assignments_bulk,
    delete_assignment,
    list_history,
    update_assignment,
)
from meters.services.state import state_for_measuring_point

# Supplier-Service mit Aliassen — die Funktionsnamen kollidieren sonst mit
# dem strukturgleichen Owner-Service.
from meters.services.supplier_assignment import (
    assign_supplier,
)
from meters.services.supplier_assignment import (
    create_assignment as create_supplier_assignment,
)
from meters.services.supplier_assignment import (
    current_assignment as current_supplier_assignment,
)
from meters.services.supplier_assignment import (
    current_assignments_bulk as current_supplier_assignments_bulk,
)
from meters.services.supplier_assignment import (
    delete_assignment as delete_supplier_assignment,
)
from meters.services.supplier_assignment import (
    list_history as list_supplier_history_service,
)
from meters.services.supplier_assignment import (
    update_assignment as update_supplier_assignment,
)

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


def _to_read(
    mp: MeasuringPoint,
    db: DbSession | None = None,
    *,
    current_owner: OwnerAssignment | None = None,
    current_supplier: SupplierAssignment | None = None,
    current_mieter: MieterAssignment | None = None,
) -> MeasuringPointRead:
    data = MeasuringPointRead.model_validate(mp)
    location = mp.location
    data.location_name = location.name if location else None
    main_loc = location.main_location if location else None
    data.main_location_id = main_loc.id if main_loc else None
    data.main_location_name = main_loc.name if main_loc else None
    # Owner-Lookup: bevorzugt das per ``current_owner`` durchgereichte
    # Assignment (Listing-Pfad mit Bulk-Preload, vermeidet N+1). Faellt es
    # nicht durchgereicht, holen wir es per Single-Query nach — Detail-,
    # Update- und Replace-Endpoints brauchen das jeweils nur einmal.
    assignment = current_owner
    if assignment is None and db is not None:
        assignment = current_assignment(db, mp.id)
    if assignment is not None and assignment.owner is not None:
        data.current_owner_id = assignment.owner.id
        data.current_owner_name = assignment.owner.name
    # Lieferant: identischer Mechanismus wie der Owner-Lookup darueber.
    supplier_assignment = current_supplier
    if supplier_assignment is None and db is not None:
        supplier_assignment = current_supplier_assignment(db, mp.id)
    if supplier_assignment is not None and supplier_assignment.supplier is not None:
        data.current_supplier_id = supplier_assignment.supplier.id
        data.current_supplier_name = supplier_assignment.supplier.name
    # Mieter: identischer Mechanismus wie der Owner-/Lieferant-Lookup darueber.
    mieter_assignment = current_mieter
    if mieter_assignment is None and db is not None:
        mieter_assignment = current_mieter_assignment(db, mp.id)
    if mieter_assignment is not None and mieter_assignment.mieter is not None:
        data.current_mieter_id = mieter_assignment.mieter.id
        data.current_mieter_name = mieter_assignment.mieter.display_name
    return data


def _ensure_location(db: DbSession, location_id: int | None) -> None:
    if location_id is None:
        return
    if db.get(Location, location_id) is None:
        raise ProblemError(status_code=404, title="Location not found")


@router.get("", response_model=list[MeasuringPointRead])
def list_measuring_points(db: DbDep, user: CurrentUser) -> list[MeasuringPointRead]:
    stmt = (
        select(MeasuringPoint)
        .order_by(MeasuringPoint.name)
        .options(
            selectinload(MeasuringPoint.location),
            selectinload(MeasuringPoint.physical_meters).selectinload(PhysicalMeter.registers),
        )
    )
    stmt = restrict_mp_query(stmt, user, mp_id_column=MeasuringPoint.id)
    items = list(db.scalars(stmt))
    # Owner-/Supplier-Assignments fuer alle MPs in je einer Query vorladen.
    # Kein db an _to_read durchreichen, damit der Single-Query-Fallback fuer
    # MPs ohne Owner/Supplier nicht greift. ids als Liste materialisieren —
    # ein Generator waere nach dem ersten Bulk-Call konsumiert.
    ids = [m.id for m in items]
    owners_by_mp = current_assignments_bulk(db, ids)
    suppliers_by_mp = current_supplier_assignments_bulk(db, ids)
    mieters_by_mp = current_mieter_assignments_bulk(db, ids)
    return [
        _to_read(
            m,
            current_owner=owners_by_mp.get(m.id),
            current_supplier=suppliers_by_mp.get(m.id),
            current_mieter=mieters_by_mp.get(m.id),
        )
        for m in items
    ]


@router.get("/{mp_id}", response_model=MeasuringPointRead)
def get_measuring_point(mp_id: int, db: DbDep, user: CurrentUser) -> MeasuringPointRead:
    assert_can_access_mp(db, user, mp_id)
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
    return _to_read(mp, db)


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
        contract_number=payload.contract_number,
        market_location=payload.market_location,
        installation_location=payload.installation_location,
        kostenstelle=payload.kostenstelle,
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
    # Initiales Owner-Assignment, falls beim Anlegen ein Eigentuemer
    # mitgegeben wurde. ``valid_from`` default = ``installed_at``.
    if payload.owner_id is not None:
        assign_owner(
            db,
            mp_id=mp.id,
            owner_id=payload.owner_id,
            valid_from=payload.owner_valid_from or payload.installed_at,
            user_id=admin.id,
            ip_address=client_ip(request),
        )
    # Initiales Supplier-Assignment — gleiche Semantik wie der Owner-Block.
    if payload.supplier_id is not None:
        assign_supplier(
            db,
            mp_id=mp.id,
            supplier_id=payload.supplier_id,
            valid_from=payload.supplier_valid_from or payload.installed_at,
            user_id=admin.id,
            ip_address=client_ip(request),
        )
    # Initiales Mieter-Assignment — optional, gleiche Semantik wie der Owner-Block.
    if payload.mieter_id is not None:
        assign_mieter(
            db,
            mp_id=mp.id,
            mieter_id=payload.mieter_id,
            valid_from=payload.mieter_valid_from or payload.installed_at,
            user_id=admin.id,
            ip_address=client_ip(request),
        )
    db.commit()
    refreshed = _load_with_meters(db, mp.id)
    assert refreshed is not None
    return _to_read(refreshed, db)


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

    # Vertragsnummer: nur fuer Strom + Wasser zulaessig.
    if payload.contract_number is not None and mp.type not in (
        MeterType.ELECTRICITY,
        MeterType.WATER,
    ):
        raise ProblemError(
            status_code=422,
            title="Invalid field",
            detail="contract_number ist nur für Strom- oder Wasser-Messstellen zulässig",
        )
    if payload.clear_contract_number:
        if mp.contract_number is not None:
            diff["contract_number"] = {"from": mp.contract_number, "to": None}
            mp.contract_number = None
    elif payload.contract_number is not None and payload.contract_number != mp.contract_number:
        diff["contract_number"] = {
            "from": mp.contract_number,
            "to": payload.contract_number,
        }
        mp.contract_number = payload.contract_number

    # Einbauort: Freitext, ohne Typ-Validation. ``clear_*`` setzt explizit
    # auf NULL.
    if payload.clear_installation_location:
        if mp.installation_location is not None:
            diff["installation_location"] = {
                "from": mp.installation_location,
                "to": None,
            }
            mp.installation_location = None
    elif (
        payload.installation_location is not None
        and payload.installation_location != mp.installation_location
    ):
        diff["installation_location"] = {
            "from": mp.installation_location,
            "to": payload.installation_location,
        }
        mp.installation_location = payload.installation_location

    # Kostenstelle: Ganzzahl 0-99999, ohne Typ-Validation. ``clear_*`` -> NULL.
    if payload.clear_kostenstelle:
        if mp.kostenstelle is not None:
            diff["kostenstelle"] = {"from": mp.kostenstelle, "to": None}
            mp.kostenstelle = None
    elif payload.kostenstelle is not None and payload.kostenstelle != mp.kostenstelle:
        diff["kostenstelle"] = {"from": mp.kostenstelle, "to": payload.kostenstelle}
        mp.kostenstelle = payload.kostenstelle

    # Marktlokation: nur fuer Strom zulaessig.
    if payload.market_location is not None and mp.type is not MeterType.ELECTRICITY:
        raise ProblemError(
            status_code=422,
            title="Invalid field",
            detail="market_location ist nur für Strom-Messstellen zulässig",
        )
    if payload.clear_market_location:
        if mp.market_location is not None:
            diff["market_location"] = {"from": mp.market_location, "to": None}
            mp.market_location = None
    elif payload.market_location is not None and payload.market_location != mp.market_location:
        diff["market_location"] = {
            "from": mp.market_location,
            "to": payload.market_location,
        }
        mp.market_location = payload.market_location

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
    return _to_read(refreshed, db)


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
    return _to_read(refreshed, db)


@router.get("/{mp_id}/state", response_model=list[RegisterStateRead])
def get_state(
    mp_id: int,
    db: DbDep,
    user: CurrentUser,
) -> list[RegisterStateRead]:
    assert_can_access_mp(db, user, mp_id)
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


@router.get("/{mp_id}/users", response_model=list[MpAccessUserRead])
def get_mp_users(
    mp_id: int,
    db: DbDep,
    _admin: AdminUser,
) -> list[MpAccessUserRead]:
    """Liste aller User mit Zugriff auf diese Messstelle.

    Admins sind immer dabei (impliziter Vollzugriff). Recorder erscheinen,
    wenn sie einen Eintrag in :class:`UserMeasuringPointAccess` haben.
    """
    if db.get(MeasuringPoint, mp_id) is None:
        raise ProblemError(status_code=404, title="Measuring point not found")

    admins = list(
        db.scalars(
            select(User)
            .where(User.role == UserRole.ADMIN, User.is_active.is_(True))
            .order_by(User.username)
        )
    )
    granted_recorders = list(
        db.scalars(
            select(User)
            .join(
                UserMeasuringPointAccess,
                UserMeasuringPointAccess.user_id == User.id,
            )
            .where(
                UserMeasuringPointAccess.measuring_point_id == mp_id,
                User.is_active.is_(True),
            )
            .order_by(User.username)
        )
    )

    out: list[MpAccessUserRead] = []
    for u in admins:
        out.append(
            MpAccessUserRead(
                user_id=u.id,
                username=u.username,
                role=u.role.value,
                source="admin",
            )
        )
    for u in granted_recorders:
        out.append(
            MpAccessUserRead(
                user_id=u.id,
                username=u.username,
                role=u.role.value,
                source="grant",
            )
        )
    return out


# ---------------------------------------------------------------------------
# Eigentuemer-Historie + Wechsel-Endpoint
# ---------------------------------------------------------------------------


def _assignment_to_read(a: OwnerAssignment) -> OwnerAssignmentRead:
    data = OwnerAssignmentRead.model_validate(a)
    data.owner_name = a.owner.name if a.owner is not None else None
    return data


@router.get("/{mp_id}/owners", response_model=list[OwnerAssignmentRead])
def list_owner_history(
    mp_id: int,
    db: DbDep,
    user: CurrentUser,
) -> list[OwnerAssignmentRead]:
    assert_can_access_mp(db, user, mp_id)
    return [_assignment_to_read(a) for a in list_history(db, mp_id)]


@router.post("/{mp_id}/change-owner", response_model=MeasuringPointRead)
def change_owner_endpoint(
    mp_id: int,
    payload: ChangeOwnerRequest,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> MeasuringPointRead:
    assign_owner(
        db,
        mp_id=mp_id,
        owner_id=payload.owner_id,
        valid_from=payload.valid_from,
        user_id=admin.id,
        ip_address=client_ip(request),
    )
    db.commit()
    refreshed = _load_with_meters(db, mp_id)
    assert refreshed is not None
    return _to_read(refreshed, db)


# Historien-Editor (admin-only): Perioden der Eigentuemer-Historie anlegen,
# korrigieren und loeschen — inkl. Rueckdatierung und Luecken (Leerstand).
# Validierung (keine Ueberlappung, max. eine offene Periode) liegt im Service.


@router.post(
    "/{mp_id}/owners",
    response_model=OwnerAssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_owner_period(
    mp_id: int,
    payload: OwnerAssignmentCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> OwnerAssignmentRead:
    assignment = create_assignment(
        db,
        mp_id=mp_id,
        owner_id=payload.owner_id,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        user_id=admin.id,
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(assignment)
    return _assignment_to_read(assignment)


@router.patch("/{mp_id}/owners/{assignment_id}", response_model=OwnerAssignmentRead)
def update_owner_period(
    mp_id: int,
    assignment_id: int,
    payload: OwnerAssignmentUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> OwnerAssignmentRead:
    assignment = update_assignment(
        db,
        mp_id=mp_id,
        assignment_id=assignment_id,
        owner_id=payload.owner_id,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        user_id=admin.id,
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(assignment)
    return _assignment_to_read(assignment)


@router.delete("/{mp_id}/owners/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_owner_period(
    mp_id: int,
    assignment_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    delete_assignment(
        db,
        mp_id=mp_id,
        assignment_id=assignment_id,
        user_id=admin.id,
        ip_address=client_ip(request),
    )
    db.commit()


# ---------------------------------------------------------------------------
# Lieferanten-Historie + Wechsel-Endpoint — 1:1-Spiegel der Owner-Endpoints.
# ---------------------------------------------------------------------------


def _supplier_assignment_to_read(a: SupplierAssignment) -> SupplierAssignmentRead:
    data = SupplierAssignmentRead.model_validate(a)
    data.supplier_name = a.supplier.name if a.supplier is not None else None
    return data


@router.get("/{mp_id}/suppliers", response_model=list[SupplierAssignmentRead])
def list_supplier_history(
    mp_id: int,
    db: DbDep,
    user: CurrentUser,
) -> list[SupplierAssignmentRead]:
    assert_can_access_mp(db, user, mp_id)
    return [_supplier_assignment_to_read(a) for a in list_supplier_history_service(db, mp_id)]


@router.post("/{mp_id}/change-supplier", response_model=MeasuringPointRead)
def change_supplier_endpoint(
    mp_id: int,
    payload: ChangeSupplierRequest,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> MeasuringPointRead:
    assign_supplier(
        db,
        mp_id=mp_id,
        supplier_id=payload.supplier_id,
        valid_from=payload.valid_from,
        user_id=admin.id,
        ip_address=client_ip(request),
    )
    db.commit()
    refreshed = _load_with_meters(db, mp_id)
    assert refreshed is not None
    return _to_read(refreshed, db)


# Historien-Editor (admin-only): Perioden der Lieferanten-Historie anlegen,
# korrigieren und loeschen — inkl. Rueckdatierung und Luecken. Validierung
# (keine Ueberlappung, max. eine offene Periode) liegt im Service.


@router.post(
    "/{mp_id}/suppliers",
    response_model=SupplierAssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_supplier_period(
    mp_id: int,
    payload: SupplierAssignmentCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> SupplierAssignmentRead:
    assignment = create_supplier_assignment(
        db,
        mp_id=mp_id,
        supplier_id=payload.supplier_id,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        user_id=admin.id,
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(assignment)
    return _supplier_assignment_to_read(assignment)


@router.patch("/{mp_id}/suppliers/{assignment_id}", response_model=SupplierAssignmentRead)
def update_supplier_period(
    mp_id: int,
    assignment_id: int,
    payload: SupplierAssignmentUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> SupplierAssignmentRead:
    assignment = update_supplier_assignment(
        db,
        mp_id=mp_id,
        assignment_id=assignment_id,
        supplier_id=payload.supplier_id,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        user_id=admin.id,
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(assignment)
    return _supplier_assignment_to_read(assignment)


@router.delete("/{mp_id}/suppliers/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier_period(
    mp_id: int,
    assignment_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    delete_supplier_assignment(
        db,
        mp_id=mp_id,
        assignment_id=assignment_id,
        user_id=admin.id,
        ip_address=client_ip(request),
    )
    db.commit()


# ---------------------------------------------------------------------------
# Mieter-Historie + Wechsel-Endpoint — 1:1-Spiegel der Owner-Endpoints.
# Die Zuordnung ist optional; eine MP muss keinen Mieter haben.
# ---------------------------------------------------------------------------


def _mieter_assignment_to_read(a: MieterAssignment) -> MieterAssignmentRead:
    data = MieterAssignmentRead.model_validate(a)
    data.mieter_name = a.mieter.display_name if a.mieter is not None else None
    return data


@router.get("/{mp_id}/mieters", response_model=list[MieterAssignmentRead])
def list_mieter_history(
    mp_id: int,
    db: DbDep,
    user: CurrentUser,
) -> list[MieterAssignmentRead]:
    assert_can_access_mp(db, user, mp_id)
    return [_mieter_assignment_to_read(a) for a in list_mieter_history_service(db, mp_id)]


@router.post("/{mp_id}/change-mieter", response_model=MeasuringPointRead)
def change_mieter_endpoint(
    mp_id: int,
    payload: ChangeMieterRequest,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> MeasuringPointRead:
    assign_mieter(
        db,
        mp_id=mp_id,
        mieter_id=payload.mieter_id,
        valid_from=payload.valid_from,
        user_id=admin.id,
        ip_address=client_ip(request),
    )
    db.commit()
    refreshed = _load_with_meters(db, mp_id)
    assert refreshed is not None
    return _to_read(refreshed, db)


# Historien-Editor (admin-only): Perioden der Mieter-Historie anlegen,
# korrigieren und loeschen — inkl. Rueckdatierung und Luecken (Leerstand).
# Validierung (keine Ueberlappung, max. eine offene Periode) liegt im Service.


@router.post(
    "/{mp_id}/mieters",
    response_model=MieterAssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_mieter_period(
    mp_id: int,
    payload: MieterAssignmentCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> MieterAssignmentRead:
    assignment = create_mieter_assignment(
        db,
        mp_id=mp_id,
        mieter_id=payload.mieter_id,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        user_id=admin.id,
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(assignment)
    return _mieter_assignment_to_read(assignment)


@router.patch("/{mp_id}/mieters/{assignment_id}", response_model=MieterAssignmentRead)
def update_mieter_period(
    mp_id: int,
    assignment_id: int,
    payload: MieterAssignmentUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> MieterAssignmentRead:
    assignment = update_mieter_assignment(
        db,
        mp_id=mp_id,
        assignment_id=assignment_id,
        mieter_id=payload.mieter_id,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        user_id=admin.id,
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(assignment)
    return _mieter_assignment_to_read(assignment)


@router.delete("/{mp_id}/mieters/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mieter_period(
    mp_id: int,
    assignment_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    delete_mieter_assignment(
        db,
        mp_id=mp_id,
        assignment_id=assignment_id,
        user_id=admin.id,
        ip_address=client_ip(request),
    )
    db.commit()


# Der frühere GET /measuring-points/{id}/qr-Endpoint wurde mit Feature A
# (QR-Token-Verheiratung) entfernt. Direkter MP-zu-URL-Druck ist nicht mehr
# vorgesehen — neue QR-Codes werden über /qr-tokens erzeugt und der MP per
# /qr-tokens/{token}/assign zugeordnet. parseScannedUrl im Frontend
# unterstützt das alte ?mp=X-Format weiterhin, falls noch ausgedruckte
# Etiketten in der Wildbahn existieren.
