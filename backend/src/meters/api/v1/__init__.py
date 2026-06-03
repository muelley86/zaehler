from __future__ import annotations

from fastapi import APIRouter

from meters.api.v1 import (
    audit,
    auth,
    deliveries,
    entries,
    exports,
    imports,
    locations,
    main_locations,
    measuring_points,
    owners,
    physical_meters,
    qr_tokens,
    readings,
    report_configs,
    reports,
    search,
    users,
)

router = APIRouter(prefix="/v1")
router.include_router(auth.router)
router.include_router(users.router)
router.include_router(locations.router)
router.include_router(main_locations.router)
router.include_router(owners.router)
router.include_router(measuring_points.router)
router.include_router(physical_meters.router)
router.include_router(readings.router)
router.include_router(deliveries.router)
router.include_router(entries.router)
router.include_router(exports.router)
router.include_router(imports.router)
router.include_router(audit.router)
router.include_router(qr_tokens.router)
router.include_router(reports.router)
router.include_router(report_configs.router)
router.include_router(search.router)

__all__ = ["router"]
