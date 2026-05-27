"""Schutz-Regeln für mutierende User-Operationen.

Zwei Klassen von Regeln, die in den User-Endpunkten konsistent angewendet
werden müssen:

1. **Self-Action-Verbot**: Ein Admin darf am eigenen Konto weder die Rolle
   noch ``is_active`` ändern und sich auch nicht selbst löschen — sonst
   könnte er sich versehentlich aussperren oder die Admin-Verwaltung
   verlassen, während er gerade daran arbeitet.

2. **Last-Active-Admin-Schutz**: Der einzige verbliebene aktive Admin
   darf nicht degradiert, deaktiviert oder gelöscht werden. Ohne diesen
   Schutz wäre das System nach der Operation ohne Admin und damit aus
   dem laufenden Betrieb heraus nicht mehr verwaltbar.

Beide Regeln werden mit HTTP 409 (Conflict) abgelehnt, weil die Anfrage
formal valide ist — sie verstößt nur gegen einen Konsistenz-Constraint
des Systems.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from meters.core.problem import ProblemError
from meters.models import User, UserRole


def assert_not_self(*, actor_user_id: int, target_user_id: int, action: str) -> None:
    """Wirft 409, wenn ein Admin die Aktion am eigenen Konto durchführen will."""
    if actor_user_id == target_user_id:
        raise ProblemError(
            status_code=409,
            title="Cannot perform action on own account",
            detail=f"Die Aktion '{action}' ist am eigenen Konto nicht erlaubt.",
            extra={"action": action},
        )


def assert_not_last_active_admin(db: Session, target: User, *, action: str) -> None:
    """Wirft 409, wenn die geplante Mutation den letzten aktiven Admin entfernen würde.

    Nur sinnvoll aufzurufen, wenn ``target`` aktuell Admin **und** aktiv ist
    und die geplante Mutation ihn aus dieser Menge entfernt (Demote auf
    RECORDER, Deaktivieren, oder Löschen). Der Caller entscheidet das im
    Vorfeld — diese Funktion zählt nur und blockt.
    """
    if target.role is not UserRole.ADMIN or not target.is_active:
        return
    active_admin_count = db.scalar(
        select(func.count(User.id)).where(
            User.role == UserRole.ADMIN,
            User.is_active.is_(True),
        )
    )
    if (active_admin_count or 0) <= 1:
        raise ProblemError(
            status_code=409,
            title="Cannot remove last active admin",
            detail=(
                f"'{target.username}' ist der einzige aktive Admin. "
                f"Lege erst einen weiteren aktiven Admin an, bevor du '{action}' ausführst."
            ),
            extra={"action": action, "active_admins": active_admin_count or 0},
        )
