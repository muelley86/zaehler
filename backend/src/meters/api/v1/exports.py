"""Datenexport: CSV-Liste aller Erfassungen und ein vollständiger JSON-Dump.

Die JSON-Variante ist als Komplett-Backup gedacht (z. B. wenn man das Tool
mal woanders aufsetzen will) — die DB-Datei selbst bleibt aber das primäre
Backup-Artefakt (siehe ``deploy/lxc/backup.sh``).
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import shutil
import sqlite3
import tempfile
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from starlette.background import BackgroundTask

from meters.api.deps import AdminUser, CurrentUser, DbDep
from meters.core.problem import ProblemError
from meters.db import engine
from meters.models import (
    MeasuringPoint,
    PhysicalMeter,
    Reading,
    Register,
    UserRole,
)
from meters.schemas.common import csv_guard_formula, format_decimal_de, to_utc_iso
from meters.services.access import restrict_mp_query

router = APIRouter(prefix="/export", tags=["export"])


def _format_de(dt: datetime, *, with_seconds: bool = False) -> str:
    """Datums-/Zeit-Anzeige im deutschen Format DD.MM.YYYY HH:MM[:SS].

    CSV-Exports werden überwiegend in Excel/LibreOffice gesichtet — dort
    erwarten Anwender deutsche Schreibweise. JSON-Dumps bleiben bewusst
    ISO-8601 (siehe :func:`full_dump`), das ist Maschinen-Format.
    """
    fmt = "%d.%m.%Y %H:%M:%S" if with_seconds else "%d.%m.%Y %H:%M"
    return dt.strftime(fmt)


@router.get("/readings.csv")
def readings_csv(db: DbDep, user: CurrentUser) -> StreamingResponse:
    stmt = (
        select(Reading)
        .options(
            selectinload(Reading.register).selectinload(Register.physical_meter),
            selectinload(Reading.created_by),
        )
        .order_by(Reading.reading_at, Reading.id)
    )
    # Recorder bekommt nur Readings auf zugänglichen MPs — über Join.
    if user.role is not UserRole.ADMIN:
        stmt = stmt.join(Reading.register).join(Register.physical_meter)
        stmt = restrict_mp_query(stmt, user, mp_id_column=PhysicalMeter.measuring_point_id)
    rows = list(db.scalars(stmt))

    buffer = io.StringIO()
    # Semikolon-Delimiter + Komma-Dezimal + UTF-8-BOM für Excel (DE-Locale);
    # Datum ist via _format_de bereits deutsch.
    writer = csv.writer(buffer, delimiter=";", lineterminator="\n")
    writer.writerow(
        [
            "id",
            "reading_at",
            "value",
            "unit",
            "obis_code",
            "register_id",
            "physical_meter_id",
            "serial_number",
            "measuring_point_id",
            "note",
            "created_at",
            "created_by",
        ]
    )
    for r in rows:
        register = r.register
        meter = register.physical_meter
        writer.writerow(
            [
                r.id,
                _format_de(r.reading_at),
                format_decimal_de(r.value),
                csv_guard_formula(register.unit),
                csv_guard_formula(register.obis_code),
                register.id,
                meter.id,
                csv_guard_formula(meter.serial_number),
                meter.measuring_point_id,
                csv_guard_formula(r.note or ""),
                _format_de(r.created_at, with_seconds=True),
                csv_guard_formula(r.created_by.username if r.created_by else ""),
            ]
        )

    return StreamingResponse(
        iter(["﻿" + buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="readings.csv"'},
    )


def _serialize(value: object) -> object:
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, datetime):
        return to_utc_iso(value)
    return value


@router.get("/dump.json")
def full_dump(db: DbDep, _admin: AdminUser) -> Response:
    # Voll-Backup ist admin-only. Recorder-Filter wäre zwar machbar, aber
    # ein "halber Dump" ist als Backup-Artefakt nutzlos und semantisch
    # missverständlich. Wer Recorder-spezifische Daten exportieren will,
    # nimmt /export/readings.csv.
    points = list(
        db.scalars(
            select(MeasuringPoint).options(
                selectinload(MeasuringPoint.location),
                selectinload(MeasuringPoint.physical_meters)
                .selectinload(PhysicalMeter.registers)
                .selectinload(Register.readings),
            )
        )
    )

    payload = {
        "exported_at": to_utc_iso(datetime.now(UTC)),
        "measuring_points": [
            {
                "id": mp.id,
                "name": mp.name,
                "type": mp.type.value,
                # ``location`` ist seit dem Locations-Feature eine Relationship
                # (Location-ORM-Objekt), kein String mehr — den Namen
                # serialisieren, sonst kippt json.dumps mit TypeError (500).
                "location": mp.location.name if mp.location else None,
                "is_bidirectional": mp.is_bidirectional,
                "has_dual_tariff": mp.has_dual_tariff,
                "kostenstelle": mp.kostenstelle,
                "physical_meters": [
                    {
                        "id": m.id,
                        "serial_number": m.serial_number,
                        "installed_at": m.installed_at.isoformat(),
                        "removed_at": m.removed_at.isoformat() if m.removed_at else None,
                        "initial_values": m.initial_values,
                        "registers": [
                            {
                                "id": r.id,
                                "obis_code": r.obis_code,
                                "label": r.label,
                                "unit": r.unit,
                                "is_active": r.is_active,
                                "max_value": format(r.max_value, "f"),
                                "readings": [
                                    {
                                        "id": rd.id,
                                        "value": format(rd.value, "f"),
                                        "reading_at": to_utc_iso(rd.reading_at),
                                        "note": rd.note,
                                        "created_at": _serialize(rd.created_at),
                                        "created_by_user_id": rd.created_by_user_id,
                                    }
                                    for rd in r.readings
                                ],
                            }
                            for r in m.registers
                        ],
                    }
                    for m in mp.physical_meters
                ],
            }
            for mp in points
        ],
    }

    body = json.dumps(payload, ensure_ascii=False, indent=2)
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="meters-dump.json"'},
    )


@router.get("/backup.db.gz")
def full_backup(_admin: AdminUser) -> FileResponse:
    """Konsistenter, gzip-komprimierter Snapshot der SQLite-Datenbank (admin-only).

    Im Gegensatz zu :func:`full_dump` (menschenlesbarer Teil-Export als JSON) ist
    dies das echte, **verlustfreie** Voll-Backup — exakt die SQLite-Datei inkl.
    User/Sessions/Audit/Eigentümer/Standorte/Lieferungen/Monats-Cache. Erzeugt
    über SQLites Online-Backup-API (wie ``deploy/lxc/backup.sh``): WAL-sicher,
    blockiert keine laufenden Schreibvorgänge.

    Enthält bcrypt-Hashes und TOTP-Secrets → niemals an Nicht-Admins,
    ``Cache-Control: no-store``. Restore-Anleitung: ``deploy/lxc/README.md``.
    """
    db_path = engine.url.database
    if engine.dialect.name != "sqlite" or not db_path:
        raise ProblemError(
            status_code=409,
            title="Backup nur für SQLite-Datenbanken verfügbar",
        )
    src_path = Path(db_path)
    if not src_path.is_file():
        raise ProblemError(status_code=404, title="Datenbankdatei nicht gefunden")

    tmp_dir = Path(tempfile.mkdtemp(prefix="meters-backup-"))
    snapshot = tmp_dir / "snapshot.db"
    gz_path = tmp_dir / "backup.db.gz"

    # Konsistenter Hot-Snapshot über eine eigene Connection — die parallelen
    # Schreiber der App (WAL-Modus) bleiben unberührt.
    source = sqlite3.connect(str(src_path))
    try:
        dest = sqlite3.connect(str(snapshot))
        try:
            source.backup(dest)
        finally:
            dest.close()
    finally:
        source.close()

    with open(snapshot, "rb") as f_in, gzip.open(gz_path, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    snapshot.unlink(missing_ok=True)

    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")

    def _cleanup() -> None:
        # Temp-Verzeichnis samt gzip nach dem Senden wegräumen.
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return FileResponse(
        gz_path,
        media_type="application/gzip",
        filename=f"meters-{stamp}.db.gz",
        headers={"Cache-Control": "private, no-store"},
        background=BackgroundTask(_cleanup),
    )
