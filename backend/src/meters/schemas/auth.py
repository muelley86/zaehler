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
    totp_enabled: bool
    last_login_at: datetime | None


class LoginResponse(BaseModel):
    """Antwort auf POST /auth/login.

    Bei aktiviertem TOTP wird kein Cookie gesetzt; stattdessen liefert das
    Backend ``challenge_token`` für den nachfolgenden ``/auth/2fa/verify``-
    Aufruf. Bei einstufigem Login (kein TOTP) ist ``me`` gesetzt.
    """

    requires_2fa: bool
    me: MeResponse | None = None
    challenge_token: str | None = None


class TotpSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str
    qr_png_base64: str


class TotpActivateRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class TotpActivateResponse(BaseModel):
    backup_codes: list[str]


class TotpDisableRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    code: str | None = Field(default=None, min_length=6, max_length=32)


class TotpVerifyRequest(BaseModel):
    challenge_token: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=6, max_length=32)


class TotpStatusResponse(BaseModel):
    enabled: bool
    backup_codes_remaining: int


class BackupCodesResponse(BaseModel):
    backup_codes: list[str]
