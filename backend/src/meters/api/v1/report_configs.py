"""Gespeicherte, geteilte Auswertungs-Konfigurationen (Stammdaten).

Lesen darf jeder eingeloggte User (Laden/Ausfuehren im Auswertungen-Bereich),
Schreiben nur Admin — analog Owners/Locations. Die eigentliche Aggregation
laeuft ueber ``/reports/aggregate``; hier werden nur die Parameter verwaltet.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from meters.api.deps import AdminUser, CurrentUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import AuditAction, AuditEntityType, ReportConfig
from meters.schemas import (
    ReportConfigCreate,
    ReportConfigRead,
    ReportConfigUpdate,
    ReportFilterModel,
)
from meters.schemas.report_config import validate_period
from meters.services.audit import record

router = APIRouter(prefix="/report-configs", tags=["report-configs"])


def _to_read(obj: ReportConfig) -> ReportConfigRead:
    return ReportConfigRead(
        id=obj.id,
        name=obj.name,
        dimension=obj.dimension,
        granularity=obj.granularity,
        period_kind=obj.period_kind,
        from_date=obj.from_date,
        to_date=obj.to_date,
        filters=ReportFilterModel.model_validate(obj.filters or {}),
        created_at=obj.created_at,
    )


@router.get("", response_model=list[ReportConfigRead])
def list_report_configs(db: DbDep, _user: CurrentUser) -> list[ReportConfigRead]:
    rows = list(db.scalars(select(ReportConfig).order_by(ReportConfig.name)))
    return [_to_read(r) for r in rows]


@router.get("/{config_id}", response_model=ReportConfigRead)
def get_report_config(config_id: int, db: DbDep, _user: CurrentUser) -> ReportConfigRead:
    obj = db.get(ReportConfig, config_id)
    if obj is None:
        raise ProblemError(status_code=404, title="Report config not found")
    return _to_read(obj)


@router.post("", response_model=ReportConfigRead, status_code=status.HTTP_201_CREATED)
def create_report_config(
    payload: ReportConfigCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> ReportConfigRead:
    obj = ReportConfig(
        name=payload.name,
        dimension=payload.dimension,
        granularity=payload.granularity,
        period_kind=payload.period_kind,
        from_date=payload.from_date,
        to_date=payload.to_date,
        filters=payload.filters.model_dump(),
    )
    db.add(obj)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Report config name already exists") from exc
    record(
        db,
        user_id=admin.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.REPORT_CONFIG,
        entity_id=obj.id,
        diff={"name": obj.name, "dimension": obj.dimension.value},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(obj)
    return _to_read(obj)


@router.patch("/{config_id}", response_model=ReportConfigRead)
def update_report_config(
    config_id: int,
    payload: ReportConfigUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> ReportConfigRead:
    obj = db.get(ReportConfig, config_id)
    if obj is None:
        raise ProblemError(status_code=404, title="Report config not found")

    fields_set = payload.model_fields_set
    diff: dict[str, object] = {}

    for field_name in ("name", "dimension", "granularity"):
        new_value = getattr(payload, field_name)
        if new_value is not None and new_value != getattr(obj, field_name):
            old = getattr(obj, field_name)
            diff[field_name] = {"from": str(old), "to": str(new_value)}
            setattr(obj, field_name, new_value)

    # Zeitraum wird als Einheit aktualisiert — nur wenn period_kind mitgesendet
    # wurde (sonst bleibt der Zeitraum unangetastet).
    if "period_kind" in fields_set and payload.period_kind is not None:
        validate_period(payload.period_kind, payload.from_date, payload.to_date)
        diff["period_kind"] = {"from": str(obj.period_kind), "to": str(payload.period_kind)}
        obj.period_kind = payload.period_kind
        obj.from_date = payload.from_date
        obj.to_date = payload.to_date

    if payload.filters is not None:
        obj.filters = payload.filters.model_dump()
        diff["filters"] = "updated"

    if diff:
        record(
            db,
            user_id=admin.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.REPORT_CONFIG,
            entity_id=obj.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Report config name already exists") from exc
    db.refresh(obj)
    return _to_read(obj)


@router.delete("/{config_id}", status_code=204)
def delete_report_config(
    config_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    obj = db.get(ReportConfig, config_id)
    if obj is None:
        raise ProblemError(status_code=404, title="Report config not found")
    record(
        db,
        user_id=admin.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.REPORT_CONFIG,
        entity_id=obj.id,
        diff={"name": obj.name},
        ip_address=client_ip(request),
    )
    db.delete(obj)
    db.commit()
