from __future__ import annotations

from datetime import datetime

from meters.schemas.common import APIModel, DecimalStr


class RegisterStateRead(APIModel):
    register_id: int
    physical_meter_id: int
    obis_code: str
    label: str
    unit: str
    is_active: bool
    accepts_deliveries: bool
    last_reading_at: datetime | None
    last_reading_value: DecimalStr | None
    refilled_since: DecimalStr
    current_value: DecimalStr | None
