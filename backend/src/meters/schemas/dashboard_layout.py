"""Dashboard-Layout je Benutzer: Reihenfolge der Kacheln und welche eingeklappt sind.

Schreiben lehnt unbekannte IDs (``Literal``) und Duplikate mit 422 ab; fehlende
Kacheln hängt der PUT hinten an. Lesen ist tolerant (``normalize_layout``): ein
gespeichertes Layout bleibt gültig, wenn später Kacheln hinzukommen oder wegfallen.
"""

from __future__ import annotations

from typing import Any, Literal, get_args

from pydantic import Field, field_validator

from meters.schemas.common import APIModel

DashboardTileId = Literal["kpi", "due", "insights", "top"]
TILE_IDS: tuple[DashboardTileId, ...] = get_args(DashboardTileId)


def _no_duplicates(value: list[DashboardTileId]) -> list[DashboardTileId]:
    if len(set(value)) != len(value):
        raise ValueError("Kachel-IDs dürfen nicht doppelt vorkommen")
    return value


class DashboardLayout(APIModel):
    order: list[DashboardTileId] = Field(max_length=len(TILE_IDS))
    collapsed: list[DashboardTileId] = Field(default_factory=list, max_length=len(TILE_IDS))

    _check_order = field_validator("order")(_no_duplicates)
    _check_collapsed = field_validator("collapsed")(_no_duplicates)


def _known_unique(raw: object) -> list[DashboardTileId]:
    if not isinstance(raw, list):
        return []
    result: list[DashboardTileId] = []
    for item in raw:
        tile = next((t for t in TILE_IDS if t == item), None)
        if tile is not None and tile not in result:
            result.append(tile)
    return result


def normalize_layout(raw: dict[str, Any] | None) -> DashboardLayout:
    """Unbekannte IDs verwerfen, fehlende hinten anhängen; ``None`` → Standard."""
    data = raw if isinstance(raw, dict) else {}
    order = _known_unique(data.get("order"))
    order += [tile for tile in TILE_IDS if tile not in order]
    return DashboardLayout(order=order, collapsed=_known_unique(data.get("collapsed")))
