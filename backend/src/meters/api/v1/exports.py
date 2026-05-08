"""Datenexport: CSV-Liste aller Erfassungen und ein vollständiger JSON-Dump.

Die JSON-Variante ist als Komplett-Backup gedacht (z. B. wenn man das Tool
mal woanders aufsetzen will) — die DB-Datei selbst bleibt aber das primäre
Backup-Artefakt (siehe ``deploy/lxc/backup.sh``).
"""

from __future__ import annotations

import csv
import io
import json
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from meters.api.deps import AdminUser, CurrentUser, DbDep
from meters.models import (
    MeasuringPoint,
    PhysicalMeter,
    Reading,
    Register,
    UserRole,
)
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
    writer = csv.writer(buffer, lineterminator="\n")
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
                format(r.value, "f"),
                register.unit,
                register.obis_code,
                register.id,
                meter.id,
                meter.serial_number,
                meter.measuring_point_id,
                r.note or "",
                _format_de(r.created_at, with_seconds=True),
                r.created_by.username if r.created_by else "",
            ]
        )

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="readings.csv"'},
    )


def _serialize(value: object) -> object:
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, datetime):
        return value.isoformat()
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
                selectinload(MeasuringPoint.physical_meters)
                .selectinload(PhysicalMeter.registers)
                .selectinload(Register.readings),
            )
        )
    )

    payload = {
        "exported_at": datetime.now(UTC).isoformat(),
        "measuring_points": [
            {
                "id": mp.id,
                "name": mp.name,
                "type": mp.type.value,
                "location": mp.location,
                "is_bidirectional": mp.is_bidirectional,
                "has_dual_tariff": mp.has_dual_tariff,
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
                                        "reading_at": rd.reading_at.isoformat(),
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
