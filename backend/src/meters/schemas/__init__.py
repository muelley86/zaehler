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
from meters.schemas.common import (
    APIModel,
    BulkDeleteRequest,
    BulkDeleteResult,
    BulkDeleteSkipped,
    DecimalStr,
    ProblemDetails,
)
from meters.schemas.delivery import DeliveryCreate, DeliveryRead, DeliveryUpdate
from meters.schemas.location import LocationCreate, LocationRead, LocationUpdate
from meters.schemas.main_location import (
    MainLocationCreate,
    MainLocationRead,
    MainLocationUpdate,
)
from meters.schemas.measuring_point import (
    HeatingRegisterCreate,
    MeasuringPointCreate,
    MeasuringPointRead,
    MeasuringPointUpdate,
    ReplaceMeterRequest,
)
from meters.schemas.owner import OwnerCreate, OwnerRead, OwnerUpdate
from meters.schemas.owner_assignment import (
    ChangeOwnerRequest,
    OwnerAssignmentCreate,
    OwnerAssignmentRead,
    OwnerAssignmentUpdate,
)
from meters.schemas.physical_meter import (
    PhysicalMeterRead,
    PhysicalMeterUpdate,
    RegisterRead,
    RegisterUpdate,
)
from meters.schemas.qr_token import (
    QrTokenAssignRequest,
    QrTokenBulkCreateRequest,
    QrTokenRead,
    QrTokenResolveResponse,
)
from meters.schemas.reading import (
    ConsumptionPoint,
    ReadingCreate,
    ReadingRead,
    ReadingUpdate,
)
from meters.schemas.report import ReportAggregateResponse, ReportRow
from meters.schemas.report_config import (
    ReportConfigCreate,
    ReportConfigRead,
    ReportConfigUpdate,
    ReportFilterModel,
)
from meters.schemas.search import SearchHit, SearchMatchKind
from meters.schemas.state import RegisterStateRead
from meters.schemas.supplier import SupplierCreate, SupplierRead, SupplierUpdate
from meters.schemas.supplier_assignment import (
    ChangeSupplierRequest,
    SupplierAssignmentCreate,
    SupplierAssignmentRead,
    SupplierAssignmentUpdate,
)
from meters.schemas.user import (
    PasswordResetRequest,
    PasswordResetResponse,
    UserCreate,
    UserRead,
    UserUpdate,
)
from meters.schemas.virtual_measuring_point import (
    VirtualMeasuringPointCreate,
    VirtualMeasuringPointRead,
    VirtualMeasuringPointUpdate,
    VirtualMpBreakdownComponent,
    VirtualMpBreakdownResponse,
    VirtualMpBreakdownTotal,
    VirtualMpComponentIn,
    VirtualMpComponentRead,
)

__all__ = [
    "APIModel",
    "AuditLogRead",
    "BackupCodesResponse",
    "BulkDeleteRequest",
    "BulkDeleteResult",
    "BulkDeleteSkipped",
    "ChangeOwnerRequest",
    "ChangePasswordRequest",
    "ChangeSupplierRequest",
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
    "MainLocationCreate",
    "MainLocationRead",
    "MainLocationUpdate",
    "MeResponse",
    "MeasuringPointCreate",
    "MeasuringPointRead",
    "MeasuringPointUpdate",
    "MpAccessUserRead",
    "OwnerAssignmentCreate",
    "OwnerAssignmentRead",
    "OwnerAssignmentUpdate",
    "OwnerCreate",
    "OwnerRead",
    "OwnerUpdate",
    "PasswordResetRequest",
    "PasswordResetResponse",
    "PhysicalMeterRead",
    "PhysicalMeterUpdate",
    "ProblemDetails",
    "QrTokenAssignRequest",
    "QrTokenBulkCreateRequest",
    "QrTokenRead",
    "QrTokenResolveResponse",
    "ReadingCreate",
    "ReadingRead",
    "ReadingUpdate",
    "RegisterRead",
    "RegisterStateRead",
    "RegisterUpdate",
    "ReplaceMeterRequest",
    "ReportAggregateResponse",
    "ReportConfigCreate",
    "ReportConfigRead",
    "ReportConfigUpdate",
    "ReportFilterModel",
    "ReportRow",
    "SearchHit",
    "SearchMatchKind",
    "SupplierAssignmentCreate",
    "SupplierAssignmentRead",
    "SupplierAssignmentUpdate",
    "SupplierCreate",
    "SupplierRead",
    "SupplierUpdate",
    "TotpActivateRequest",
    "TotpActivateResponse",
    "TotpDisableRequest",
    "TotpSetupResponse",
    "TotpStatusResponse",
    "TotpVerifyRequest",
    "UserAccessRead",
    "UserAccessUpdate",
    "UserCreate",
    "UserRead",
    "UserUpdate",
    "VirtualMeasuringPointCreate",
    "VirtualMeasuringPointRead",
    "VirtualMeasuringPointUpdate",
    "VirtualMpBreakdownComponent",
    "VirtualMpBreakdownResponse",
    "VirtualMpBreakdownTotal",
    "VirtualMpComponentIn",
    "VirtualMpComponentRead",
]
