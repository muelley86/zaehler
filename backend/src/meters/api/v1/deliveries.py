"""Lieferungen (Heizöl-Befüllungen).

Eine Lieferung ist eine zugekaufte Füllmenge an einem nachfüllbaren Register
(``register.accepts_deliveries=True``, in der Praxis: oil.tank). Listen und
Erfassen darf jeder eingeloggte User; Bearbeiten/Löschen nur Admin.
"""

from __future__ import annotations

from datetime import date, datetime, time

from fastapi import APIRouter, Query, Request, status
from sqlalchemy import select

from meters.api.deps import AdminUser, CurrentUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    Delivery,
    PhysicalMeter,
    Register,
)
from meters.schemas import DeliveryCreate, DeliveryRead, DeliveryUpdate
from meters.services.audit import record

router = APIRouter(tags=["deliveries"])


def _to_read(d: Delivery) -> DeliveryRead:
    return DeliveryRead(
        id=d.id,
        register_id=d.register_id,
        delivery_at=d.delivery_at,
        amount=d.amount,
        note=d.note,
        created_at=d.created_at,
        created_by_user_id=d.created_by_user_id,
        created_by_username=d.created_by.username if d.created_by else None,
    )


@router.get("/registers/{register_id}/deliveries", response_model=list[DeliveryRead])
def list_deliveries(
    register_id: int,
    db: DbDep,
    _user: CurrentUser,
) -> list[DeliveryRead]:
    register = db.get(Register, register_id)
    if register is None:
        raise ProblemError(status_code=404, title="Register not found")
    rows = list(
        db.scalars(
            select(Delivery)
            .where(Delivery.register_id == register_id)
            .order_by(Delivery.delivery_at.desc(), Delivery.id.desc())
        )
    )
    return [_to_read(d) for d in rows]


@router.get("/deliveries", response_model=list[DeliveryRead])
def list_all_deliveries(
    db: DbDep,
    _user: CurrentUser,
    register_id: int | None = Query(None),
    measuring_point_id: int | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
) -> list[DeliveryRead]:
    stmt = select(Delivery).order_by(Delivery.delivery_at.desc(), Delivery.id.desc())
    if register_id is not None:
        stmt = stmt.where(Delivery.register_id == register_id)
    if measuring_point_id is not None:
        stmt = (
            stmt.join(Delivery.register)
            .join(Register.physical_meter)
            .where(PhysicalMeter.measuring_point_id == measuring_point_id)
        )
    if from_date is not None:
        stmt = stmt.where(Delivery.delivery_at >= datetime.combine(from_date, time.min))
    if to_date is not None:
        stmt = stmt.where(Delivery.delivery_at <= datetime.combine(to_date, time.max))
    stmt = stmt.limit(limit)
    rows = list(db.scalars(stmt))
    return [_to_read(d) for d in rows]


@router.post(
    "/registers/{register_id}/deliveries",
    response_model=DeliveryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_delivery(
    register_id: int,
    payload: DeliveryCreate,
    request: Request,
    db: DbDep,
    user: CurrentUser,
) -> DeliveryRead:
    register = db.get(Register, register_id)
    if register is None:
        raise ProblemError(status_code=404, title="Register not found")
    if not register.accepts_deliveries:
        raise ProblemError(
            status_code=400,
            title="Register does not accept deliveries",
            detail="Lieferungen können nur für nachfüllbare Register erfasst werden.",
        )
    delivery = Delivery(
        register_id=register.id,
        delivery_at=payload.delivery_at,
        amount=payload.amount,
        note=payload.note,
        created_by_user_id=user.id,
    )
    db.add(delivery)
    db.flush()
    record(
        db,
        user_id=user.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.DELIVERY,
        entity_id=delivery.id,
        diff={
            "register_id": register.id,
            "delivery_at": payload.delivery_at.isoformat(),
            "amount": format(payload.amount, "f"),
        },
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(delivery)
    return _to_read(delivery)


@router.patch("/deliveries/{delivery_id}", response_model=DeliveryRead)
def update_delivery(
    delivery_id: int,
    payload: DeliveryUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> DeliveryRead:
    delivery = db.get(Delivery, delivery_id)
    if delivery is None:
        raise ProblemError(status_code=404, title="Delivery not found")
    diff: dict[str, object] = {}
    if payload.delivery_at is not None and payload.delivery_at != delivery.delivery_at:
        diff["delivery_at"] = {
            "from": delivery.delivery_at.isoformat(),
            "to": payload.delivery_at.isoformat(),
        }
        delivery.delivery_at = payload.delivery_at
    if payload.amount is not None and payload.amount != delivery.amount:
        diff["amount"] = {
            "from": format(delivery.amount, "f"),
            "to": format(payload.amount, "f"),
        }
        delivery.amount = payload.amount
    if payload.note is not None and payload.note != delivery.note:
        diff["note"] = {"from": delivery.note, "to": payload.note}
        delivery.note = payload.note
    if diff:
        record(
            db,
            user_id=admin.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.DELIVERY,
            entity_id=delivery.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    db.commit()
    db.refresh(delivery)
    return _to_read(delivery)


@router.delete("/deliveries/{delivery_id}", status_code=204)
def delete_delivery(
    delivery_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    delivery = db.get(Delivery, delivery_id)
    if delivery is None:
        raise ProblemError(status_code=404, title="Delivery not found")
    record(
        db,
        user_id=admin.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.DELIVERY,
        entity_id=delivery.id,
        diff={
            "register_id": delivery.register_id,
            "delivery_at": delivery.delivery_at.isoformat(),
            "amount": format(delivery.amount, "f"),
        },
        ip_address=client_ip(request),
    )
    db.delete(delivery)
    db.commit()
