"""Service-Helfer fuer das Supplier-Assignment-Periodisierungsmodell.

Genau ein offenes Assignment (``valid_to IS NULL``) pro MP gilt als
aktueller Lieferant. ``assign_supplier`` ist die einzige offizielle Stelle,
die Perioden veraendert — sie schliesst die offene und legt eine neue an,
sodass keine Ueberlapps entstehen. 1:1-Spiegel von
``services/owner_assignment.py``.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    MeasuringPoint,
    Supplier,
    SupplierAssignment,
)
from meters.services.audit import record


def current_assignment(db: Session, mp_id: int) -> SupplierAssignment | None:
    return db.scalar(
        select(SupplierAssignment)
        .where(
            SupplierAssignment.measuring_point_id == mp_id,
            SupplierAssignment.valid_to.is_(None),
        )
        .order_by(SupplierAssignment.valid_from.desc())
    )


def current_assignments_bulk(db: Session, mp_ids: Iterable[int]) -> dict[int, SupplierAssignment]:
    """Liefert die aktuell offenen Zuordnungen fuer mehrere Messstellen in
    einer einzigen Query. Verhindert N+1 in Listing-Endpoints.
    """
    ids = list(mp_ids)
    if not ids:
        return {}
    rows = db.scalars(
        select(SupplierAssignment)
        .where(
            SupplierAssignment.measuring_point_id.in_(ids),
            SupplierAssignment.valid_to.is_(None),
        )
        .options(selectinload(SupplierAssignment.supplier))
    )
    return {a.measuring_point_id: a for a in rows}


def list_history(db: Session, mp_id: int) -> list[SupplierAssignment]:
    return list(
        db.scalars(
            select(SupplierAssignment)
            .where(SupplierAssignment.measuring_point_id == mp_id)
            .order_by(SupplierAssignment.valid_from.desc())
        )
    )


def assign_supplier(
    db: Session,
    *,
    mp_id: int,
    supplier_id: int,
    valid_from: date,
    user_id: int,
    ip_address: str | None,
) -> SupplierAssignment:
    """Schliesst die aktuelle offene Periode (``valid_to = valid_from``) und
    legt eine neue offene fuer den neuen Lieferanten an. Schreibt AuditLog
    (action=SUPPLIER_CHANGED, entity_type=MEASURING_POINT).
    """
    mp = db.get(MeasuringPoint, mp_id)
    if mp is None:
        raise ProblemError(status_code=404, title="Measuring point not found")
    if db.get(Supplier, supplier_id) is None:
        raise ProblemError(status_code=404, title="Supplier not found")
    open_assignment = current_assignment(db, mp_id)
    if open_assignment is not None and valid_from < open_assignment.valid_from:
        raise ProblemError(
            status_code=422,
            title="valid_from before current period",
            detail=(
                "valid_from darf nicht vor dem Beginn der aktuellen Lieferanten-Periode "
                f"({open_assignment.valid_from.isoformat()}) liegen."
            ),
        )
    old_supplier_id = open_assignment.supplier_id if open_assignment is not None else None
    if open_assignment is not None:
        open_assignment.valid_to = valid_from
    new_assignment = SupplierAssignment(
        measuring_point_id=mp_id,
        supplier_id=supplier_id,
        valid_from=valid_from,
        valid_to=None,
    )
    db.add(new_assignment)
    record(
        db,
        user_id=user_id,
        action=AuditAction.SUPPLIER_CHANGED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff={
            "from": old_supplier_id,
            "to": supplier_id,
            "valid_from": valid_from.isoformat(),
        },
        ip_address=ip_address,
    )
    db.flush()
    return new_assignment


# ---------------------------------------------------------------------------
# Historien-Editor (admin-only): Perioden anlegen, korrigieren, loeschen.
# Erlaubt — anders als ``assign_supplier`` — auch Rueckdatierung, historische
# Perioden und Luecken (kein Liefervertrag). Einzige Invarianten: keine
# Ueberlappung (halboffene Intervalle) und max. eine offene Periode je MP.
# ---------------------------------------------------------------------------


def _serialize_period(a: SupplierAssignment) -> dict[str, object]:
    return {
        "supplier_id": a.supplier_id,
        "valid_from": a.valid_from.isoformat(),
        "valid_to": a.valid_to.isoformat() if a.valid_to is not None else None,
    }


def _get_assignment(db: Session, mp_id: int, assignment_id: int) -> SupplierAssignment:
    assignment = db.get(SupplierAssignment, assignment_id)
    if assignment is None or assignment.measuring_point_id != mp_id:
        raise ProblemError(status_code=404, title="Supplier assignment not found")
    return assignment


def _validate_period(
    db: Session,
    *,
    mp_id: int,
    supplier_id: int,
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
    if db.get(Supplier, supplier_id) is None:
        raise ProblemError(status_code=404, title="Supplier not found")
    if valid_to is not None and valid_to <= valid_from:
        raise ProblemError(
            status_code=422,
            title="Invalid period",
            detail="valid_to muss nach valid_from liegen.",
        )
    stmt = select(SupplierAssignment).where(
        SupplierAssignment.measuring_point_id == mp_id,
        or_(SupplierAssignment.valid_to.is_(None), SupplierAssignment.valid_to > valid_from),
    )
    if valid_to is not None:
        stmt = stmt.where(SupplierAssignment.valid_from < valid_to)
    if exclude_id is not None:
        stmt = stmt.where(SupplierAssignment.id != exclude_id)
    conflict = db.scalars(stmt.order_by(SupplierAssignment.valid_from)).first()
    if conflict is not None:
        until = conflict.valid_to.isoformat() if conflict.valid_to is not None else "offen"
        raise ProblemError(
            status_code=422,
            title="Period overlaps existing assignment",
            detail=(
                "Die Periode ueberschneidet sich mit einer bestehenden "
                f"Lieferanten-Periode (ab {conflict.valid_from.isoformat()}, bis {until})."
            ),
        )


def create_assignment(
    db: Session,
    *,
    mp_id: int,
    supplier_id: int,
    valid_from: date,
    valid_to: date | None,
    user_id: int,
    ip_address: str | None,
) -> SupplierAssignment:
    _validate_period(
        db, mp_id=mp_id, supplier_id=supplier_id, valid_from=valid_from, valid_to=valid_to
    )
    assignment = SupplierAssignment(
        measuring_point_id=mp_id,
        supplier_id=supplier_id,
        valid_from=valid_from,
        valid_to=valid_to,
    )
    db.add(assignment)
    db.flush()
    record(
        db,
        user_id=user_id,
        action=AuditAction.SUPPLIER_ASSIGNMENT_CREATED,
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
    supplier_id: int,
    valid_from: date,
    valid_to: date | None,
    user_id: int,
    ip_address: str | None,
) -> SupplierAssignment:
    assignment = _get_assignment(db, mp_id, assignment_id)
    before = _serialize_period(assignment)
    _validate_period(
        db,
        mp_id=mp_id,
        supplier_id=supplier_id,
        valid_from=valid_from,
        valid_to=valid_to,
        exclude_id=assignment_id,
    )
    assignment.supplier_id = supplier_id
    assignment.valid_from = valid_from
    assignment.valid_to = valid_to
    db.flush()
    record(
        db,
        user_id=user_id,
        action=AuditAction.SUPPLIER_ASSIGNMENT_UPDATED,
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
        action=AuditAction.SUPPLIER_ASSIGNMENT_DELETED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff={"before": before},
        ip_address=ip_address,
    )
    db.flush()
