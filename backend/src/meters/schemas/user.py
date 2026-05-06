from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from meters.models import UserRole
from meters.schemas.common import APIModel, UtcDateTime


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    email: EmailStr | None = None
    role: UserRole
    initial_password: str = Field(min_length=12, max_length=256)


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserRead(APIModel):
    id: int
    username: str
    email: str | None
    role: UserRole
    is_active: bool
    force_password_change: bool
    created_at: UtcDateTime
    last_login_at: UtcDateTime | None


class PasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=12, max_length=256)


class PasswordResetResponse(BaseModel):
    user_id: int
    force_password_change: bool = True
