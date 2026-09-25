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


class FlowDirection(enum.StrEnum):
    """Richtung einer Verbrauchsreihe: Bezug/Verbrauch (OBIS 1.8.x, Wasser,
    Waerme) vs. Einspeisung (OBIS ``2.8.x``, nur Strom). Genutzt von den
    Komponenten virtueller Messstellen, um gezielt eine der beiden Reihen
    eines bidirektionalen Zaehlers zu verrechnen."""

    BEZUG = "bezug"
    EINSPEISUNG = "einspeisung"


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
    # Eigentuemer-Historien-Editor: Admin legt Perioden an, korrigiert oder
    # loescht sie — entity_type=MEASURING_POINT, diff mit before/after.
    OWNER_ASSIGNMENT_CREATED = "owner_assignment_created"
    OWNER_ASSIGNMENT_UPDATED = "owner_assignment_updated"
    OWNER_ASSIGNMENT_DELETED = "owner_assignment_deleted"
    # Lieferanten-Wechsel + Historien-Editor — exakt das Eigentuemer-Modell:
    # entity_type=MEASURING_POINT, diff analog zu OWNER_*.
    SUPPLIER_CHANGED = "supplier_changed"
    SUPPLIER_ASSIGNMENT_CREATED = "supplier_assignment_created"
    SUPPLIER_ASSIGNMENT_UPDATED = "supplier_assignment_updated"
    SUPPLIER_ASSIGNMENT_DELETED = "supplier_assignment_deleted"
    # Mieter-Wechsel + Historien-Editor — exakt das Eigentuemer-Modell:
    # entity_type=MEASURING_POINT, diff analog zu OWNER_*.
    MIETER_CHANGED = "mieter_changed"
    MIETER_ASSIGNMENT_CREATED = "mieter_assignment_created"
    MIETER_ASSIGNMENT_UPDATED = "mieter_assignment_updated"
    MIETER_ASSIGNMENT_DELETED = "mieter_assignment_deleted"
    # Kostenstelle mit Gueltigkeitszeitraum (seit 0036) — Muster wie MIETER_*.
    KOSTENSTELLE_CHANGED = "kostenstelle_changed"
    KOSTENSTELLE_ASSIGNMENT_CREATED = "kostenstelle_assignment_created"
    KOSTENSTELLE_ASSIGNMENT_UPDATED = "kostenstelle_assignment_updated"
    KOSTENSTELLE_ASSIGNMENT_DELETED = "kostenstelle_assignment_deleted"
    # "Abrechnen an" mit Gueltigkeitszeitraum (seit 0047) — Muster wie KOSTENSTELLE_*.
    # Kurze Namen: die Spalte ``audit_log.action`` fasst 32 Zeichen.
    BILL_TO_CHANGED = "bill_to_changed"
    BILL_TO_ASSIGNMENT_CREATED = "bill_to_assignment_created"
    BILL_TO_ASSIGNMENT_UPDATED = "bill_to_assignment_updated"
    BILL_TO_ASSIGNMENT_DELETED = "bill_to_assignment_deleted"
    # Voll-Backup (ZIP mit DB-Snapshot + Fotos) heruntergeladen bzw. per
    # GUI-Restore eingespielt — entity_type=SYSTEM, entity_id=None. Der
    # Restore-Eintrag wird NACH dem Swap in die restaurierte DB geschrieben.
    BACKUP_DOWNLOADED = "backup_downloaded"
    RESTORE_PERFORMED = "restore_performed"
    # Stammdaten-Import der Stromabrechnung uebernommen (entity_type=SYSTEM, Summen im diff).
    BILLING_IMPORT = "billing_import"
    # Abrechnungslauf festgeschrieben (entity_type=BILLING_RUN); vorher gueltige Version -> ersetzt.
    BILLING_RUN_FINALIZED = "billing_run_finalized"
    # Empfaenger nach Agrarmonitor uebertragen bzw. Markierung zurueckgenommen (Phase 5).
    BILLING_TRANSFERRED = "billing_transferred"


class AuditEntityType(enum.StrEnum):
    USER = "user"
    READING = "reading"
    MEASURING_POINT = "measuring_point"
    MEASURING_POINT_NOTE = "measuring_point_note"
    PHYSICAL_METER = "physical_meter"
    REGISTER = "register"
    LOCATION = "location"
    MAIN_LOCATION = "main_location"
    OWNER = "owner"
    SUPPLIER = "supplier"
    MIETER = "mieter"
    VIRTUAL_MEASURING_POINT = "virtual_measuring_point"
    DELIVERY = "delivery"
    SESSION = "session"
    QR_TOKEN = "qr_token"
    REPORT_CONFIG = "report_config"
    BILLING_CIRCLE = "billing_circle"
    BILLING_POSITION = "billing_position"
    BILLING_INVOICE = "billing_invoice"
    BILLING_RUN = "billing_run"
    # Systemweite Vorgänge ohne konkrete Entität (Backup-Download, Restore).
    SYSTEM = "system"


class BillingPositionKind(enum.StrEnum):
    """Art einer Abrechnungsposition: Strom-Messstelle oder Restmenge ohne Zaehler."""

    METER = "meter"
    REST = "rest"


class BillTo(enum.StrEnum):
    """An wen eine Messstelle abgerechnet wird. ``MIETER`` = den zum Stichtag aktuellen Mieter;
    ohne Mieter geht die Rechnung an den Eigentuemer. Ohne Periode gilt ``OWNER``."""

    OWNER = "owner"
    MIETER = "mieter"


class BillingRunStatus(enum.StrEnum):
    """Abrechnungslauf: Entwurf (aenderbar) -> festgeschrieben (unveraenderlich) -> ersetzt."""

    ENTWURF = "entwurf"
    FESTGESCHRIEBEN = "festgeschrieben"
    ERSETZT = "ersetzt"


class ReportDimension(enum.StrEnum):
    """Gruppierungs-Achse einer Auswertung (messstellen-uebergreifend)."""

    KOSTENSTELLE = "kostenstelle"
    OWNER = "owner"
    LOCATION = "location"
    MAIN_LOCATION = "main_location"
    METER_TYPE = "meter_type"
    MEASURING_POINT = "measuring_point"


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
    # „Aktueller Zeitraum": folgt dem globalen Datumsbereich des Frontends
    # (Navigation) — keine festen Daten, aufgeloest wird im Client.
    SHARED_RANGE = "shared_range"
