from __future__ import annotations

from fastapi import APIRouter

from meters.api.v1 import router as v1_router

router = APIRouter(prefix="/api")
router.include_router(v1_router)

__all__ = ["router"]
