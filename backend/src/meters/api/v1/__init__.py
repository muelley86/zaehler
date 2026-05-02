from __future__ import annotations

from fastapi import APIRouter

from meters.api.v1 import (
    audit,
    auth,
    deliveries,
    exports,
    locations,
    measuring_points,
    physical_meters,
    readings,
    users,
)

router = APIRouter(prefix="/v1")
router.include_router(auth.router)
router.include_router(users.router)
router.include_router(locations.router)
router.include_router(measuring_points.router)
router.include_router(physical_meters.router)
router.include_router(readings.router)
router.include_router(deliveries.router)
router.include_router(exports.router)
router.include_router(audit.router)

__all__ = ["router"]
