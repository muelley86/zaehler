"""Abrechnungskreise und -positionen des Abrechnungsmoduls (Admin oder ``can_billing``)."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from meters.api.deps import AdminUser, BillingUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    BillingCircle,
    BillingInvoice,
    BillingPosition,
    BillingPositionKind,
)
from meters.schemas.billing_circle import (
    BillingCheckRead,
    BillingCircleCreate,
    BillingCircleRead,
    BillingCircleUpdate,
    BillingPositionCreate,
    BillingPositionOrder,
    BillingPositionRead,
    BillingPositionUpdate,
    UnassignedMeterRead,
)
from meters.schemas.billing_history import BillingHistory
from meters.schemas.billing_import import ImportReport, StammdatenImport
from meters.schemas.billing_overview import BillingMonthOverview
from meters.schemas.billing_readings import BillingReadingsRead
from meters.services.audit import record
from meters.services.billing_circle import (
    FELDER,
    Empfaenger,
    PositionData,
    check_circle,
    next_sort_order,
    positions_at,
    recipients_at,
    reorder_positions,
    unassigned_meters,
    validate_position,
)
from meters.services.billing_history import history
from meters.services.billing_import import run_import
from meters.services.billing_overview import overview
from meters.services.billing_readings import readings_for_month

router = APIRouter(prefix="/billing-circles", tags=["billing"])

_PFLICHT_KREIS = ("code", "name", "rechnungsleger", "abnahmestelle")
_PFLICHT_POSITION = ("label", "kind", "sort_order", "valid_from")


def _json(value: object) -> object:
    return value.isoformat() if isinstance(value, date) else value


def _circle(db: DbDep, circle_id: int) -> BillingCircle:
    circle = db.get(BillingCircle, circle_id)
    if circle is None:
        raise ProblemError(status_code=404, title="Billing circle not found")
    return circle


def _position(db: DbDep, circle_id: int, position_id: int) -> BillingPosition:
    position = db.get(BillingPosition, position_id)
    if position is None or position.circle_id != circle_id:
        raise ProblemError(status_code=404, title="Billing position not found")
    return position


def _position_read(p: BillingPosition, recipient: Empfaenger | None = None) -> BillingPositionRead:
    data = BillingPositionRead.model_validate(p)
    data.measuring_point_name = p.measuring_point.name if p.measuring_point else None
    data.owner_name = p.owner.name if p.owner else None
    data.recipient_name = recipient.name if recipient else None
    data.recipient_kind = recipient.kind if recipient else None
    data.recipient_internal = bool(recipient and recipient.internal_allocation)
    return data


def _positions_read(db: DbDep, positions: list[BillingPosition]) -> list[BillingPositionRead]:
    """Positionen samt heutigem Empfaenger (Gruppierung in der Positionsliste)."""
    empfaenger = recipients_at(db, positions, date.today())
    return [_position_read(p, empfaenger.get(p.id)) for p in positions]


def _commit_code(db: DbDep) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Billing circle code already exists") from exc


def _commit_delete(db: DbDep, detail: str) -> None:
    """RESTRICT-FK (paralleler Request legt gerade eine Referenz an) -> 409 statt 500."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Still referenced", detail=detail) from exc


@router.get("", response_model=list[BillingCircleRead])
def list_circles(db: DbDep, _user: BillingUser) -> list[BillingCircleRead]:
    rows = db.scalars(select(BillingCircle).order_by(BillingCircle.code))
    return [BillingCircleRead.model_validate(c) for c in rows]


@router.post("", response_model=BillingCircleRead, status_code=status.HTTP_201_CREATED)
def create_circle(
    payload: BillingCircleCreate, request: Request, db: DbDep, user: BillingUser
) -> BillingCircleRead:
    circle = BillingCircle(**payload.model_dump())
    db.add(circle)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(status_code=409, title="Billing circle code already exists") from exc
    record(
        db,
        user_id=user.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.BILLING_CIRCLE,
        entity_id=circle.id,
        diff=payload.model_dump(),
        ip_address=client_ip(request),
    )
    _commit_code(db)
    return BillingCircleRead.model_validate(circle)


_MAX_IMPORT_BYTES = 1_000_000


async def _import_payload(request: Request) -> StammdatenImport:
    """Body begrenzt einlesen (wie die uebrigen Uploads) und erst dann validieren."""
    laenge = request.headers.get("content-length", "")
    if laenge.isdigit() and int(laenge) > _MAX_IMPORT_BYTES:
        raise ProblemError(status_code=413, title="Datei zu groß", detail="Maximal 1 MB.")
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > _MAX_IMPORT_BYTES:
            raise ProblemError(status_code=413, title="Datei zu groß", detail="Maximal 1 MB.")
    try:
        return StammdatenImport.model_validate_json(bytes(body))
    except ValidationError as exc:
        raise RequestValidationError(exc.errors(include_url=False)) from exc


@router.post("/import", response_model=ImportReport)
def import_stammdaten(
    payload: Annotated[StammdatenImport, Depends(_import_payload)],
    request: Request,
    db: DbDep,
    user: AdminUser,
    apply: bool = False,
) -> ImportReport:
    """Stammdaten-Import (Datei aus ``stromabrechnung.export_app``) - **nur Admin**.

    ``apply=false`` (Vorschau) fuehrt den Import vollstaendig aus und rollt zurueck - die Vorschau
    zeigt damit exakt, was ``apply=true`` schreibt.

    Bewusst strenger als der Rest des Moduls: der Import legt Eigentuemer- und
    Kostenstellen-Zuordnungen beliebiger Messstellen an und kann ``internal_allocation`` setzen.
    Das ist Stammdatenpflege, nicht Abrechnung - das Merkmal ``can_billing`` oeffnet sie nicht."""
    entries = run_import(db, payload, user_id=user.id, ip_address=client_ip(request))
    counts = {
        level: sum(1 for e in entries if e.level == level)
        for level in ("aktion", "hinweis", "fehler")
    }
    if apply:
        record(
            db,
            user_id=user.id,
            action=AuditAction.BILLING_IMPORT,
            entity_type=AuditEntityType.SYSTEM,
            entity_id=None,
            diff={
                "valid_from": payload.valid_from.isoformat(),
                "kreise": [c.code for c in payload.circles],
                "counts": counts,
            },
            ip_address=client_ip(request),
        )
        db.commit()
    else:
        db.rollback()
    return ImportReport(
        applied=apply, valid_from=payload.valid_from, entries=entries, counts=counts
    )


@router.get("/unassigned-meters", response_model=list[UnassignedMeterRead])
def unassigned(
    db: DbDep,
    _user: BillingUser,
    stichtag: date | None = None,
) -> list[UnassignedMeterRead]:
    """Strom-Messstellen, die zum Stichtag (Standard heute) in keinem Kreis abgerechnet werden."""
    return unassigned_meters(db, stichtag or date.today())


_MONAT = r"^(19|20)\d{2}-(0[1-9]|1[0-2])$"


@router.get("/overview", response_model=BillingMonthOverview)
def month_overview(
    db: DbDep,
    _user: BillingUser,
    von: Annotated[str | None, Query(pattern=_MONAT)] = None,
    bis: Annotated[str | None, Query(pattern=_MONAT)] = None,
) -> BillingMonthOverview:
    """Status je Kreis und Monat (Standard: die letzten zwoelf Monate)."""
    return overview(db, von, bis)


@router.get("/{circle_id}/verlauf", response_model=BillingHistory)
def verlauf(
    circle_id: int,
    db: DbDep,
    _user: BillingUser,
    von: Annotated[str | None, Query(pattern=_MONAT)] = None,
    bis: Annotated[str | None, Query(pattern=_MONAT)] = None,
) -> BillingHistory:
    """Verbrauchsverlauf der festgeschriebenen Monate je Empfaenger und Position."""
    _circle(db, circle_id)
    return history(db, circle_id, von, bis)


@router.get("/{circle_id}", response_model=BillingCircleRead)
def get_circle(circle_id: int, db: DbDep, _user: BillingUser) -> BillingCircleRead:
    return BillingCircleRead.model_validate(_circle(db, circle_id))


@router.patch("/{circle_id}", response_model=BillingCircleRead)
def update_circle(
    circle_id: int,
    payload: BillingCircleUpdate,
    request: Request,
    db: DbDep,
    user: BillingUser,
) -> BillingCircleRead:
    circle = _circle(db, circle_id)
    diff: dict[str, object] = {}
    for name in sorted(payload.model_fields_set):
        neu = getattr(payload, name)
        if neu is None and name in _PFLICHT_KREIS:
            raise ProblemError(
                status_code=422, title="Invalid field", detail=f"{name} ist Pflicht."
            )
        if neu != getattr(circle, name):
            diff[name] = {"from": getattr(circle, name), "to": neu}
            setattr(circle, name, neu)
    if diff:
        record(
            db,
            user_id=user.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.BILLING_CIRCLE,
            entity_id=circle.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    _commit_code(db)
    return BillingCircleRead.model_validate(circle)


@router.delete("/{circle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_circle(circle_id: int, request: Request, db: DbDep, user: BillingUser) -> None:
    circle = _circle(db, circle_id)
    anzahl = db.scalar(
        select(func.count(BillingPosition.id)).where(BillingPosition.circle_id == circle_id)
    )
    if anzahl:
        raise ProblemError(
            status_code=409,
            title="Billing circle has positions",
            detail=f"Der Kreis hat noch {anzahl} Positionen.",
        )
    rechnungen = db.scalar(
        select(func.count(BillingInvoice.id)).where(BillingInvoice.circle_id == circle_id)
    )
    if rechnungen:
        raise ProblemError(
            status_code=409,
            title="Billing circle has invoices",
            detail=f"Der Kreis hat noch {rechnungen} Rechnungen.",
        )
    record(
        db,
        user_id=user.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.BILLING_CIRCLE,
        entity_id=circle.id,
        diff={"code": circle.code},
        ip_address=client_ip(request),
    )
    db.delete(circle)
    _commit_delete(db, "Der Kreis wird noch verwendet.")


@router.get("/{circle_id}/positions", response_model=list[BillingPositionRead])
def list_positions(
    circle_id: int, db: DbDep, _user: BillingUser, stichtag: date | None = None
) -> list[BillingPositionRead]:
    _circle(db, circle_id)
    return _positions_read(db, positions_at(db, circle_id, stichtag))


@router.put("/{circle_id}/positions/order", response_model=list[BillingPositionRead])
def reorder(
    circle_id: int,
    payload: BillingPositionOrder,
    request: Request,
    db: DbDep,
    user: BillingUser,
) -> list[BillingPositionRead]:
    """Reihenfolge aller Positionen setzen (Drag & Drop in der Positionsliste)."""
    circle = _circle(db, circle_id)
    vorher = [p.label for p in positions_at(db, circle.id, None)]
    positionen = reorder_positions(db, circle, payload.position_ids)
    nachher = [p.label for p in positionen]
    if nachher != vorher:
        record(
            db,
            user_id=user.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.BILLING_CIRCLE,
            entity_id=circle.id,
            diff={"reihenfolge": {"from": vorher, "to": nachher}},
            ip_address=client_ip(request),
        )
    db.commit()
    return _positions_read(db, positionen)


@router.post(
    "/{circle_id}/positions",
    response_model=BillingPositionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_position(
    circle_id: int,
    payload: BillingPositionCreate,
    request: Request,
    db: DbDep,
    user: BillingUser,
) -> BillingPositionRead:
    circle = _circle(db, circle_id)
    felder = payload.model_dump()
    if felder["sort_order"] is None:
        felder["sort_order"] = next_sort_order(db, circle.id)
    validate_position(db, circle, PositionData(**felder), None)
    position = BillingPosition(circle_id=circle.id, **felder)
    db.add(position)
    db.flush()
    record(
        db,
        user_id=user.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.BILLING_POSITION,
        entity_id=position.id,
        diff={k: _json(v) for k, v in felder.items()} | {"circle_id": circle.id},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(position)
    return _positions_read(db, [position])[0]


@router.patch("/{circle_id}/positions/{position_id}", response_model=BillingPositionRead)
def update_position(
    circle_id: int,
    position_id: int,
    payload: BillingPositionUpdate,
    request: Request,
    db: DbDep,
    user: BillingUser,
) -> BillingPositionRead:
    circle = _circle(db, circle_id)
    position = _position(db, circle_id, position_id)
    ziel = {name: getattr(position, name) for name in FELDER}
    # Artwechsel: nicht mitgesendete, unpassende Felder leeren (sonst 422 ohne Hinweis).
    if "kind" in payload.model_fields_set and payload.kind is not position.kind:
        unpassend = (
            ("measuring_point_id", "parent_position_id")
            if payload.kind is BillingPositionKind.REST
            else ("owner_id", "kostenstelle")
        )
        for name in unpassend:
            if name not in payload.model_fields_set:
                ziel[name] = None
    for name in payload.model_fields_set:
        neu = getattr(payload, name)
        if neu is None and name in _PFLICHT_POSITION:
            raise ProblemError(
                status_code=422, title="Invalid field", detail=f"{name} ist Pflicht."
            )
        ziel[name] = neu
    validate_position(db, circle, PositionData(**ziel), position.id)
    diff = {
        name: {"from": _json(getattr(position, name)), "to": _json(wert)}
        for name, wert in ziel.items()
        if wert != getattr(position, name)
    }
    for name, wert in ziel.items():
        setattr(position, name, wert)
    if diff:
        record(
            db,
            user_id=user.id,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.BILLING_POSITION,
            entity_id=position.id,
            diff=diff,
            ip_address=client_ip(request),
        )
    db.commit()
    db.refresh(position)
    return _positions_read(db, [position])[0]


@router.delete("/{circle_id}/positions/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_position(
    circle_id: int, position_id: int, request: Request, db: DbDep, user: BillingUser
) -> None:
    position = _position(db, circle_id, position_id)
    unter = db.scalar(
        select(func.count(BillingPosition.id)).where(
            BillingPosition.parent_position_id == position_id
        )
    )
    if unter:
        raise ProblemError(
            status_code=409,
            title="Billing position has sub-meters",
            detail="Die Position ist Hauptzaehler anderer Positionen - erst diese aendern.",
        )
    record(
        db,
        user_id=user.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.BILLING_POSITION,
        entity_id=position.id,
        diff={"label": position.label, "circle_id": circle_id},
        ip_address=client_ip(request),
    )
    db.delete(position)
    _commit_delete(db, "Die Position wird noch als Hauptzaehler verwendet.")


@router.get("/{circle_id}/check", response_model=BillingCheckRead)
def check(circle_id: int, stichtag: date, db: DbDep, _user: BillingUser) -> BillingCheckRead:
    """Pruefbericht zum Stichtag (in der Regel Monatsende)."""
    return check_circle(db, _circle(db, circle_id), stichtag)


@router.get("/{circle_id}/readings", response_model=BillingReadingsRead)
def month_end_readings(
    circle_id: int,
    db: DbDep,
    _user: BillingUser,
    monat: Annotated[str, Query(pattern=r"^(19|20)\d{2}-(0[1-9]|1[0-2])$")],
) -> BillingReadingsRead:
    """Zaehlerstaende zum Monatsende (Stand alt/neu, interpoliert gekennzeichnet) je Position."""
    return readings_for_month(db, _circle(db, circle_id), monat)
