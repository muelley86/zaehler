from __future__ import annotations

from meters.schemas.access import MpAccessUserRead, UserAccessRead, UserAccessUpdate
from meters.schemas.audit_log import AuditLogRead
from meters.schemas.auth import (
    BackupCodesResponse,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    TotpActivateRequest,
    TotpActivateResponse,
    TotpDisableRequest,
    TotpSetupResponse,
    TotpStatusResponse,
    TotpVerifyRequest,
)
from meters.schemas.common import APIModel, DecimalStr, ProblemDetails
from meters.schemas.delivery import DeliveryCreate, DeliveryRead, DeliveryUpdate
from meters.schemas.location import LocationCreate, LocationRead, LocationUpdate
from meters.schemas.measuring_point import (
    HeatingRegisterCreate,
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
    "MpAccessUserRead",
    "UserAccessRead",
    "UserAccessUpdate",
    "BackupCodesResponse",
    "ChangePasswordRequest",
    "ConsumptionPoint",
    "DecimalStr",
    "DeliveryCreate",
    "DeliveryRead",
    "DeliveryUpdate",
    "HeatingRegisterCreate",
    "LocationCreate",
    "LocationRead",
    "LocationUpdate",
    "LoginRequest",
    "LoginResponse",
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
    "TotpActivateRequest",
    "TotpActivateResponse",
    "TotpDisableRequest",
    "TotpSetupResponse",
    "TotpStatusResponse",
    "TotpVerifyRequest",
    "UserCreate",
    "UserRead",
    "UserUpdate",
]
