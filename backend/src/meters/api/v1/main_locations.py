"""Hauptstandorte — uebergeordnete Klammer ueber Zaehlerstandorten.

Lesen darf jeder eingeloggte User (Filter-/Auswahl-UI), Schreiben nur Admin.
Beim Loeschen werden referenzierende ``Location``-Zeilen via DB-Cascade
``SET NULL`` entkoppelt (siehe Migration 0020_main_location), die
Zaehlerstandorte selbst bleiben erhalten.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from meters.api.deps import AdminUser, CurrentUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import AuditAction, AuditEntityType, MainLocation
from meters.schemas import MainLocationCreate, MainLocationRead, MainLocationUpdate
from meters.services.audit import record

router = APIRouter(prefix="/main-locations", tags=["main-locations"])


@router.get("", response_model=list[MainLocationRead])
def list_main_locations(db: DbDep, _user: CurrentUser) -> list[MainLocationRead]:
    rows = list(db.scalars(select(MainLocation).order_by(MainLocation.name)))
    return [MainLocationRead.model_validate(r) for r in rows]


@router.get("/{main_location_id}", response_model=MainLocationRead)
def get_main_location(
    main_location_id: int,
    db: DbDep,
    _user: CurrentUser,
) -> MainLocationRead:
    obj = db.get(MainLocation, main_location_id)
    if obj is None:
        raise ProblemError(status_code=404, title="MainLocation not found")
    return MainLocationRead.model_validate(obj)


@router.post("", response_model=MainLocationRead, status_code=status.HTTP_201_CREATED)
def create_main_location(
    payload: MainLocationCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> MainLocationRead:
    obj = MainLocation(name=payload.name, note=payload.note)
    db.add(obj)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(
            status_code=409, title="MainLocation name already exists"
        ) from exc
    record(
        db,
        user_id=admin.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.MAIN_LOCATION,
        entity_id=obj.id,
        diff={"name": obj.name},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(obj)
    return MainLocationRead.model_validate(obj)


@router.patch("/{main_location_id}", response_model=MainLocationRead)
def update_main_location(
    main_location_id: int,
    payload: MainLocationUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> MainLocationRead:
    obj = db.get(MainLocation, main_location_id)
    if obj is None:
        raise ProblemError(status_code=404, title="MainLocation not found")
    diff: dict[str, object] = {}
    if payload.name is not None and payload.name != obj.name:
        diff["name"] = {"from": obj.name, "to": payload.name}
        obj.name = payload.name
    if payload.note is not None and payload.note != obj.note:
        diff["note"] = {"from": obj.note, "to": payload.note}
        obj.note = payload.note
    if diff:
        record(
            db,
            user_id=admin.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.MAIN_LOCATION,
            entity_id=obj.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(
            status_code=409, title="MainLocation name already exists"
        ) from exc
    db.refresh(obj)
    return MainLocationRead.model_validate(obj)


@router.delete("/{main_location_id}", status_code=204)
def delete_main_location(
    main_location_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    obj = db.get(MainLocation, main_location_id)
    if obj is None:
        raise ProblemError(status_code=404, title="MainLocation not found")
    record(
        db,
        user_id=admin.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.MAIN_LOCATION,
        entity_id=obj.id,
        diff={"name": obj.name},
        ip_address=client_ip(request),
    )
    db.delete(obj)
    db.commit()
