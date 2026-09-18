"""Service fuer die periodisierte Kostenstelle (Muster ``mieter_assignment``).

Hoechstens eine offene Periode (``valid_to IS NULL``) je MP = aktuelle
Kostenstelle. ``assign_kostenstelle`` ist der Wechsel (offene Periode schliessen,
neue oeffnen); der Historien-Editor (``create/update/delete_assignment``) erlaubt
Rueckdatierung und Luecken, verhindert aber Ueberlappungen. Die Abrechnung liest
mit ``kostenstellen_am`` den Wert zum Stichtag.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from meters.core.config import settings
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    KostenstelleAssignment,
    MeasuringPoint,
)
from meters.services.assignment_guard import open_period_guard
from meters.services.audit import record


def _heute() -> date:
    """Heutiges Datum in der App-Zeitzone (kurz nach Mitternacht laege UTC am Vortag)."""
    return datetime.now(ZoneInfo(settings.timezone)).date()


def current_assignment(db: Session, mp_id: int) -> KostenstelleAssignment | None:
    return db.scalar(
        select(KostenstelleAssignment).where(
            KostenstelleAssignment.measuring_point_id == mp_id,
            KostenstelleAssignment.valid_to.is_(None),
        )
    )


def list_history(db: Session, mp_id: int) -> list[KostenstelleAssignment]:
    return list(
        db.scalars(
            select(KostenstelleAssignment)
            .where(KostenstelleAssignment.measuring_point_id == mp_id)
            .order_by(KostenstelleAssignment.valid_from.desc())
        )
    )


def kostenstellen_am(db: Session, mp_ids: Iterable[int], stichtag: date) -> dict[int, int]:
    """Kostenstelle je MP zum Stichtag (``valid_from <= stichtag < valid_to``).

    MPs ohne gueltige Periode fehlen im Ergebnis. Eine Query fuer alle MPs."""
    ids = list(mp_ids)
    if not ids:
        return {}
    rows = db.execute(
        select(
            KostenstelleAssignment.measuring_point_id, KostenstelleAssignment.kostenstelle
        ).where(
            KostenstelleAssignment.measuring_point_id.in_(ids),
            KostenstelleAssignment.valid_from <= stichtag,
            or_(
                KostenstelleAssignment.valid_to.is_(None),
                KostenstelleAssignment.valid_to > stichtag,
            ),
        )
    )
    return {mp_id: kst for mp_id, kst in rows}


def _expire_mp(db: Session, mp_id: int) -> None:
    """``MeasuringPoint.kostenstelle`` liest die geladene Collection; die Session laeuft mit
    ``expire_on_commit=False`` - nach einer Aenderung waere sie sonst in der Response veraltet."""
    mp = db.get(MeasuringPoint, mp_id)
    if mp is not None:
        db.expire(mp, ["kostenstelle_assignments"])


def _get_mp(db: Session, mp_id: int) -> MeasuringPoint:
    mp = db.get(MeasuringPoint, mp_id)
    if mp is None:
        raise ProblemError(status_code=404, title="Measuring point not found")
    return mp


def _record_change(
    db: Session,
    *,
    mp_id: int,
    old: int | None,
    new: int | None,
    stichtag: date,
    user_id: int,
    ip_address: str | None,
) -> None:
    record(
        db,
        user_id=user_id,
        action=AuditAction.KOSTENSTELLE_CHANGED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff={"from": old, "to": new, "valid_from": stichtag.isoformat()},
        ip_address=ip_address,
    )


def assign_kostenstelle(
    db: Session,
    *,
    mp_id: int,
    kostenstelle: int,
    valid_from: date,
    user_id: int,
    ip_address: str | None,
) -> KostenstelleAssignment:
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
                "valid_from darf nicht vor dem Beginn der aktuellen Kostenstellen-Periode "
                f"({offen.valid_from.isoformat()}) liegen."
            ),
        )
    alt = offen.kostenstelle if offen is not None else None
    if offen is not None and valid_from == offen.valid_from:
        offen.kostenstelle = kostenstelle
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
        neu = KostenstelleAssignment(
            measuring_point_id=mp_id, kostenstelle=kostenstelle, valid_from=valid_from
        )
        db.add(neu)
    _record_change(
        db,
        mp_id=mp_id,
        old=alt,
        new=kostenstelle,
        stichtag=valid_from,
        user_id=user_id,
        ip_address=ip_address,
    )
    with open_period_guard(db, kind="Kostenstellen"):
        db.flush()
    _expire_mp(db, mp_id)
    return neu


def end_kostenstelle(
    db: Session,
    *,
    mp_id: int,
    valid_to: date,
    user_id: int,
    ip_address: str | None,
) -> None:
    """Offene Periode zum ``valid_to`` beenden (MP hat danach keine Kostenstelle).

    Beginnt sie erst an diesem Tag, wird sie geloescht (sie waere leer)."""
    _get_mp(db, mp_id)
    offen = current_assignment(db, mp_id)
    if offen is None:
        return
    if valid_to < offen.valid_from:
        raise ProblemError(
            status_code=422,
            title="valid_to before current period",
            detail=(
                "Das Ende darf nicht vor dem Beginn der aktuellen Kostenstellen-Periode "
                f"({offen.valid_from.isoformat()}) liegen."
            ),
        )
    alt = offen.kostenstelle
    if valid_to == offen.valid_from:
        db.delete(offen)
    else:
        offen.valid_to = valid_to
    _record_change(
        db,
        mp_id=mp_id,
        old=alt,
        new=None,
        stichtag=valid_to,
        user_id=user_id,
        ip_address=ip_address,
    )
    db.flush()
    _expire_mp(db, mp_id)


def set_from_patch(
    db: Session,
    *,
    mp: MeasuringPoint,
    kostenstelle: int | None,
    clear: bool,
    stichtag: date | None,
    user_id: int,
    ip_address: str | None,
) -> None:
    """PATCH /measuring-points/{id} (API-kompatibel zum frueheren Einzelfeld).

    - ``clear``: offene Periode zum Stichtag (Default heute) beenden.
    - Wert ohne offene Periode: neue offene Periode ab Stichtag, Default = Ende der
      letzten Periode bzw. Einbau des ersten Zaehlers (Nachtragen gilt rueckwirkend).
    - Wert abweichend von der offenen Periode: Wechsel zum Stichtag (Default heute).
    """
    if clear:
        end_kostenstelle(
            db,
            mp_id=mp.id,
            valid_to=stichtag or _heute(),
            user_id=user_id,
            ip_address=ip_address,
        )
        return
    if kostenstelle is None:
        return
    offen = current_assignment(db, mp.id)
    if offen is not None:
        if offen.kostenstelle == kostenstelle:
            return
        beginn = stichtag or _heute()
    else:
        beginn = stichtag or _default_beginn(db, mp)
    assign_kostenstelle(
        db,
        mp_id=mp.id,
        kostenstelle=kostenstelle,
        valid_from=beginn,
        user_id=user_id,
        ip_address=ip_address,
    )


def _default_beginn(db: Session, mp: MeasuringPoint) -> date:
    letztes_ende = db.scalar(
        select(func.max(KostenstelleAssignment.valid_to)).where(
            KostenstelleAssignment.measuring_point_id == mp.id
        )
    )
    if letztes_ende is not None:
        return letztes_ende
    einbauten = [m.installed_at for m in mp.physical_meters]
    return min(einbauten) if einbauten else _heute()


# ---------------------------------------------------------------------------
# Historien-Editor (admin-only): Perioden anlegen, korrigieren, loeschen.
# Erlaubt Rueckdatierung und Luecken; einzige Invariante: keine Ueberlappung
# (halboffene Intervalle, offene Periode = [valid_from, unendlich)).
# ---------------------------------------------------------------------------


def _serialize(a: KostenstelleAssignment) -> dict[str, object]:
    return {
        "kostenstelle": a.kostenstelle,
        "valid_from": a.valid_from.isoformat(),
        "valid_to": a.valid_to.isoformat() if a.valid_to is not None else None,
    }


def _get_assignment(db: Session, mp_id: int, assignment_id: int) -> KostenstelleAssignment:
    assignment = db.get(KostenstelleAssignment, assignment_id)
    if assignment is None or assignment.measuring_point_id != mp_id:
        raise ProblemError(status_code=404, title="Kostenstelle assignment not found")
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
    stmt = select(KostenstelleAssignment).where(
        KostenstelleAssignment.measuring_point_id == mp_id,
        or_(
            KostenstelleAssignment.valid_to.is_(None),
            KostenstelleAssignment.valid_to > valid_from,
        ),
    )
    if valid_to is not None:
        stmt = stmt.where(KostenstelleAssignment.valid_from < valid_to)
    if exclude_id is not None:
        stmt = stmt.where(KostenstelleAssignment.id != exclude_id)
    konflikt = db.scalars(stmt.order_by(KostenstelleAssignment.valid_from)).first()
    if konflikt is not None:
        bis = konflikt.valid_to.isoformat() if konflikt.valid_to is not None else "offen"
        raise ProblemError(
            status_code=422,
            title="Period overlaps existing assignment",
            detail=(
                "Die Periode ueberschneidet sich mit einer bestehenden Kostenstellen-Periode "
                f"(ab {konflikt.valid_from.isoformat()}, bis {bis})."
            ),
        )


def create_assignment(
    db: Session,
    *,
    mp_id: int,
    kostenstelle: int,
    valid_from: date,
    valid_to: date | None,
    user_id: int,
    ip_address: str | None,
) -> KostenstelleAssignment:
    _get_mp(db, mp_id)
    _pruefe_ueberlappung(db, mp_id=mp_id, valid_from=valid_from, valid_to=valid_to, exclude_id=None)
    assignment = KostenstelleAssignment(
        measuring_point_id=mp_id,
        kostenstelle=kostenstelle,
        valid_from=valid_from,
        valid_to=valid_to,
    )
    db.add(assignment)
    with open_period_guard(db, kind="Kostenstellen"):
        db.flush()
    record(
        db,
        user_id=user_id,
        action=AuditAction.KOSTENSTELLE_ASSIGNMENT_CREATED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff=_serialize(assignment),
        ip_address=ip_address,
    )
    _expire_mp(db, mp_id)
    return assignment


def update_assignment(
    db: Session,
    *,
    mp_id: int,
    assignment_id: int,
    kostenstelle: int,
    valid_from: date,
    valid_to: date | None,
    user_id: int,
    ip_address: str | None,
) -> KostenstelleAssignment:
    assignment = _get_assignment(db, mp_id, assignment_id)
    vorher = _serialize(assignment)
    _pruefe_ueberlappung(
        db, mp_id=mp_id, valid_from=valid_from, valid_to=valid_to, exclude_id=assignment_id
    )
    assignment.kostenstelle = kostenstelle
    assignment.valid_from = valid_from
    assignment.valid_to = valid_to
    with open_period_guard(db, kind="Kostenstellen"):
        db.flush()
    record(
        db,
        user_id=user_id,
        action=AuditAction.KOSTENSTELLE_ASSIGNMENT_UPDATED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff={"before": vorher, "after": _serialize(assignment)},
        ip_address=ip_address,
    )
    _expire_mp(db, mp_id)
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
        action=AuditAction.KOSTENSTELLE_ASSIGNMENT_DELETED,
        entity_type=AuditEntityType.MEASURING_POINT,
        entity_id=mp_id,
        diff={"before": vorher},
        ip_address=ip_address,
    )
    db.flush()
    _expire_mp(db, mp_id)
