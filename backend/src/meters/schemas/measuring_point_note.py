from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from meters.models.measuring_point_note import NOTE_MAX_LENGTH
from meters.schemas.common import APIModel, UtcDateTime


class MeasuringPointNoteCreate(BaseModel):
    text: str = Field(min_length=1, max_length=NOTE_MAX_LENGTH)

    @field_validator("text")
    @classmethod
    def _strip_and_require_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Notiz darf nicht leer sein.")
        return stripped


class MeasuringPointNoteRead(APIModel):
    id: int
    measuring_point_id: int
    text: str
    created_at: UtcDateTime
    created_by_user_id: int | None
    created_by_username: str | None = None
