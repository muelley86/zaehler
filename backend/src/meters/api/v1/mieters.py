"""Mieter — zentraler Stammdatensatz fuer (optionale) Messstellen-Mieter.

Lesen darf jeder eingeloggte User (Filter/Auswahl-UI), Schreiben nur Admin.
Beim Loeschen werden ``mieter_assignment``-Eintraege via DB-Cascade ``SET
NULL`` entkoppelt — die historischen Mieter-Perioden bleiben erhalten,
zeigen aber in der UI „unbekannt".
"""

from __future__ import annotations

from fastapi import APIRouter, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from meters.api.deps import AdminUser, CurrentUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import AuditAction, AuditEntityType, Mieter
from meters.schemas import MieterCreate, MieterRead, MieterUpdate
from meters.services.audit import record

router = APIRouter(prefix="/mieters", tags=["mieters"])


@router.get("", response_model=list[MieterRead])
def list_mieters(db: DbDep, _user: CurrentUser) -> list[MieterRead]:
    rows = list(db.scalars(select(Mieter).order_by(Mieter.name)))
    return [MieterRead.model_validate(r) for r in rows]


@router.get("/{mieter_id}", response_model=MieterRead)
def get_mieter(mieter_id: int, db: DbDep, _user: CurrentUser) -> MieterRead:
    obj = db.get(Mieter, mieter_id)
    if obj is None:
        raise ProblemError(status_code=404, title="Mieter not found")
    return MieterRead.model_validate(obj)


@router.post("", response_model=MieterRead, status_code=status.HTTP_201_CREATED)
def create_mieter(
    payload: MieterCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> MieterRead:
    obj = Mieter(**payload.model_dump())
    db.add(obj)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Mieter name already exists") from exc
    record(
        db,
        user_id=admin.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.MIETER,
        entity_id=obj.id,
        diff={"name": obj.name},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(obj)
    return MieterRead.model_validate(obj)


@router.patch("/{mieter_id}", response_model=MieterRead)
def update_mieter(
    mieter_id: int,
    payload: MieterUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> MieterRead:
    obj = db.get(Mieter, mieter_id)
    if obj is None:
        raise ProblemError(status_code=404, title="Mieter not found")
    diff: dict[str, object] = {}
    for field_name in (
        "name",
        "address_street",
        "address_postcode",
        "address_city",
        "email",
        "phone",
        "note",
    ):
        new_value = getattr(payload, field_name)
        if new_value is not None and new_value != getattr(obj, field_name):
            diff[field_name] = {"from": getattr(obj, field_name), "to": new_value}
            setattr(obj, field_name, new_value)
    if diff:
        record(
            db,
            user_id=admin.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.MIETER,
            entity_id=obj.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Mieter name already exists") from exc
    db.refresh(obj)
    return MieterRead.model_validate(obj)


@router.delete("/{mieter_id}", status_code=204)
def delete_mieter(
    mieter_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    obj = db.get(Mieter, mieter_id)
    if obj is None:
        raise ProblemError(status_code=404, title="Mieter not found")
    record(
        db,
        user_id=admin.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.MIETER,
        entity_id=obj.id,
        diff={"name": obj.name},
        ip_address=client_ip(request),
    )
    db.delete(obj)
    db.commit()
