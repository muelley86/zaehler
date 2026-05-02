"""OBIS-Register-Konfiguration pro Messstellentyp.

Die Register werden bei der Anlage einer ``MeasuringPoint`` (bzw. ihres
ersten ``PhysicalMeter``) und bei jedem Zählerwechsel auf Basis dieser
Tabelle abgeleitet.
"""

from __future__ import annotations

from dataclasses import dataclass

from meters.models import MeterType


@dataclass(frozen=True, slots=True)
class RegisterDef:
    obis_code: str
    label: str
    unit: str
    accepts_deliveries: bool = False


_KWH = "kWh"
_M3 = "m³"
_HOURS = "h"
_LITER = "L"


def registers_for(
    meter_type: MeterType,
    *,
    is_bidirectional: bool = False,
    has_dual_tariff: bool = False,
) -> list[RegisterDef]:
    if meter_type is MeterType.ELECTRICITY:
        return _electricity(is_bidirectional=is_bidirectional, has_dual_tariff=has_dual_tariff)
    if meter_type is MeterType.GAS:
        return [RegisterDef("7.8.0", "Verbrauch", _M3)]
    if meter_type is MeterType.WATER:
        return [RegisterDef("water", "Verbrauch", _M3)]
    if meter_type is MeterType.OIL:
        return [
            RegisterDef("oil.hours", "Betriebsstunden", _HOURS),
            RegisterDef("oil.tank", "Tankstand", _LITER, accepts_deliveries=True),
        ]
    raise ValueError(f"Unbekannter MeterType: {meter_type!r}")


def _electricity(*, is_bidirectional: bool, has_dual_tariff: bool) -> list[RegisterDef]:
    out: list[RegisterDef] = []
    if has_dual_tariff:
        out.append(RegisterDef("1.8.1", "Bezug HT", _KWH))
        out.append(RegisterDef("1.8.2", "Bezug NT", _KWH))
        if is_bidirectional:
            out.append(RegisterDef("2.8.1", "Einspeisung HT", _KWH))
            out.append(RegisterDef("2.8.2", "Einspeisung NT", _KWH))
    else:
        out.append(RegisterDef("1.8.0", "Bezug", _KWH))
        if is_bidirectional:
            out.append(RegisterDef("2.8.0", "Einspeisung", _KWH))
    return out
