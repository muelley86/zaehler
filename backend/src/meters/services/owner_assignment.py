"""Service-Helfer fuer das Owner-Assignment-Periodisierungsmodell.

Genau ein offenes Assignment (``valid_to IS NULL``) pro MP gilt als
aktueller Eigentuemer. ``assign_owner`` ist die einzige offizielle Stelle,
die Perioden veraendert — sie schliesst die offene und legt eine neue an,
sodass keine Ueberlapps entstehen.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

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
