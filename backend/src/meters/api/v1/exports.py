"""Datenexport: CSV-Liste aller Erfassungen und ein vollständiger JSON-Dump.

Die JSON-Variante ist als Komplett-Backup gedacht (z. B. wenn man das Tool
mal woanders aufsetzen will) — die DB-Datei selbst bleibt aber das primäre
Backup-Artefakt (siehe ``deploy/lxc/backup.sh``).
"""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from meters.api.deps import CurrentUser, DbDep
from meters.models import (
    MeasuringPoint,
    PhysicalMeter,
    Reading,
    Register,
)

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/readings.csv")
def readings_csv(db: DbDep, _user: CurrentUser) -> StreamingResponse:
    rows = list(
        db.scalars(
            select(Reading)
            .options(
                selectinload(Reading.register).selectinload(Register.physical_meter),
                selectinload(Reading.created_by),
            )
            .order_by(Reading.reading_at, Reading.id)
        )
    )

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
                r.reading_at.isoformat(),
                format(r.value, "f"),
                register.unit,
                register.obis_code,
                register.id,
                meter.id,
                meter.serial_number,
                meter.measuring_point_id,
                r.note or "",
                r.created_at.isoformat(),
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
def full_dump(db: DbDep, _user: CurrentUser) -> Response:
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
        "exported_at": datetime.utcnow().isoformat(),
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
