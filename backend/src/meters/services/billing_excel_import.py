"""Excel-Weg (Plan Phase 6): Monats-JSON der Stromabrechnung in einen Entwurf uebernehmen.

Quelle ist die Eingabedatei des Excel-Generators (``tools/data/JJJJ-MM_<Kreis>.json``, Format
``docs/DATENFORMAT.md`` der Stromabrechnung) bzw. das daraus mit ``uebernahme`` erzeugte JSON einer
von Hand befuellten Mappe. Zuordnung ueber die Bezeichnung (= Label der Abrechnungsposition).

Ablauf: erst Vorschau (nichts wird geaendert), dann Uebernahme. Uebernommen werden nur Zeilen, deren
Werte von den (effektiven) Werten des Laufs abweichen: je Feld wird ein manueller Wert gesetzt, wenn
der Excel-Wert vom App-Wert abweicht, sonst der manuelle Wert entfernt; Begruendung
"Excel-Monatsdatei: <Bemerkung>". Zeilen ohne Abweichung bleiben unberuehrt - auch vorhandene
manuelle Werte. Nicht abbildbar sind ``kwh`` (Verbrauch ohne Zaehler) und unvollstaendige Staende;
sie werden nur gemeldet. Zusatzkosten und Aufschlaege der Datei werden mit uebernommen.

Die Datei muss zum Lauf passen (Monat, Jahr, Rechnungsnummer und Nettobetrag), sonst 422.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from meters.core.problem import ProblemError
from meters.models import BillingInvoice, BillingPositionKind, BillingRun
from meters.models.billing_run import BillingRunLine
from meters.schemas.billing_excel import (
    BillingExcelImportRead,
    ExcelImportLine,
    ExcelImportParameter,
    ParameterFeld,
)
from meters.services.billing_transfer import MONATE

MAX_JSON_BYTES = 1024 * 1024
_NULL = Decimal("0")
_STAND_MAX = Decimal("1e12")
_NOTIZ_PRAEFIX = "Excel-Monatsdatei"
# Grenzen wie ``BillingRunCreate``.
_PARAMETER: tuple[tuple[ParameterFeld, Decimal, Decimal], ...] = (
    ("zusatzkosten", Decimal("-1000000"), Decimal("1000000")),
    ("aufschlag_prozent", _NULL, Decimal("1")),
    ("aufschlag_ct", Decimal("-100"), Decimal("100")),
)

Werte = tuple[Decimal, Decimal, Decimal]


def _fehler(detail: str) -> ProblemError:
    return ProblemError(status_code=422, title="Monthly file not usable", detail=detail)


def _keine_konstante(name: str) -> Any:
    raise ValueError(f"{name} ist keine Zahl")


def lies_monats_json(daten: bytes) -> dict[str, Any]:
    try:
        roh = json.loads(
            daten.decode("utf-8-sig"), parse_float=Decimal, parse_constant=_keine_konstante
        )
    except RecursionError as exc:  # tief verschachtelt: kein Monats-JSON, kein 500er
        raise _fehler("Keine gueltige JSON-Datei: zu tief verschachtelt.") from exc
    except (UnicodeDecodeError, ValueError) as exc:
        raise _fehler(f"Keine gueltige JSON-Datei: {exc}") from exc
    if not isinstance(roh, dict):
        raise _fehler("Die Datei enthaelt kein JSON-Objekt.")
    return roh


def _zahl(wert: Any, wo: str, minimum: Decimal, maximum: Decimal) -> Decimal | None:
    if wert is None or wert == "":
        return None
    if isinstance(wert, bool) or not isinstance(wert, int | Decimal):
        raise _fehler(f"{wo}: {wert!r} ist keine Zahl.")
    zahl = Decimal(wert)
    if not minimum <= zahl <= maximum:
        raise _fehler(f"{wo}: {zahl} liegt ausserhalb von {minimum} bis {maximum}.")
    return zahl


def _pruefe_kopf(roh: dict[str, Any], run: BillingRun, invoice: BillingInvoice) -> None:
    jahr, mon = (int(t) for t in run.monat.split("-"))
    if roh.get("monat") != MONATE[mon - 1] or roh.get("jahr") != jahr:
        raise _fehler(
            f"Die Datei gilt fuer {roh.get('monat')} {roh.get('jahr')}, der Lauf fuer "
            f"{MONATE[mon - 1]} {jahr}."
        )
    rechnung = roh.get("rechnung")
    if not isinstance(rechnung, dict):
        raise _fehler("Die Datei enthaelt keine Rechnung.")
    betrag = _zahl(rechnung.get("betrag_netto"), "Rechnung", -_STAND_MAX, _STAND_MAX)
    if rechnung.get("nummer") != invoice.nummer or betrag != invoice.betrag_netto:
        raise _fehler(
            f"Rechnung der Datei ({rechnung.get('nummer')}, {betrag} EUR) passt nicht zur "
            f"Rechnung des Laufs ({invoice.nummer}, {invoice.betrag_netto} EUR)."
        )


def _parameter(roh: dict[str, Any], run: BillingRun) -> list[ExcelImportParameter]:
    aenderungen = []
    for feld, minimum, maximum in _PARAMETER:
        excel = _zahl(roh.get(feld, 0), feld, minimum, maximum) or _NULL
        app: Decimal = getattr(run, feld)
        if excel != app:
            aenderungen.append(ExcelImportParameter(feld=feld, app=app, excel=excel))
    return aenderungen


def _app_werte(z: BillingRunLine) -> tuple[Decimal | None, Decimal | None, Decimal]:
    return z.effektiv_stand_alt, z.effektiv_stand_neu, z.effektiv_korrektur or _NULL


def _zeile(z: BillingRunLine, eintrag: Any) -> tuple[ExcelImportLine, Werte | None]:
    """Vergleich einer Zeile; liefert die Excel-Werte, wenn sie uebernommen werden sollen."""
    if not isinstance(eintrag, dict):
        raise _fehler(f"{z.label}: Eintrag ist kein Objekt.")
    alt, neu, korrektur = _app_werte(z)
    e_alt = _zahl(eintrag.get("stand_alt"), f"{z.label} Stand alt", _NULL, _STAND_MAX)
    e_neu = _zahl(eintrag.get("stand_neu"), f"{z.label} Stand neu", _NULL, _STAND_MAX)
    e_korr = _zahl(eintrag.get("korrektur"), f"{z.label} Korrektur", -_STAND_MAX, _STAND_MAX)
    zeile = ExcelImportLine(
        label=z.label,
        status="gleich",
        app_stand_alt=alt,
        app_stand_neu=neu,
        app_korrektur=korrektur,
        excel_stand_alt=e_alt,
        excel_stand_neu=e_neu,
        excel_korrektur=e_korr,
    )
    if eintrag.get("kwh") not in (None, ""):
        zeile.status = "nicht_uebernehmbar"
        zeile.hinweis = "Verbrauch ohne Zaehlerstaende (kwh) ist in der App nicht abbildbar."
        return zeile, None
    if e_alt is None or e_neu is None:
        zeile.status = "nicht_uebernehmbar"
        zeile.hinweis = "Stand alt und Stand neu werden beide benoetigt."
        return zeile, None
    excel = (e_alt, e_neu, e_korr or _NULL)
    if excel == (alt, neu, korrektur):
        return zeile, None
    zeile.status = "abweichend"
    if z.manual_note is not None:
        zeile.hinweis = f"Ersetzt den manuellen Wert (Begruendung: {z.manual_note})."
    return zeile, excel


def _notiz(eintrag: dict[str, Any]) -> str:
    bemerkung = eintrag.get("bemerkung")
    if isinstance(bemerkung, str) and bemerkung.strip():
        return f"{_NOTIZ_PRAEFIX}: {bemerkung.strip()}"[:500]
    return f"{_NOTIZ_PRAEFIX} uebernommen"


def _setze(z: BillingRunLine, excel: Werte, notiz: str) -> None:
    """Manueller Wert nur, wo Excel vom App-Wert abweicht; sonst gilt wieder der App-Wert."""
    e_alt, e_neu, e_korr = excel
    z.manual_stand_alt = e_alt if e_alt != z.stand_alt else None
    z.manual_stand_neu = e_neu if e_neu != z.stand_neu else None
    z.manual_korrektur_kwh = e_korr if e_korr != (z.korrektur_kwh or _NULL) else None
    gesetzt = (z.manual_stand_alt, z.manual_stand_neu, z.manual_korrektur_kwh)
    z.manual_note = notiz if any(w is not None for w in gesetzt) else None


def excel_import(
    run: BillingRun, invoice: BillingInvoice, roh: dict[str, Any], *, uebernehmen: bool
) -> BillingExcelImportRead:
    """Vorschau bzw. Uebernahme; der Aufrufer rechnet danach neu und schreibt das Audit-Log."""
    _pruefe_kopf(roh, run, invoice)
    verbraucher = roh.get("verbraucher", {})
    if not isinstance(verbraucher, dict):
        raise _fehler("'verbraucher' ist kein Objekt.")
    parameter = _parameter(roh, run)
    zeilen: list[ExcelImportLine] = []
    uebernahme: list[tuple[BillingRunLine, Werte, str]] = []
    for z in sorted(run.lines, key=lambda z: z.sort_order):
        if z.kind is BillingPositionKind.REST:
            zeilen.append(ExcelImportLine(label=z.label, status="rest"))
        elif z.label not in verbraucher:
            alt, neu, korrektur = _app_werte(z)
            zeilen.append(
                ExcelImportLine(
                    label=z.label,
                    status="fehlt_in_datei",
                    app_stand_alt=alt,
                    app_stand_neu=neu,
                    app_korrektur=korrektur,
                )
            )
        else:
            zeile, excel = _zeile(z, verbraucher[z.label])
            zeilen.append(zeile)
            if excel is not None:
                uebernahme.append((z, excel, _notiz(verbraucher[z.label])))
    bekannt = {z.label for z in run.lines}
    zeilen += [
        ExcelImportLine(
            label=str(name)[:120],
            status="unbekannt",
            hinweis="Keine Position mit dieser Bezeichnung.",
        )
        for name in verbraucher
        if name not in bekannt
    ]
    if uebernehmen:
        for z, excel, notiz in uebernahme:
            _setze(z, excel, notiz)
        for p in parameter:
            setattr(run, p.feld, p.excel)
    return BillingExcelImportRead(uebernommen=uebernehmen, zeilen=zeilen, parameter=parameter)
