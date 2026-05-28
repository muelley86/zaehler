from __future__ import annotations

import enum

from meters.schemas.common import APIModel


class SearchMatchKind(enum.StrEnum):
    """Hoechste Prioritaet zuerst — bei Mehrfach-Match gewinnt der oberste."""

    SERIAL = "serial"
    NAME = "name"
    MAIN_LOCATION = "main_location"
    LOCATION = "location"
    MAIN_LOCATION_NOTE = "main_location_note"
    LOCATION_NOTE = "location_note"


_PRIORITY: dict[SearchMatchKind, int] = {
    SearchMatchKind.SERIAL: 1,
    SearchMatchKind.NAME: 2,
    SearchMatchKind.MAIN_LOCATION: 3,
    SearchMatchKind.LOCATION: 4,
    SearchMatchKind.MAIN_LOCATION_NOTE: 5,
    SearchMatchKind.LOCATION_NOTE: 6,
}


def match_priority(kind: SearchMatchKind) -> int:
    return _PRIORITY[kind]


class SearchHit(APIModel):
    measuring_point_id: int
    measuring_point_name: str
    location_id: int | None = None
    location_name: str | None = None
    main_location_id: int | None = None
    main_location_name: str | None = None
    matched_via: SearchMatchKind
    matched_detail: str | None = None
