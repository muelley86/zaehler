from __future__ import annotations

import enum

from meters.schemas.common import APIModel


class SearchMatchKind(enum.StrEnum):
    """Hoechste Prioritaet zuerst — bei Mehrfach-Match gewinnt der oberste."""

    SERIAL = "serial"
    CONTRACT_NUMBER = "contract_number"
    MARKET_LOCATION = "market_location"
    OWNER = "owner"
    NAME = "name"
    MAIN_LOCATION = "main_location"
    LOCATION = "location"
    OWNER_NOTE = "owner_note"
    MAIN_LOCATION_NOTE = "main_location_note"
    LOCATION_NOTE = "location_note"


_PRIORITY: dict[SearchMatchKind, int] = {
    SearchMatchKind.SERIAL: 1,
    SearchMatchKind.CONTRACT_NUMBER: 2,
    SearchMatchKind.MARKET_LOCATION: 3,
    SearchMatchKind.OWNER: 4,
    SearchMatchKind.NAME: 5,
    SearchMatchKind.MAIN_LOCATION: 6,
    SearchMatchKind.LOCATION: 7,
    SearchMatchKind.OWNER_NOTE: 8,
    SearchMatchKind.MAIN_LOCATION_NOTE: 9,
    SearchMatchKind.LOCATION_NOTE: 10,
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
