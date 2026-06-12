"""Virtuelle (verrechnete) Messstellen — CRUD + Netto-Verbrauchsreihe.

Verwaltung admin-only (wie Locations/Owners). Lesen fuer alle eingeloggten
Nutzer, aber Recorder sehen eine virtuelle MP nur, wenn sie Zugriff auf ALLE
Komponenten-Messstellen haben (siehe ``services.virtual_measuring_point``).
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from meters.api.deps import AdminUser, CurrentUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    FlowDirection,
    MeasuringPoint,
    MeterType,
    VirtualMeasuringPoint,
    VirtualMpComponent,
)
from meters.schemas import (
    ConsumptionPoint,
    VirtualMeasuringPointCreate,
    VirtualMeasuringPointRead,
    VirtualMeasuringPointUpdate,
    VirtualMpBreakdownComponent,
    VirtualMpBreakdownResponse,
    VirtualMpBreakdownTotal,
    VirtualMpComponentIn,
    VirtualMpComponentRead,
)
from meters.services.audit import record
from meters.services.virtual_measuring_point import (
    assert_can_access_virtual_mp,
    breakdown_for_virtual_mp,
    breakdown_totals,
    consumption_for_virtual_mp,
    visible_virtual_mps,
)

router = APIRouter(prefix="/virtual-measuring-points", tags=["virtual-measuring-points"])


def _to_read(vmp: VirtualMeasuringPoint) -> VirtualMeasuringPointRead:
    return VirtualMeasuringPointRead(
        id=vmp.id,
        name=vmp.name,
        note=vmp.note,
        type=vmp.type,
        components=[
            VirtualMpComponentRead(
                id=c.id,
                measuring_point_id=c.measuring_point_id,
                measuring_point_name=c.measuring_point.name,
                direction=c.direction.value,
                sign=c.sign,
            )
            for c in vmp.components
        ],
    )


def _components_diff(components: list[VirtualMpComponentIn]) -> list[dict[str, object]]:
    return [
        {"measuring_point_id": c.measuring_point_id, "direction": c.direction, "sign": c.sign}
        for c in components
    ]


def _validate_components(
    db: Session, mp_type: MeterType, components: list[VirtualMpComponentIn]
) -> None:
    """Fachliche Validierung der Komponentenliste.

    Pruefungen: MP existiert (404), MP-Typ == vmp-Typ (422, verhindert das
    Mischen von kWh und m3), Einspeisung nur bei Strom (422), keine doppelten
    (MP, Richtung)-Paare (422).
    """
    seen: set[tuple[int, str]] = set()
    for comp in components:
        key = (comp.measuring_point_id, comp.direction)
        if key in seen:
            raise ProblemError(
                status_code=422,
                title="Duplicate component",
                detail=(
                    f"Messstelle {comp.measuring_point_id} mit Richtung {comp.direction} "
                    "ist mehrfach enthalten."
                ),
            )
        seen.add(key)
        if comp.direction == "einspeisung" and mp_type is not MeterType.ELECTRICITY:
            raise ProblemError(
                status_code=422,
                title="Einspeisung requires electricity",
                detail="Einspeisung gibt es nur bei Strom-Messstellen.",
            )
        mp = db.get(MeasuringPoint, comp.measuring_point_id)
        if mp is None:
            raise ProblemError(
                status_code=404,
                title="Measuring point not found",
                detail=f"Komponente verweist auf unbekannte Messstelle {comp.measuring_point_id}.",
            )
        if mp.type is not mp_type:
            raise ProblemError(
                status_code=422,
                title="Component type mismatch",
                detail=(
                    f"Messstelle '{mp.name}' hat Typ {mp.type.value}, die virtuelle "
                    f"Messstelle aber Typ {mp_type.value}."
                ),
            )


def _build_components(components: list[VirtualMpComponentIn]) -> list[VirtualMpComponent]:
    return [
        VirtualMpComponent(
            measuring_point_id=c.measuring_point_id,
            direction=FlowDirection(c.direction),
            sign=c.sign,
            sort_index=idx,
        )
        for idx, c in enumerate(components)
    ]


@router.get("", response_model=list[VirtualMeasuringPointRead])
def list_virtual_mps(db: DbDep, user: CurrentUser) -> list[VirtualMeasuringPointRead]:
    return [_to_read(v) for v in visible_virtual_mps(db, user)]


@router.get("/{vmp_id}", response_model=VirtualMeasuringPointRead)
def get_virtual_mp(vmp_id: int, db: DbDep, user: CurrentUser) -> VirtualMeasuringPointRead:
    return _to_read(assert_can_access_virtual_mp(db, user, vmp_id))


@router.post("", response_model=VirtualMeasuringPointRead, status_code=status.HTTP_201_CREATED)
def create_virtual_mp(
    payload: VirtualMeasuringPointCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> VirtualMeasuringPointRead:
    _validate_components(db, payload.type, payload.components)
    vmp = VirtualMeasuringPoint(
        name=payload.name,
        note=payload.note,
        type=payload.type,
        components=_build_components(payload.components),
    )
    db.add(vmp)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(
            status_code=409, title="Virtual measuring point name already exists"
        ) from exc
    record(
        db,
        user_id=admin.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.VIRTUAL_MEASURING_POINT,
        entity_id=vmp.id,
        diff={
            "name": vmp.name,
            "type": vmp.type.value,
            "components": _components_diff(payload.components),
        },
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(vmp)
    return _to_read(vmp)


@router.patch("/{vmp_id}", response_model=VirtualMeasuringPointRead)
def update_virtual_mp(
    vmp_id: int,
    payload: VirtualMeasuringPointUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> VirtualMeasuringPointRead:
    vmp = db.get(VirtualMeasuringPoint, vmp_id)
    if vmp is None:
        raise ProblemError(status_code=404, title="Virtual measuring point not found")
    diff: dict[str, object] = {}
    effective_type = payload.type if payload.type is not None else vmp.type
    if payload.components is not None:
        # Komplette Liste ersetzen — gegen den (ggf. neuen) Typ validieren.
        _validate_components(db, effective_type, payload.components)
        diff["components"] = {
            "from": [
                {
                    "measuring_point_id": c.measuring_point_id,
                    "direction": c.direction.value,
                    "sign": c.sign,
                }
                for c in vmp.components
            ],
            "to": _components_diff(payload.components),
        }
        # Erst loeschen + flushen, dann neu anlegen — sonst insertet die
        # Unit-of-Work die neuen Zeilen vor dem Delete und verletzt den
        # Unique-Constraint (vmp_id, mp_id, direction).
        vmp.components.clear()
        db.flush()
        vmp.components.extend(_build_components(payload.components))
    elif payload.type is not None and payload.type is not vmp.type:
        # Typwechsel ohne neue Komponenten: Bestand muss zum neuen Typ passen.
        _validate_components(
            db,
            effective_type,
            [
                VirtualMpComponentIn(
                    measuring_point_id=c.measuring_point_id,
                    direction=c.direction.value,
                    # DB-Spalte ist int (CheckConstraint ±1), das DTO will das Literal.
                    sign=c.sign,  # type: ignore[arg-type]
                )
                for c in vmp.components
            ],
        )
    if payload.name is not None and payload.name != vmp.name:
        diff["name"] = {"from": vmp.name, "to": payload.name}
        vmp.name = payload.name
    if payload.note is not None and payload.note != vmp.note:
        diff["note"] = {"from": vmp.note, "to": payload.note}
        vmp.note = payload.note
    if payload.type is not None and payload.type is not vmp.type:
        diff["type"] = {"from": vmp.type.value, "to": payload.type.value}
        vmp.type = payload.type
    if diff:
        record(
            db,
            user_id=admin.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.VIRTUAL_MEASURING_POINT,
            entity_id=vmp.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(
            status_code=409, title="Virtual measuring point name already exists"
        ) from exc
    db.refresh(vmp)
    return _to_read(vmp)


@router.delete("/{vmp_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_virtual_mp(
    vmp_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    vmp = db.get(VirtualMeasuringPoint, vmp_id)
    if vmp is None:
        raise ProblemError(status_code=404, title="Virtual measuring point not found")
    record(
        db,
        user_id=admin.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.VIRTUAL_MEASURING_POINT,
        entity_id=vmp.id,
        diff={
            "name": vmp.name,
            "components": [
                {
                    "measuring_point_id": c.measuring_point_id,
                    "direction": c.direction.value,
                    "sign": c.sign,
                }
                for c in vmp.components
            ],
        },
        ip_address=client_ip(request),
    )
    db.delete(vmp)
    db.commit()


@router.get("/{vmp_id}/consumption", response_model=list[ConsumptionPoint])
def virtual_consumption(
    vmp_id: int,
    db: DbDep,
    user: CurrentUser,
    granularity: Literal["day", "week", "month", "year"] | None = Query(None),
    from_at: date | None = Query(None),
    to_at: date | None = Query(None),
) -> list[ConsumptionPoint]:
    """Netto-Verbrauchsreihe. Ohne ``granularity`` wird auf ``day``
    zurueckgefallen — Roh-Intervalle verschiedener Zaehler sind nicht
    deckungsgleich, eine Verrechnung braucht eine gemeinsame Zeitbasis."""
    vmp = assert_can_access_virtual_mp(db, user, vmp_id)
    points = consumption_for_virtual_mp(
        db,
        vmp,
        granularity=granularity or "day",
        from_date=from_at,
        to_date=to_at,
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


@router.get("/{vmp_id}/breakdown", response_model=VirtualMpBreakdownResponse)
def virtual_breakdown(
    vmp_id: int,
    db: DbDep,
    user: CurrentUser,
    from_at: date | None = Query(None),
    to_at: date | None = Query(None),
) -> VirtualMpBreakdownResponse:
    """Audit-Aufschluesselung der Verrechnung: je Komponente die Gesamt-Summe
    im Zeitraum (Rohwert + vorzeichenbehafteter Beitrag) plus Netto je
    Einheit. Gleiche Sichtbarkeitsregel wie ``/consumption`` — Recorder
    sehen die vmp nur bei Zugriff auf ALLE Komponenten-MPs (sonst 404)."""
    vmp = assert_can_access_virtual_mp(db, user, vmp_id)
    rows = breakdown_for_virtual_mp(db, vmp, from_date=from_at, to_date=to_at)
    nets = breakdown_totals(rows)
    return VirtualMpBreakdownResponse(
        virtual_measuring_point_id=vmp.id,
        from_date=from_at,
        to_date=to_at,
        components=[
            VirtualMpBreakdownComponent(
                component_id=r.component_id,
                measuring_point_id=r.measuring_point_id,
                measuring_point_name=r.measuring_point_name,
                direction=r.direction,
                sign=r.sign,
                consumption=r.consumption,
                contribution=r.sign * r.consumption,
                unit=r.unit,
            )
            for r in rows
        ],
        totals=[VirtualMpBreakdownTotal(unit=unit, net=nets[unit]) for unit in sorted(nets)],
    )
