"""Lieferanten — zentraler Stammdatensatz fuer Energie-Verkaeufer.

Lesen darf jeder eingeloggte User (Filter/Auswahl-UI), Schreiben nur Admin.
Beim Loeschen werden ``supplier_assignment``-Eintraege via DB-Cascade ``SET
NULL`` entkoppelt — die historischen Lieferanten-Perioden bleiben erhalten,
zeigen aber in der UI „unbekannt".
"""

from __future__ import annotations

from fastapi import APIRouter, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from meters.api.deps import AdminUser, CurrentUser, DbDep, client_ip
from meters.api.v1.measuring_points import measuring_points_with_state
from meters.core.problem import ProblemError
from meters.models import AuditAction, AuditEntityType, Supplier
from meters.schemas import (
    MeasuringPointWithStateRead,
    SupplierCreate,
    SupplierRead,
    SupplierUpdate,
)
from meters.services.audit import record
from meters.services.supplier_assignment import select_measuring_points_for_supplier

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("", response_model=list[SupplierRead])
def list_suppliers(db: DbDep, _user: CurrentUser) -> list[SupplierRead]:
    rows = list(db.scalars(select(Supplier).order_by(Supplier.name)))
    return [SupplierRead.model_validate(r) for r in rows]


@router.get("/{supplier_id}", response_model=SupplierRead)
def get_supplier(supplier_id: int, db: DbDep, _user: CurrentUser) -> SupplierRead:
    obj = db.get(Supplier, supplier_id)
    if obj is None:
        raise ProblemError(status_code=404, title="Supplier not found")
    return SupplierRead.model_validate(obj)


@router.get("/{supplier_id}/measuring-points", response_model=list[MeasuringPointWithStateRead])
def list_supplier_measuring_points(
    supplier_id: int, db: DbDep, user: CurrentUser
) -> list[MeasuringPointWithStateRead]:
    """Aktuell diesem Lieferanten zugeordnete Messstellen, mit aktuellem Stand.

    Quelle der Lieferanten-Detailseite. Nur offene Zuordnungen; Recorder sehen
    via ``restrict_mp_query`` nur ihre zugaenglichen MPs.
    """
    if db.get(Supplier, supplier_id) is None:
        raise ProblemError(status_code=404, title="Supplier not found")
    return measuring_points_with_state(db, select_measuring_points_for_supplier(supplier_id), user)


@router.post("", response_model=SupplierRead, status_code=status.HTTP_201_CREATED)
def create_supplier(
    payload: SupplierCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> SupplierRead:
    obj = Supplier(**payload.model_dump())
    db.add(obj)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Supplier name already exists") from exc
    record(
        db,
        user_id=admin.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.SUPPLIER,
        entity_id=obj.id,
        diff={"name": obj.name},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(obj)
    return SupplierRead.model_validate(obj)


@router.patch("/{supplier_id}", response_model=SupplierRead)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> SupplierRead:
    obj = db.get(Supplier, supplier_id)
    if obj is None:
        raise ProblemError(status_code=404, title="Supplier not found")
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
            entity_type=AuditEntityType.SUPPLIER,
            entity_id=obj.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Supplier name already exists") from exc
    db.refresh(obj)
    return SupplierRead.model_validate(obj)


@router.delete("/{supplier_id}", status_code=204)
def delete_supplier(
    supplier_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    obj = db.get(Supplier, supplier_id)
    if obj is None:
        raise ProblemError(status_code=404, title="Supplier not found")
    record(
        db,
        user_id=admin.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.SUPPLIER,
        entity_id=obj.id,
        diff={"name": obj.name},
        ip_address=client_ip(request),
    )
    db.delete(obj)
    db.commit()
