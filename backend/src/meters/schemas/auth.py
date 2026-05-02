from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from meters.models import UserRole
from meters.schemas.common import APIModel


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class MeResponse(APIModel):
    id: int
    username: str
    email: str | None
    role: UserRole
    is_active: bool
    force_password_change: bool
    last_login_at: datetime | None
