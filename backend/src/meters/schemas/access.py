"""Schemas für Per-Recorder MP-Zugriff (Feature B)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from meters.schemas.common import APIModel


class UserAccessRead(APIModel):
    """Liste der MP-IDs, auf die ein Recorder Zugriff hat."""

    user_id: int
    measuring_point_ids: list[int]


class UserAccessUpdate(BaseModel):
    """PUT-Body: ersetzt die komplette Access-Liste eines Recorders.

    Idempotent — der Server berechnet selbst den Diff zur aktuellen Menge
    und schreibt entsprechend Audit-Einträge.
    """

    measuring_point_ids: list[int] = Field(default_factory=list)


class MpAccessUserRead(APIModel):
    """Eintrag in der Liste "wer hat Zugriff auf diese MP"."""

    user_id: int
    username: str
    role: str
    # Quelle des Zugriffs:
    #   "admin"  → durch Admin-Rolle (impliziter Voll-Zugriff)
    #   "grant"  → expliziter Eintrag in user_measuring_point_access
    source: str
