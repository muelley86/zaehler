"""Service fuer das periodisierte "Abrechnen an" (Muster ``kostenstelle_assignment``).

Hoechstens eine offene Periode (``valid_to IS NULL``) je MP. ``assign_bill_to`` ist der
Wechsel (offene Periode schliessen, neue oeffnen); der Historien-Editor
(``create/update/delete_assignment``) erlaubt Rueckdatierung und Luecken, verhindert aber
Ueberlappungen. Ohne Periode gilt ``BillTo.OWNER``. Die Abrechnung liest mit ``bill_to_am``
den Wert zum Stichtag.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    BillTo,
    BillToAssignment,
    MeasuringPoint,
)
from meters.services.assignment_guard import open_period_guard
from meters.services.audit import record

_KIND = "Abrechnen-an"


def current_assignment(db: Session, mp_id: int) -> BillToAssignment | None:
    return db.scalar(
        select(BillToAssignment).where(
            BillToAssignment.measuring_point_id == mp_id,
            BillToAssignment.valid_to.is_(None),
        )
    )


def list_history(db: Session, mp_id: int) -> list[BillToAssignment]:
    return list(
        db.scalars(
            select(BillToAssignment)
            .where(BillToAssignment.measuring_point_id == mp_id)
            .order_by(BillToAssignment.valid_from.desc())
        )
    )


def bill_to_am(db: Session, mp_ids: Iterable[int], stichtag: date) -> dict[int, BillTo]:
    """Abrechnen-an je MP zum Stichtag (``valid_from <= stichtag < valid_to``).

    MPs ohne gueltige Periode fehlen im Ergebnis (= Eigentuemer). Eine Query fuer alle MPs."""
    ids = list(mp_ids)
    if not ids:
        return {}
    rows = db.execute(
        select(BillToAssignment.measuring_point_id, BillToAssignment.bill_to).where(
            BillToAssignment.measuring_point_id.in_(ids),
            BillToAssignment.valid_from <= stichtag,
            or_(BillToAssignment.valid_to.is_(None), BillToAssignment.valid_to > stichtag),
        )
    )
    return {mp_id: wert for mp_id, wert in rows}


def _get_mp(db: Session, mp_id: int) -> MeasuringPoint:
    mp = db.get(MeasuringPoint, mp_id)
    if mp is None:
        raise ProblemError(status_code=404, title="Measuring point not found")
    return mp


def assign_bill_to(
    db: Session,
    *,
    mp_id: int,
    bill_to: BillTo,
    valid_from: date,
    user_id: int,
    ip_address: str | None,
) -> BillToAssignment:
    """Wechsel: offene Periode mit ``valid_to = valid_from`` schliessen, neue oeffnen.

    Beginnt die offene Periode am selben Tag, wird ihr Wert korrigiert statt eine
    leere Periode ``[d, d)`` zu hinterlassen."""
    _get_mp(db, mp_id)
    offen = current_assignment(db, mp_id)
    if offen is not None and valid_from < offen.valid_from:
        raise ProblemError(
            status_code=422,
            title="valid_from before current period",
            detail=(
                "valid_from darf nicht vor dem Beginn der aktuellen Periode "
                f"({offen.valid_from.isoformat()}) liegen."
            ),
        )
    alt = offen.bill_to if offen is not None else None
    if offen is not None and valid_from == offen.valid_from:
        offen.bill_to = bill_to
        neu = offen
    else:
        # Ohne offene Periode kann eine spaetere geschlossene Periode im Weg liegen.
        _pruefe_ueberlappung(
            db,
            mp_id=mp_id,
            valid_from=valid_from,
            valid_to=None,
            exclude_id=offen.id if offen is not None else None,
        )
        if offen is not None:
            offen.valid_to = valid_from
        neu = BillToAssignment(measuring_point_id=mp_id, bill_to=bill_to, valid_from=valid_from)
        db.add(neu)
    record(
        db,
        user_id=user_id,
        action=AuditAction.BILL_TO_CHANGED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff={
            "from": alt.value if alt is not None else None,
            "to": bill_to.value,
            "valid_from": valid_from.isoformat(),
        },
        ip_address=ip_address,
    )
    with open_period_guard(db, kind=_KIND):
        db.flush()
    return neu


# ---------------------------------------------------------------------------
# Historien-Editor (admin-only): Perioden anlegen, korrigieren, loeschen.
# Erlaubt Rueckdatierung und Luecken; einzige Invariante: keine Ueberlappung
# (halboffene Intervalle, offene Periode = [valid_from, unendlich)).
# ---------------------------------------------------------------------------


def _serialize(a: BillToAssignment) -> dict[str, object]:
    return {
        "bill_to": a.bill_to.value,
        "valid_from": a.valid_from.isoformat(),
        "valid_to": a.valid_to.isoformat() if a.valid_to is not None else None,
    }


def _get_assignment(db: Session, mp_id: int, assignment_id: int) -> BillToAssignment:
    assignment = db.get(BillToAssignment, assignment_id)
    if assignment is None or assignment.measuring_point_id != mp_id:
        raise ProblemError(status_code=404, title="Bill-to assignment not found")
    return assignment


def _pruefe_ueberlappung(
    db: Session,
    *,
    mp_id: int,
    valid_from: date,
    valid_to: date | None,
    exclude_id: int | None,
) -> None:
    if valid_to is not None and valid_to <= valid_from:
        raise ProblemError(
            status_code=422,
            title="Invalid period",
            detail="valid_to muss nach valid_from liegen.",
        )
    stmt = select(BillToAssignment).where(
        BillToAssignment.measuring_point_id == mp_id,
        or_(BillToAssignment.valid_to.is_(None), BillToAssignment.valid_to > valid_from),
    )
    if valid_to is not None:
        stmt = stmt.where(BillToAssignment.valid_from < valid_to)
    if exclude_id is not None:
        stmt = stmt.where(BillToAssignment.id != exclude_id)
    konflikt = db.scalars(stmt.order_by(BillToAssignment.valid_from)).first()
    if konflikt is not None:
        bis = konflikt.valid_to.isoformat() if konflikt.valid_to is not None else "offen"
        raise ProblemError(
            status_code=422,
            title="Period overlaps existing assignment",
            detail=(
                "Die Periode ueberschneidet sich mit einer bestehenden Periode "
                f"(ab {konflikt.valid_from.isoformat()}, bis {bis})."
            ),
        )


def create_assignment(
    db: Session,
    *,
    mp_id: int,
    bill_to: BillTo,
    valid_from: date,
    valid_to: date | None,
    user_id: int,
    ip_address: str | None,
) -> BillToAssignment:
    _get_mp(db, mp_id)
    _pruefe_ueberlappung(db, mp_id=mp_id, valid_from=valid_from, valid_to=valid_to, exclude_id=None)
    assignment = BillToAssignment(
        measuring_point_id=mp_id, bill_to=bill_to, valid_from=valid_from, valid_to=valid_to
    )
    db.add(assignment)
    with open_period_guard(db, kind=_KIND):
        db.flush()
    record(
        db,
        user_id=user_id,
        action=AuditAction.BILL_TO_ASSIGNMENT_CREATED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff=_serialize(assignment),
        ip_address=ip_address,
    )
    return assignment


def update_assignment(
    db: Session,
    *,
    mp_id: int,
    assignment_id: int,
    bill_to: BillTo,
    valid_from: date,
    valid_to: date | None,
    user_id: int,
    ip_address: str | None,
) -> BillToAssignment:
    assignment = _get_assignment(db, mp_id, assignment_id)
    vorher = _serialize(assignment)
    _pruefe_ueberlappung(
        db, mp_id=mp_id, valid_from=valid_from, valid_to=valid_to, exclude_id=assignment_id
    )
    assignment.bill_to = bill_to
    assignment.valid_from = valid_from
    assignment.valid_to = valid_to
    with open_period_guard(db, kind=_KIND):
        db.flush()
    record(
        db,
        user_id=user_id,
        action=AuditAction.BILL_TO_ASSIGNMENT_UPDATED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff={"before": vorher, "after": _serialize(assignment)},
        ip_address=ip_address,
    )
    return assignment


def delete_assignment(
    db: Session,
    *,
    mp_id: int,
    assignment_id: int,
    user_id: int,
    ip_address: str | None,
) -> None:
    assignment = _get_assignment(db, mp_id, assignment_id)
    vorher = _serialize(assignment)
    db.delete(assignment)
    record(
        db,
        user_id=user_id,
        action=AuditAction.BILL_TO_ASSIGNMENT_DELETED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff={"before": vorher},
        ip_address=ip_address,
    )
    db.flush()
