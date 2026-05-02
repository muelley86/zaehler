from __future__ import annotations

from meters.schemas.audit_log import AuditLogRead
from meters.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    MeResponse,
)
from meters.schemas.common import APIModel, DecimalStr, ProblemDetails
from meters.schemas.delivery import DeliveryCreate, DeliveryRead, DeliveryUpdate
from meters.schemas.location import LocationCreate, LocationRead, LocationUpdate
from meters.schemas.measuring_point import (
    MeasuringPointCreate,
    MeasuringPointRead,
    MeasuringPointUpdate,
    ReplaceMeterRequest,
)
from meters.schemas.physical_meter import (
    PhysicalMeterRead,
    PhysicalMeterUpdate,
    RegisterRead,
    RegisterUpdate,
)
from meters.schemas.reading import (
    ConsumptionPoint,
    ReadingCreate,
    ReadingRead,
    ReadingUpdate,
)
from meters.schemas.state import RegisterStateRead
from meters.schemas.user import (
    PasswordResetRequest,
    PasswordResetResponse,
    UserCreate,
    UserRead,
    UserUpdate,
)

__all__ = [
    "APIModel",
    "AuditLogRead",
    "ChangePasswordRequest",
    "ConsumptionPoint",
    "DecimalStr",
    "DeliveryCreate",
    "DeliveryRead",
    "DeliveryUpdate",
    "LocationCreate",
    "LocationRead",
    "LocationUpdate",
    "LoginRequest",
    "MeResponse",
    "MeasuringPointCreate",
    "MeasuringPointRead",
    "MeasuringPointUpdate",
    "PasswordResetRequest",
    "PasswordResetResponse",
    "PhysicalMeterRead",
    "PhysicalMeterUpdate",
    "ProblemDetails",
    "ReadingCreate",
    "ReadingRead",
    "ReadingUpdate",
    "RegisterRead",
    "RegisterStateRead",
    "RegisterUpdate",
    "ReplaceMeterRequest",
    "UserCreate",
    "UserRead",
    "UserUpdate",
]
