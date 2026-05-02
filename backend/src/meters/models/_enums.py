from __future__ import annotations

import enum


class MeterType(enum.StrEnum):
    ELECTRICITY = "electricity"
    GAS = "gas"
    WATER = "water"
    OIL = "oil"


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
    PASSWORD_RESET = "password_reset"
    METER_REPLACED = "meter_replaced"


class AuditEntityType(enum.StrEnum):
    USER = "user"
    READING = "reading"
    MEASURING_POINT = "measuring_point"
    PHYSICAL_METER = "physical_meter"
    REGISTER = "register"
    LOCATION = "location"
    DELIVERY = "delivery"
    SESSION = "session"
