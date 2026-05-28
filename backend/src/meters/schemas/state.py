from __future__ import annotations

from meters.schemas.common import APIModel, DecimalStr, UtcDateTime


class RegisterStateRead(APIModel):
    register_id: int
    physical_meter_id: int
    obis_code: str
    label: str
    unit: str
    is_active: bool
    accepts_deliveries: bool
    last_reading_at: UtcDateTime | None
    last_reading_value: DecimalStr | None
    refilled_since: DecimalStr
    current_value: DecimalStr | None
