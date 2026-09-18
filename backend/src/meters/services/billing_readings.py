"""Zaehlerstaende zum Monatsende je Abrechnungsposition (Plan Phase 4b).

Entscheidung des Nutzers: es gilt immer der Stand zum Monatsende. Stand alt = Ende des Vormonats,
Stand neu = Ende des Monats. Liegt eine Ablesung auf dem Stichtag, ist es der echte Wert; sonst wird
taggenau interpoliert (``report_meter_readings.value_at``, gleiche Konvention wie die Auswertungen)
und gekennzeichnet. Warnung, wenn die naechste Ablesung weiter als ``billing_max_reading_gap_days``
entfernt ist oder auf einer Seite des Stichtags gar keine Ablesung liegt.

Staende wie am Display (Rohwert); kWh = (neu - alt) x Wandlerfaktor + Korrektur, wie im Rechenkern.
Die Korrektur uebernimmt zwei Sonderfaelle automatisch (mit Bemerkung):
- Zaehlertausch im Monat: Verbrauch der ausgebauten Geraete x deren Faktor; Stand alt/neu und
  Faktor gehoeren zum Geraet am Monatsende.
- Ueberlauf eines Registers (neu < alt bei gesetztem ``max_value``): ``max_value`` x Faktor.
Mehrere Bezugsregister eines Geraets (HT/NT) werden summiert. Interpolierte Staende werden auf
drei Nachkommastellen gerundet - Stand neu eines Monats ist so exakt Stand alt des Folgemonats.
"""

from __future__ import annotations

import calendar
from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from meters.core.config import settings
from meters.models import (
    BillingCircle,
    BillingPositionKind,
    MeasuringPoint,
    PhysicalMeter,
    Register,
)
from meters.schemas.billing_circle import BillingFinding
from meters.schemas.billing_readings import (
    BillingReadingRow,
    BillingReadingsRead,
    BillingStandRead,
)
from meters.services.billing_circle import positions_at
from meters.services.consumption import direction_of
from meters.services.report_meter_readings import RegisterSeries, register_series, value_at

Art = Literal["abgelesen", "interpoliert", "nur_davor", "nur_danach"]
_RANG: dict[str, int] = {"abgelesen": 0, "interpoliert": 1, "nur_davor": 2, "nur_danach": 2}
_STELLEN = Decimal("0.001")
SERIAL_SEPARATOR = " / "


@dataclass(frozen=True)
class Stand:
    wert: Decimal
    art: Art
    ablesung_vor: date | None
    ablesung_nach: date | None
    abstand_tage: int  # Abstand zur naechstgelegenen Ablesung, 0 = abgelesen


@dataclass(frozen=True)
class Geraet:
    serial_number: str
    transformer_factor: int | None
    installed_at: date
    removed_at: date | None
    registers: tuple[RegisterSeries, ...]


@dataclass
class Monatswerte:
    serial_numbers: str = ""
    transformer_factor: int | None = None
    stand_alt: Stand | None = None
    stand_neu: Stand | None = None
    korrektur_kwh: Decimal | None = None
    korrektur_notizen: list[str] = field(default_factory=list)
    kwh: Decimal | None = None
    befunde: list[tuple[str, str]] = field(default_factory=list)  # (code, Meldung)


def monatsgrenzen(monat: str) -> tuple[date, date]:
    """``JJJJ-MM`` -> (Ende Vormonat, Ende Monat)."""
    jahr, mon = (int(t) for t in monat.split("-"))
    erster = date(jahr, mon, 1)
    return erster - timedelta(days=1), date(jahr, mon, calendar.monthrange(jahr, mon)[1])


def _stand_register(series: RegisterSeries, tag: date) -> Stand | None:
    values = series.values
    if not values:
        return None
    idx = bisect_right(values, tag, key=lambda v: v.day)
    vor = values[idx - 1] if idx > 0 else None
    nach = values[idx] if idx < len(values) else None
    if vor is not None and vor.day == tag:
        return Stand(vor.value, "abgelesen", tag, tag, 0)
    if vor is not None and nach is not None:
        wert = value_at(series, tag).quantize(_STELLEN, rounding=ROUND_HALF_UP)
        abstand = min((tag - vor.day).days, (nach.day - tag).days)
        return Stand(wert, "interpoliert", vor.day, nach.day, abstand)
    if vor is not None:
        return Stand(vor.value, "nur_davor", vor.day, None, (tag - vor.day).days)
    assert nach is not None
    return Stand(nach.value, "nur_danach", None, nach.day, (nach.day - tag).days)


def stand_am(registers: Sequence[RegisterSeries], tag: date) -> tuple[Stand, list[Decimal]] | None:
    """Summe ueber die Register; Kennzeichnung = schlechteste Einzelkennzeichnung. Zusaetzlich die
    Einzelstaende (fuer die Ueberlauf-Pruefung je Register). ``None``, wenn ein Register gar keine
    Ablesung hat."""
    einzeln = [s for reg in registers if (s := _stand_register(reg, tag)) is not None]
    if not einzeln or len(einzeln) != len(registers):
        return None
    schlechteste = max(einzeln, key=lambda s: _RANG[s.art])
    vor = [s.ablesung_vor for s in einzeln if s.ablesung_vor is not None]
    nach = [s.ablesung_nach for s in einzeln if s.ablesung_nach is not None]
    summe = Stand(
        wert=sum((s.wert for s in einzeln), Decimal("0")),
        art=schlechteste.art,
        ablesung_vor=min(vor) if vor else None,
        ablesung_nach=max(nach) if nach else None,
        abstand_tage=max(s.abstand_tage for s in einzeln),
    )
    return summe, [s.wert for s in einzeln]


def _faktor(geraet: Geraet) -> Decimal:
    return Decimal(geraet.transformer_factor or 1)


def _differenz(geraet: Geraet, alt: list[Decimal], neu: list[Decimal]) -> tuple[Decimal, Decimal]:
    """(Rohdifferenz, Ueberlauf-Zuschlag) ueber alle Register, beides ohne Faktor."""
    roh = sum((n - a for a, n in zip(alt, neu, strict=True)), Decimal("0"))
    ueberlauf = sum(
        (
            reg.max_value
            for reg, a, n in zip(geraet.registers, alt, neu, strict=True)
            if n < a and reg.max_value > 0
        ),
        Decimal("0"),
    )
    return roh, ueberlauf


def _pruefe_stand(
    erg: Monatswerte, name: str, stand: Stand, max_abstand: int, zusatz: str = ""
) -> None:
    """Befund bei einseitig fehlender oder weit entfernter Ablesung. ``name`` bildet den Code
    (``stand_alt``, ``tausch_neu`` ...), ``zusatz`` ergaenzt die Meldung (z. B. Zaehlernummer)."""
    text = f"Stand {name.replace('_', ' ')}{zusatz}"
    if stand.art == "nur_davor":
        erg.befunde.append((f"{name}_ohne_folgeablesung", f"{text}: keine Ablesung danach."))
    elif stand.art == "nur_danach":
        erg.befunde.append((f"{name}_ohne_vorablesung", f"{text}: keine Ablesung davor."))
    elif stand.art == "interpoliert" and stand.abstand_tage > max_abstand:
        erg.befunde.append(
            (
                f"{name}_abstand",
                f"{text} interpoliert, naechste Ablesung {stand.abstand_tage} Tage entfernt.",
            )
        )


def monatswerte(
    geraete: Sequence[Geraet], alt_tag: date, neu_tag: date, max_abstand: int
) -> Monatswerte:
    """Staende, Korrektur und kWh einer Messstelle fuer den Monat ``(alt_tag, neu_tag]``."""
    erg = Monatswerte()
    im_monat = sorted(
        (
            g
            for g in geraete
            if g.registers
            and g.installed_at <= neu_tag
            and (g.removed_at is None or g.removed_at > alt_tag)
        ),
        key=lambda g: g.installed_at,
    )
    if not im_monat:
        erg.befunde.append(("ohne_zaehler", "Kein Zaehler mit Bezugsregister im Monat."))
        return erg
    erg.serial_numbers = SERIAL_SEPARATOR.join(dict.fromkeys(g.serial_number for g in im_monat))
    letzter = im_monat[-1]
    erg.transformer_factor = letzter.transformer_factor
    korrektur = Decimal("0")

    for geraet in im_monat[:-1]:  # ausgebaute Geraete: Verbrauch als Korrektur
        bis = min(geraet.removed_at or neu_tag, neu_tag)
        a = stand_am(geraet.registers, max(alt_tag, geraet.installed_at))
        e = stand_am(geraet.registers, bis)
        if a is None or e is None:
            erg.befunde.append(
                ("zaehlertausch_ohne_staende", f"Zaehler {geraet.serial_number}: keine Staende.")
            )
            continue
        # Staende des ausgebauten Geraets gehen ueber die Korrektur in die kWh ein - gleich pruefen.
        zusatz = f" (Zaehler {geraet.serial_number})"
        _pruefe_stand(erg, "tausch_alt", a[0], max_abstand, zusatz)
        _pruefe_stand(erg, "tausch_ausbau", e[0], max_abstand, zusatz)
        roh, ueberlauf = _differenz(geraet, a[1], e[1])
        kwh = (roh + ueberlauf) * _faktor(geraet)
        korrektur += kwh
        erg.korrektur_notizen.append(
            f"Zaehlertausch {bis:%d.%m.%Y}: {geraet.serial_number} "
            f"{a[0].wert} -> {e[0].wert} x {_faktor(geraet)} = {kwh} kWh"
        )
        erg.befunde.append(
            ("zaehlertausch", f"Zaehlertausch am {bis:%d.%m.%Y}; alter Zaehler als Korrektur.")
        )

    neu_bis = neu_tag
    if letzter.removed_at is not None and letzter.removed_at < neu_tag:
        neu_bis = letzter.removed_at
        erg.befunde.append(
            ("ausgebaut", f"Zaehler {letzter.serial_number} am {neu_bis:%d.%m.%Y} ausgebaut.")
        )
    alt = stand_am(letzter.registers, max(alt_tag, letzter.installed_at))
    neu = stand_am(letzter.registers, neu_bis)
    if alt is None or neu is None:
        erg.befunde.append(("ohne_ablesung", "Keine Ablesung fuer den Monatsend-Stand."))
        return erg
    erg.stand_alt, erg.stand_neu = alt[0], neu[0]
    if letzter.installed_at > alt_tag and len(im_monat) == 1:
        erg.befunde.append(
            (
                "zaehler_neu",
                f"Zaehler seit {letzter.installed_at:%d.%m.%Y}; Stand alt = Anfangsstand.",
            )
        )
    roh, ueberlauf = _differenz(letzter, alt[1], neu[1])
    if ueberlauf:
        korrektur += ueberlauf * _faktor(letzter)
        erg.korrektur_notizen.append(f"Ueberlauf: + {ueberlauf} x {_faktor(letzter)} kWh")
        erg.befunde.append(("ueberlauf", "Zaehlerueberlauf im Monat; als Korrektur enthalten."))
    _pruefe_stand(erg, "stand_alt", erg.stand_alt, max_abstand)
    _pruefe_stand(erg, "stand_neu", erg.stand_neu, max_abstand)
    if korrektur or erg.korrektur_notizen:
        erg.korrektur_kwh = korrektur
    erg.kwh = roh * _faktor(letzter) + korrektur
    if erg.kwh < 0:
        erg.befunde.append(("negativ", "Verbrauch negativ."))
    return erg


# --- Datenbank --------------------------------------------------------------------------------


def _geraete(mp: MeasuringPoint) -> list[Geraet]:
    return [
        Geraet(
            serial_number=pm.serial_number,
            transformer_factor=pm.transformer_factor,
            installed_at=pm.installed_at,
            removed_at=pm.removed_at,
            registers=tuple(
                register_series(reg)
                for reg in sorted(pm.registers, key=lambda r: r.id)
                if not reg.accepts_deliveries
                and reg.unit == "kWh"
                and direction_of(reg.obis_code) == "bezug"
            ),
        )
        for pm in mp.physical_meters
    ]


def _stand_read(stand: Stand | None) -> BillingStandRead | None:
    if stand is None:
        return None
    return BillingStandRead(
        wert=stand.wert,
        art=stand.art,
        ablesung_vor=stand.ablesung_vor,
        ablesung_nach=stand.ablesung_nach,
        abstand_tage=stand.abstand_tage,
    )


def readings_for_month(db: Session, circle: BillingCircle, monat: str) -> BillingReadingsRead:
    """Monatsend-Staende aller zum Monatsende gueltigen Positionen des Kreises."""
    alt_tag, neu_tag = monatsgrenzen(monat)
    max_abstand = settings.billing_max_reading_gap_days
    positionen = positions_at(db, circle.id, neu_tag)
    mp_ids = {p.measuring_point_id for p in positionen if p.measuring_point_id is not None}
    mps = {
        mp.id: mp
        for mp in db.scalars(
            select(MeasuringPoint)
            .where(MeasuringPoint.id.in_(mp_ids))
            .options(
                selectinload(MeasuringPoint.physical_meters)
                .selectinload(PhysicalMeter.registers)
                .selectinload(Register.readings)
            )
        )
    }
    zeilen: list[BillingReadingRow] = []
    befunde: list[BillingFinding] = []
    for p in positionen:
        mp = mps.get(p.measuring_point_id) if p.measuring_point_id is not None else None
        if p.kind is not BillingPositionKind.METER or mp is None:
            zeilen.append(BillingReadingRow(position_id=p.id, label=p.label, kind=p.kind))
            continue
        w = monatswerte(_geraete(mp), alt_tag, neu_tag, max_abstand)
        zeilen.append(
            BillingReadingRow(
                position_id=p.id,
                label=p.label,
                kind=p.kind,
                measuring_point_id=mp.id,
                measuring_point_name=mp.name,
                serial_numbers=w.serial_numbers,
                transformer_factor=w.transformer_factor,
                stand_alt=_stand_read(w.stand_alt),
                stand_neu=_stand_read(w.stand_neu),
                korrektur_kwh=w.korrektur_kwh,
                korrektur_note="; ".join(w.korrektur_notizen) or None,
                kwh=w.kwh,
            )
        )
        befunde.extend(
            BillingFinding(position_id=p.id, label=p.label, code=code, message=text)
            for code, text in w.befunde
        )
    return BillingReadingsRead(
        monat=monat,
        stichtag_alt=alt_tag,
        stichtag_neu=neu_tag,
        max_abstand_tage=max_abstand,
        positions=zeilen,
        findings=befunde,
    )
