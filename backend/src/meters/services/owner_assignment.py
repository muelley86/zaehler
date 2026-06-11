"""Service-Helfer fuer das Owner-Assignment-Periodisierungsmodell.

Genau ein offenes Assignment (``valid_to IS NULL``) pro MP gilt als
aktueller Eigentuemer. ``assign_owner`` ist die einzige offizielle Stelle,
die Perioden veraendert — sie schliesst die offene und legt eine neue an,
sodass keine Ueberlapps entstehen.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from meters.core.problem import ProblemError
from meters.models import AuditAction, AuditEntityType, MeasuringPoint, Owner, OwnerAssignment
from meters.services.audit import record


def current_assignment(db: Session, mp_id: int) -> OwnerAssignment | None:
    return db.scalar(
        select(OwnerAssignment)
        .where(
            OwnerAssignment.measuring_point_id == mp_id,
            OwnerAssignment.valid_to.is_(None),
        )
        .order_by(OwnerAssignment.valid_from.desc())
    )


def current_assignments_bulk(db: Session, mp_ids: Iterable[int]) -> dict[int, OwnerAssignment]:
    """Liefert die aktuell offenen Zuordnungen fuer mehrere Messstellen in
    einer einzigen Query. Verhindert N+1 in Listing-Endpoints.
    """
    ids = list(mp_ids)
    if not ids:
        return {}
    rows = db.scalars(
        select(OwnerAssignment)
        .where(
            OwnerAssignment.measuring_point_id.in_(ids),
            OwnerAssignment.valid_to.is_(None),
        )
        .options(selectinload(OwnerAssignment.owner))
    )
    return {a.measuring_point_id: a for a in rows}


def list_history(db: Session, mp_id: int) -> list[OwnerAssignment]:
    return list(
        db.scalars(
            select(OwnerAssignment)
            .where(OwnerAssignment.measuring_point_id == mp_id)
            .order_by(OwnerAssignment.valid_from.desc())
        )
    )


def assign_owner(
    db: Session,
    *,
    mp_id: int,
    owner_id: int,
    valid_from: date,
    user_id: int,
    ip_address: str | None,
) -> OwnerAssignment:
    """Schliesst die aktuelle offene Periode (``valid_to = valid_from``) und
    legt eine neue offene fuer den neuen Eigentuemer an. Schreibt AuditLog
    (action=OWNER_CHANGED, entity_type=MEASURING_POINT).
    """
    mp = db.get(MeasuringPoint, mp_id)
    if mp is None:
        raise ProblemError(status_code=404, title="Measuring point not found")
    if db.get(Owner, owner_id) is None:
        raise ProblemError(status_code=404, title="Owner not found")
    open_assignment = current_assignment(db, mp_id)
    if open_assignment is not None and valid_from < open_assignment.valid_from:
        raise ProblemError(
            status_code=422,
            title="valid_from before current period",
            detail=(
                "valid_from darf nicht vor dem Beginn der aktuellen Eigentuemer-Periode "
                f"({open_assignment.valid_from.isoformat()}) liegen."
            ),
        )
    old_owner_id = open_assignment.owner_id if open_assignment is not None else None
    if open_assignment is not None:
        open_assignment.valid_to = valid_from
    new_assignment = OwnerAssignment(
        measuring_point_id=mp_id,
        owner_id=owner_id,
        valid_from=valid_from,
        valid_to=None,
    )
    db.add(new_assignment)
    record(
        db,
        user_id=user_id,
        action=AuditAction.OWNER_CHANGED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff={
            "from": old_owner_id,
            "to": owner_id,
            "valid_from": valid_from.isoformat(),
        },
        ip_address=ip_address,
    )
    db.flush()
    return new_assignment


# ---------------------------------------------------------------------------
# Historien-Editor (admin-only): Perioden anlegen, korrigieren, loeschen.
# Erlaubt — anders als ``assign_owner`` — auch Rueckdatierung, historische
# Perioden und Luecken (Leerstand). Einzige Invarianten: keine Ueberlappung
# (halboffene Intervalle) und max. eine offene Periode je MP.
# ---------------------------------------------------------------------------


def _serialize_period(a: OwnerAssignment) -> dict[str, object]:
    return {
        "owner_id": a.owner_id,
        "valid_from": a.valid_from.isoformat(),
        "valid_to": a.valid_to.isoformat() if a.valid_to is not None else None,
    }


def _get_assignment(db: Session, mp_id: int, assignment_id: int) -> OwnerAssignment:
    assignment = db.get(OwnerAssignment, assignment_id)
    if assignment is None or assignment.measuring_point_id != mp_id:
        raise ProblemError(status_code=404, title="Owner assignment not found")
    return assignment


def _validate_period(
    db: Session,
    *,
    mp_id: int,
    owner_id: int,
    valid_from: date,
    valid_to: date | None,
    exclude_id: int | None = None,
) -> None:
    """Validiert eine Periode fuer den Historien-Editor.

    Eine offene Periode (``valid_to IS NULL``) zaehlt als ``[valid_from, ∞)`` —
    der Ueberlappungs-Check deckt damit auch „max. eine offene Periode" ab,
    weil zwei offene Perioden immer kollidieren.
    """
    if db.get(MeasuringPoint, mp_id) is None:
        raise ProblemError(status_code=404, title="Measuring point not found")
    if db.get(Owner, owner_id) is None:
        raise ProblemError(status_code=404, title="Owner not found")
    if valid_to is not None and valid_to <= valid_from:
        raise ProblemError(
            status_code=422,
            title="Invalid period",
            detail="valid_to muss nach valid_from liegen.",
        )
    stmt = select(OwnerAssignment).where(
        OwnerAssignment.measuring_point_id == mp_id,
        or_(OwnerAssignment.valid_to.is_(None), OwnerAssignment.valid_to > valid_from),
    )
    if valid_to is not None:
        stmt = stmt.where(OwnerAssignment.valid_from < valid_to)
    if exclude_id is not None:
        stmt = stmt.where(OwnerAssignment.id != exclude_id)
    conflict = db.scalars(stmt.order_by(OwnerAssignment.valid_from)).first()
    if conflict is not None:
        until = conflict.valid_to.isoformat() if conflict.valid_to is not None else "offen"
        raise ProblemError(
            status_code=422,
            title="Period overlaps existing assignment",
            detail=(
                "Die Periode ueberschneidet sich mit einer bestehenden "
                f"Eigentuemer-Periode (ab {conflict.valid_from.isoformat()}, bis {until})."
            ),
        )


def create_assignment(
    db: Session,
    *,
    mp_id: int,
    owner_id: int,
    valid_from: date,
    valid_to: date | None,
    user_id: int,
    ip_address: str | None,
) -> OwnerAssignment:
    _validate_period(db, mp_id=mp_id, owner_id=owner_id, valid_from=valid_from, valid_to=valid_to)
    assignment = OwnerAssignment(
        measuring_point_id=mp_id,
        owner_id=owner_id,
        valid_from=valid_from,
        valid_to=valid_to,
    )
    db.add(assignment)
    db.flush()
    record(
        db,
        user_id=user_id,
        action=AuditAction.OWNER_ASSIGNMENT_CREATED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff=_serialize_period(assignment),
        ip_address=ip_address,
    )
    return assignment


def update_assignment(
    db: Session,
    *,
    mp_id: int,
    assignment_id: int,
    owner_id: int,
    valid_from: date,
    valid_to: date | None,
    user_id: int,
    ip_address: str | None,
) -> OwnerAssignment:
    assignment = _get_assignment(db, mp_id, assignment_id)
    before = _serialize_period(assignment)
    _validate_period(
        db,
        mp_id=mp_id,
        owner_id=owner_id,
        valid_from=valid_from,
        valid_to=valid_to,
        exclude_id=assignment_id,
    )
    assignment.owner_id = owner_id
    assignment.valid_from = valid_from
    assignment.valid_to = valid_to
    db.flush()
    record(
        db,
        user_id=user_id,
        action=AuditAction.OWNER_ASSIGNMENT_UPDATED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff={"before": before, "after": _serialize_period(assignment)},
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
    before = _serialize_period(assignment)
    db.delete(assignment)
    record(
        db,
        user_id=user_id,
        action=AuditAction.OWNER_ASSIGNMENT_DELETED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff={"before": before},
        ip_address=ip_address,
    )
    db.flush()
