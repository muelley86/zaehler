"""Standorte (Locations) — zentrale Liste, an die Messstellen referenzieren.

Lesen darf jeder eingeloggte User (für die Filter-/Auswahl-UI), Schreiben
nur Admin. Beim Löschen eines Standorts werden referenzierende
MeasuringPoints durch ``ON DELETE SET NULL`` automatisch entkoppelt — die
Messstelle bleibt erhalten, hat danach nur keinen Standort mehr.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from meters.api.deps import AdminUser, CurrentUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import AuditAction, AuditEntityType, Location
from meters.schemas import LocationCreate, LocationRead, LocationUpdate
from meters.services.audit import record

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("", response_model=list[LocationRead])
def list_locations(db: DbDep, _user: CurrentUser) -> list[LocationRead]:
    rows = list(db.scalars(select(Location).order_by(Location.name)))
    return [LocationRead.model_validate(r) for r in rows]


@router.get("/{location_id}", response_model=LocationRead)
def get_location(location_id: int, db: DbDep, _user: CurrentUser) -> LocationRead:
    loc = db.get(Location, location_id)
    if loc is None:
        raise ProblemError(status_code=404, title="Location not found")
    return LocationRead.model_validate(loc)


@router.post("", response_model=LocationRead, status_code=status.HTTP_201_CREATED)
def create_location(
    payload: LocationCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> LocationRead:
    location = Location(
        name=payload.name,
        note=payload.note,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    db.add(location)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Location name already exists") from exc
    record(
        db,
        user_id=admin.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.LOCATION,
        entity_id=location.id,
        diff={"name": location.name},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(location)
    return LocationRead.model_validate(location)


@router.patch("/{location_id}", response_model=LocationRead)
def update_location(
    location_id: int,
    payload: LocationUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> LocationRead:
    location = db.get(Location, location_id)
    if location is None:
        raise ProblemError(status_code=404, title="Location not found")
    diff: dict[str, object] = {}
    if payload.name is not None and payload.name != location.name:
        diff["name"] = {"from": location.name, "to": payload.name}
        location.name = payload.name
    if payload.note is not None and payload.note != location.note:
        diff["note"] = {"from": location.note, "to": payload.note}
        location.note = payload.note
    if payload.clear_coordinates:
        if location.latitude is not None or location.longitude is not None:
            diff["coordinates"] = {
                "from": [location.latitude, location.longitude],
                "to": None,
            }
        location.latitude = None
        location.longitude = None
    else:
        if payload.latitude is not None and payload.latitude != location.latitude:
            diff["latitude"] = {"from": location.latitude, "to": payload.latitude}
            location.latitude = payload.latitude
        if payload.longitude is not None and payload.longitude != location.longitude:
            diff["longitude"] = {"from": location.longitude, "to": payload.longitude}
            location.longitude = payload.longitude
    if diff:
        record(
            db,
            user_id=admin.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.LOCATION,
            entity_id=location.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Location name already exists") from exc
    db.refresh(location)
    return LocationRead.model_validate(location)


@router.delete("/{location_id}", status_code=204)
def delete_location(
    location_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    location = db.get(Location, location_id)
    if location is None:
        raise ProblemError(status_code=404, title="Location not found")
    record(
        db,
        user_id=admin.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.LOCATION,
        entity_id=location.id,
        diff={"name": location.name},
        ip_address=client_ip(request),
    )
    db.delete(location)
    db.commit()
