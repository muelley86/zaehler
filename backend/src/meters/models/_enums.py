from __future__ import annotations

import enum


class MeterType(enum.StrEnum):
    ELECTRICITY = "electricity"
    WATER = "water"
    HEATING = "heating"


class HeatingSource(enum.StrEnum):
    OIL = "oil"
    GAS = "gas"
    WOOD_CHIPS = "wood_chips"
    WOOD = "wood"
    DISTRICT_HEAT = "district_heat"


class UserRole(enum.StrEnum):
    ADMIN = "admin"
    RECORDER = "recorder"


class AuditAction(enum.StrEnum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    LOGIN = "login"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"
    PASSWORD_RESET = "password_reset"  # Admin setzt fremdes Passwort zurück
    PASSWORD_CHANGED = "password_changed"  # User ändert eigenes Passwort
    METER_REPLACED = "meter_replaced"
    TOTP_ENABLED = "totp_enabled"
    TOTP_DISABLED = "totp_disabled"
    TOTP_FAILED = "totp_failed"
    BACKUP_CODE_USED = "backup_code_used"
    # Per-Recorder MP-Zugriff (Feature B): Admin gewährt/entzieht
    # einem Recorder Zugriff auf eine bestimmte Messstelle. ``entity_type``
    # ist ``USER`` (das Subjekt der Berechtigung), die betroffene MP-ID
    # steht im ``diff``.
    ACCESS_GRANTED = "access_granted"
    ACCESS_REVOKED = "access_revoked"


class AuditEntityType(enum.StrEnum):
    USER = "user"
    READING = "reading"
    MEASURING_POINT = "measuring_point"
    PHYSICAL_METER = "physical_meter"
    REGISTER = "register"
    LOCATION = "location"
    DELIVERY = "delivery"
    SESSION = "session"
