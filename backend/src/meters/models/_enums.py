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
    # QR-Token-Verheiratung (Feature A): Admin oder berechtigter Recorder
    # erzeugt einen anonymen Token, ordnet ihn einer MP zu, hängt ihn um
    # oder löscht ihn. ``entity_type`` ist ``QR_TOKEN``, ``entity_id`` ist
    # die DB-ID des Tokens.
    TOKEN_CREATED = "token_created"
    TOKEN_ASSIGNED = "token_assigned"
    TOKEN_UNASSIGNED = "token_unassigned"
    TOKEN_DELETED = "token_deleted"
    # Eigentuemer-Wechsel mit Stichtag — entity_type=MEASURING_POINT,
    # diff = {"from": old_owner_id, "to": new_owner_id, "valid_from": "..."}.
    OWNER_CHANGED = "owner_changed"


class AuditEntityType(enum.StrEnum):
    USER = "user"
    READING = "reading"
    MEASURING_POINT = "measuring_point"
    PHYSICAL_METER = "physical_meter"
    REGISTER = "register"
    LOCATION = "location"
    MAIN_LOCATION = "main_location"
    OWNER = "owner"
    DELIVERY = "delivery"
    SESSION = "session"
    QR_TOKEN = "qr_token"
    REPORT_CONFIG = "report_config"


class ReportDimension(enum.StrEnum):
    """Gruppierungs-Achse einer Auswertung (messstellen-uebergreifend)."""

    KOSTENSTELLE = "kostenstelle"
    OWNER = "owner"
    LOCATION = "location"
    MAIN_LOCATION = "main_location"
    METER_TYPE = "meter_type"


class ReportGranularity(enum.StrEnum):
    """Zeitliche Aufloesung einer Auswertung. ``TOTAL`` = eine Summe je Gruppe
    ueber den gesamten Zeitraum (keine Zeitreihe)."""

    DAY = "day"
    WEEK = "week"
    MONTH = "month"
    YEAR = "year"
    TOTAL = "total"


class ReportPeriodKind(enum.StrEnum):
    """Zeitraum-Definition einer gespeicherten Auswertung. ``FIXED`` nutzt feste
    ``from_date``/``to_date``; die relativen Varianten werden beim Ausfuehren in
    der lokalen Zeitzone des Nutzers zu konkreten Daten aufgeloest."""

    FIXED = "fixed"
    CURRENT_YEAR = "current_year"
    LAST_12_MONTHS = "last_12_months"
    CURRENT_MONTH = "current_month"
    LAST_MONTH = "last_month"
    ALL = "all"
