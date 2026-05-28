"""Eigentuemer — zentraler Stammdatensatz fuer Messstellen-Eigentuemer.

Lesen darf jeder eingeloggte User (Filter/Auswahl-UI), Schreiben nur Admin.
Beim Loeschen werden ``owner_assignment``-Eintraege via DB-Cascade ``SET
NULL`` entkoppelt — die historischen Eigentuemer-Perioden bleiben erhalten,
zeigen aber in der UI „unbekannt".
"""

from __future__ import annotations

from fastapi import APIRouter, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from meters.api.deps import AdminUser, CurrentUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import AuditAction, AuditEntityType, Owner
from meters.schemas import OwnerCreate, OwnerRead, OwnerUpdate
from meters.services.audit import record

router = APIRouter(prefix="/owners", tags=["owners"])


@router.get("", response_model=list[OwnerRead])
def list_owners(db: DbDep, _user: CurrentUser) -> list[OwnerRead]:
    rows = list(db.scalars(select(Owner).order_by(Owner.name)))
    return [OwnerRead.model_validate(r) for r in rows]


@router.get("/{owner_id}", response_model=OwnerRead)
def get_owner(owner_id: int, db: DbDep, _user: CurrentUser) -> OwnerRead:
    obj = db.get(Owner, owner_id)
    if obj is None:
        raise ProblemError(status_code=404, title="Owner not found")
    return OwnerRead.model_validate(obj)


@router.post("", response_model=OwnerRead, status_code=status.HTTP_201_CREATED)
def create_owner(
    payload: OwnerCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> OwnerRead:
    obj = Owner(**payload.model_dump())
    db.add(obj)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Owner name already exists") from exc
    record(
        db,
        user_id=admin.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.OWNER,
        entity_id=obj.id,
        diff={"name": obj.name},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(obj)
    return OwnerRead.model_validate(obj)


@router.patch("/{owner_id}", response_model=OwnerRead)
def update_owner(
    owner_id: int,
    payload: OwnerUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> OwnerRead:
    obj = db.get(Owner, owner_id)
    if obj is None:
        raise ProblemError(status_code=404, title="Owner not found")
    diff: dict[str, object] = {}
    for field_name in (
        "name",
        "address_street",
        "address_postcode",
        "address_city",
        "email",
        "phone",
        "vat_id",
        "tax_id",
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
            entity_type=AuditEntityType.OWNER,
            entity_id=obj.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Owner name already exists") from exc
    db.refresh(obj)
    return OwnerRead.model_validate(obj)


@router.delete("/{owner_id}", status_code=204)
def delete_owner(
    owner_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    obj = db.get(Owner, owner_id)
    if obj is None:
        raise ProblemError(status_code=404, title="Owner not found")
    record(
        db,
        user_id=admin.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.OWNER,
        entity_id=obj.id,
        diff={"name": obj.name},
        ip_address=client_ip(request),
    )
    db.delete(obj)
    db.commit()
