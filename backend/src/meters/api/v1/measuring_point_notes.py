"""Notizen zu Messstellen.

Lesen und Anlegen darf jeder eingeloggte User mit Zugriff auf die Messstelle
(Recorder: nur zugeordnete, sonst 404). Bearbeiten gibt es bewusst nicht;
loeschen darf der Ersteller oder ein Admin.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from meters.api.deps import CurrentUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    MeasuringPoint,
    MeasuringPointNote,
    UserRole,
)
from meters.schemas import MeasuringPointNoteCreate, MeasuringPointNoteRead
from meters.services.access import assert_can_access_mp
from meters.services.audit import record

router = APIRouter(tags=["measuring-point-notes"])

_NOTE_NOT_FOUND = "Note not found"


def _to_read(n: MeasuringPointNote) -> MeasuringPointNoteRead:
    return MeasuringPointNoteRead(
        id=n.id,
        measuring_point_id=n.measuring_point_id,
        text=n.text,
        created_at=n.created_at,
        created_by_user_id=n.created_by_user_id,
        created_by_username=n.created_by.username if n.created_by else None,
    )


@router.get(
    "/measuring-points/{mp_id}/notes",
    response_model=list[MeasuringPointNoteRead],
)
def list_notes(mp_id: int, db: DbDep, user: CurrentUser) -> list[MeasuringPointNoteRead]:
    assert_can_access_mp(db, user, mp_id)
    if db.get(MeasuringPoint, mp_id) is None:
        raise ProblemError(status_code=404, title="Measuring point not found")
    rows = db.scalars(
        select(MeasuringPointNote)
        .options(selectinload(MeasuringPointNote.created_by))
        .where(MeasuringPointNote.measuring_point_id == mp_id)
        .order_by(MeasuringPointNote.created_at.desc(), MeasuringPointNote.id.desc())
    )
    return [_to_read(n) for n in rows]


@router.post(
    "/measuring-points/{mp_id}/notes",
    response_model=MeasuringPointNoteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_note(
    mp_id: int,
    payload: MeasuringPointNoteCreate,
    request: Request,
    db: DbDep,
    user: CurrentUser,
) -> MeasuringPointNoteRead:
    assert_can_access_mp(db, user, mp_id)
    if db.get(MeasuringPoint, mp_id) is None:
        raise ProblemError(status_code=404, title="Measuring point not found")
    note = MeasuringPointNote(
        measuring_point_id=mp_id,
        text=payload.text,
        created_by_user_id=user.id,
    )
    db.add(note)
    db.flush()
    record(
        db,
        user_id=user.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.MEASURING_POINT_NOTE,
        entity_id=note.id,
        diff={"measuring_point_id": mp_id, "text": note.text},
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(note)
    return _to_read(note)


@router.delete("/measuring-point-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: int, request: Request, db: DbDep, user: CurrentUser) -> None:
    note = db.get(MeasuringPointNote, note_id)
    if note is None:
        raise ProblemError(status_code=404, title=_NOTE_NOT_FOUND)
    # Einheitlicher Titel fuer "gibt es nicht", "fremde Messstelle" und
    # "fremde Notiz" — sonst wird die 404 zum Existenz-Orakel.
    assert_can_access_mp(db, user, note.measuring_point_id, not_found_title=_NOTE_NOT_FOUND)
    if user.role is not UserRole.ADMIN and note.created_by_user_id != user.id:
        raise ProblemError(status_code=404, title=_NOTE_NOT_FOUND)
    record(
        db,
        user_id=user.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.MEASURING_POINT_NOTE,
        entity_id=note.id,
        diff={
            "measuring_point_id": note.measuring_point_id,
            "text": note.text,
            "created_by_user_id": note.created_by_user_id,
        },
        ip_address=client_ip(request),
    )
    db.delete(note)
    db.commit()
