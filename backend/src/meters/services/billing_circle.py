"""Regeln und Pruefbericht fuer Abrechnungskreise und -positionen.

Invarianten einer Position (je Gueltigkeitszeitraum, halboffen ``[valid_from, valid_to)``):
- ``meter``: Strom-Messstelle Pflicht; Empfaenger/Kostenstelle kommen aus der Messstelle.
  Empfaenger ist der Eigentuemer - oder der Mieter, wenn die Messstelle zum Stichtag
  "Abrechnen an Mieter" hat und einen Mieter hat (sonst wieder der Eigentuemer).
- ``rest``: ohne Messstelle, Empfaenger und Kostenstelle Pflicht, hoechstens eine je Kreis,
  kein Unterzaehler.
- Bezeichnung eindeutig im Kreis; eine Messstelle nur in einer Position (kreisuebergreifend).
- Unterzaehler: Hauptzaehler im selben Kreis, Art ``meter``, keine Ketten.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from meters.core.problem import ProblemError
from meters.models import (
    BillingCircle,
    BillingPosition,
    BillingPositionKind,
    BillTo,
    MeasuringPoint,
    MeterType,
    Mieter,
    MieterAssignment,
    Owner,
    OwnerAssignment,
    PhysicalMeter,
)
from meters.schemas.billing_circle import (
    BillingCheckRead,
    BillingCheckRow,
    BillingFinding,
    UnassignedMeterRead,
)
from meters.services.bill_to_assignment import bill_to_am
from meters.services.kostenstelle_assignment import kostenstellen_am

SORT_ORDER_MAX = 100000  # Obergrenze wie im Schema (``le=100000``)

FELDER = (
    "label",
    "kind",
    "sort_order",
    "measuring_point_id",
    "parent_position_id",
    "owner_id",
    "kostenstelle",
    "invoice_line",
    "note",
    "valid_from",
    "valid_to",
)


@dataclass
class PositionData:
    """Zielzustand einer Position (Neuanlage oder Position nach PATCH)."""

    label: str
    kind: BillingPositionKind
    sort_order: int
    measuring_point_id: int | None
    parent_position_id: int | None
    owner_id: int | None
    kostenstelle: int | None
    invoice_line: str | None
    note: str | None
    valid_from: date
    valid_to: date | None


def _fehler(detail: str) -> ProblemError:
    return ProblemError(status_code=422, title="Invalid billing position", detail=detail)


def _ueberlappend(
    stmt: Select[tuple[BillingPosition]], valid_from: date, valid_to: date | None
) -> Select[tuple[BillingPosition]]:
    """Filter auf Positionen, deren Zeitraum ``[valid_from, valid_to)`` schneidet."""
    stmt = stmt.where(
        or_(BillingPosition.valid_to.is_(None), BillingPosition.valid_to > valid_from)
    )
    if valid_to is not None:
        stmt = stmt.where(BillingPosition.valid_from < valid_to)
    return stmt


def _gilt_am(von: date, bis: date | None, stichtag: date) -> bool:
    return von <= stichtag and (bis is None or bis > stichtag)


def validate_position(
    db: Session, circle: BillingCircle, data: PositionData, position_id: int | None
) -> None:
    if data.valid_to is not None and data.valid_to <= data.valid_from:
        raise _fehler("valid_to muss nach valid_from liegen.")

    andere = _ueberlappend(select(BillingPosition), data.valid_from, data.valid_to)
    if position_id is not None:
        andere = andere.where(BillingPosition.id != position_id)

    if data.kind is BillingPositionKind.METER:
        if data.measuring_point_id is None:
            raise _fehler("Eine Zaehlerposition braucht eine Messstelle.")
        mp = db.get(MeasuringPoint, data.measuring_point_id)
        if mp is None:
            raise _fehler(f"Messstelle {data.measuring_point_id} existiert nicht.")
        if mp.type is not MeterType.ELECTRICITY:
            raise _fehler("Nur Strom-Messstellen koennen abgerechnet werden.")
        if data.owner_id is not None or data.kostenstelle is not None:
            raise _fehler(
                "Empfaenger und Kostenstelle einer Zaehlerposition kommen aus der Messstelle."
            )
        doppelt = db.scalars(
            andere.where(BillingPosition.measuring_point_id == data.measuring_point_id)
        ).first()
        if doppelt is not None:
            raise _fehler(
                f"Die Messstelle ist im selben Zeitraum bereits Position {doppelt.label!r} "
                f"(Kreis-ID {doppelt.circle_id})."
            )
    else:
        if data.measuring_point_id is not None or data.parent_position_id is not None:
            raise _fehler("Eine Restposition hat keine Messstelle und keinen Hauptzaehler.")
        if data.owner_id is None or data.kostenstelle is None:
            raise _fehler("Eine Restposition braucht Empfaenger und Kostenstelle.")
        if db.get(Owner, data.owner_id) is None:
            raise _fehler(f"Eigentuemer {data.owner_id} existiert nicht.")
        rest = db.scalars(
            andere.where(
                BillingPosition.circle_id == circle.id,
                BillingPosition.kind == BillingPositionKind.REST,
            )
        ).first()
        if rest is not None:
            raise _fehler(
                f"Der Kreis hat im selben Zeitraum bereits die Restposition {rest.label!r}."
            )

    gleicher_name = db.scalars(
        andere.where(BillingPosition.circle_id == circle.id, BillingPosition.label == data.label)
    ).first()
    if gleicher_name is not None:
        raise _fehler(f"Bezeichnung {data.label!r} ist im Kreis bereits vergeben.")

    hat_unterzaehler = position_id is not None and (
        db.scalars(
            select(BillingPosition.id).where(BillingPosition.parent_position_id == position_id)
        ).first()
        is not None
    )
    if data.kind is BillingPositionKind.REST and hat_unterzaehler:
        raise _fehler("Eine Position mit Unterzaehlern kann keine Restposition sein.")
    if data.parent_position_id is not None:
        if data.parent_position_id == position_id:
            raise _fehler("Eine Position kann nicht ihr eigener Hauptzaehler sein.")
        haupt = db.get(BillingPosition, data.parent_position_id)
        if haupt is None or haupt.circle_id != circle.id:
            raise _fehler("Der Hauptzaehler muss eine Position desselben Kreises sein.")
        if haupt.kind is not BillingPositionKind.METER or haupt.parent_position_id is not None:
            raise _fehler(
                "Der Hauptzaehler muss eine Zaehlerposition ohne eigenen Hauptzaehler sein."
            )
        if hat_unterzaehler:
            raise _fehler("Unterzaehler duerfen nicht verkettet werden.")


def positions_at(db: Session, circle_id: int, stichtag: date | None) -> list[BillingPosition]:
    stmt = select(BillingPosition).where(BillingPosition.circle_id == circle_id)
    if stichtag is not None:
        stmt = stmt.where(
            BillingPosition.valid_from <= stichtag,
            or_(BillingPosition.valid_to.is_(None), BillingPosition.valid_to > stichtag),
        )
    return list(db.scalars(stmt.order_by(BillingPosition.sort_order, BillingPosition.label)))


def invoice_line_for(
    position: BillingPosition, mieter_name: str | None, kostenstelle: int | None
) -> str | None:
    """Agrarmonitor-Rechnungszeile: frei gesetzt > Mieter > Kostenstelle."""
    if position.invoice_line:
        return position.invoice_line
    if mieter_name:
        return f"Strom (gewerblich) {mieter_name}"
    if kostenstelle is not None:
        return f"Strom (gewerblich) Kostenstelle {kostenstelle}"
    return None


def unassigned_meters(db: Session, stichtag: date) -> list[UnassignedMeterRead]:
    """Strom-Messstellen mit eingebautem Zaehler, die zum Stichtag in keinem Kreis abgerechnet
    werden (Plan Phase 4d: neue Strom-Messstellen ohne Zuordnung werden gemeldet)."""
    abgerechnet = select(BillingPosition.measuring_point_id).where(
        BillingPosition.measuring_point_id.is_not(None),
        BillingPosition.valid_from <= stichtag,
        or_(BillingPosition.valid_to.is_(None), BillingPosition.valid_to > stichtag),
    )
    eingebaut = select(PhysicalMeter.measuring_point_id).where(
        PhysicalMeter.installed_at <= stichtag,
        or_(PhysicalMeter.removed_at.is_(None), PhysicalMeter.removed_at >= stichtag),
    )
    stmt = (
        select(MeasuringPoint)
        .where(
            MeasuringPoint.type == MeterType.ELECTRICITY,
            MeasuringPoint.id.in_(eingebaut),
            MeasuringPoint.id.not_in(abgerechnet),
        )
        .options(selectinload(MeasuringPoint.physical_meters))  # sonst eine Query je Messstelle
        .order_by(MeasuringPoint.name)
    )
    return [
        UnassignedMeterRead(
            id=mp.id,
            name=mp.name,
            serial_numbers=" / ".join(
                dict.fromkeys(
                    pm.serial_number
                    for pm in mp.physical_meters
                    if pm.installed_at <= stichtag
                    and (pm.removed_at is None or pm.removed_at >= stichtag)
                )
            ),
        )
        for mp in db.scalars(stmt)
    ]


def _owners_am(db: Session, mp_ids: list[int], stichtag: date) -> dict[int, Owner]:
    """Eigentuemer je Messstelle zum Stichtag."""
    owners: dict[int, Owner] = {}
    if mp_ids:
        for a in db.scalars(
            select(OwnerAssignment).where(OwnerAssignment.measuring_point_id.in_(mp_ids))
        ):
            if _gilt_am(a.valid_from, a.valid_to, stichtag) and a.owner is not None:
                owners[a.measuring_point_id] = a.owner
    return owners


def _mieter_am(db: Session, mp_ids: list[int], stichtag: date) -> dict[int, Mieter]:
    """Mieter je Messstelle zum Stichtag."""
    mieter: dict[int, Mieter] = {}
    if mp_ids:
        for m in db.scalars(
            select(MieterAssignment).where(MieterAssignment.measuring_point_id.in_(mp_ids))
        ):
            if _gilt_am(m.valid_from, m.valid_to, stichtag) and m.mieter is not None:
                mieter[m.measuring_point_id] = m.mieter
    return mieter


@dataclass(frozen=True)
class Empfaenger:
    """Rechnungsempfaenger einer Position: Eigentuemer (``owner_id``) oder Mieter."""

    kind: BillTo
    name: str
    owner_id: int | None = None
    mieter_id: int | None = None
    internal_allocation: bool = False

    @staticmethod
    def von_owner(owner: Owner) -> Empfaenger:
        return Empfaenger(
            kind=BillTo.OWNER,
            name=owner.name,
            owner_id=owner.id,
            internal_allocation=owner.internal_allocation,
        )

    @staticmethod
    def von_mieter(mieter: Mieter) -> Empfaenger:
        return Empfaenger(kind=BillTo.MIETER, name=mieter.display_name, mieter_id=mieter.id)


@dataclass(frozen=True)
class _MpEmpfaenger:
    empfaenger: dict[int, Empfaenger]  # je Messstelle; fehlt = kein Empfaenger
    mieter: dict[int, Mieter]
    mieter_fehlt: set[int]  # "Abrechnen an Mieter", aber kein Mieter -> Eigentuemer


def _empfaenger_je_mp(db: Session, mp_ids: list[int], stichtag: date) -> _MpEmpfaenger:
    """Empfaenger je Messstelle zum Stichtag nach "Abrechnen an" (Standard Eigentuemer)."""
    owners = _owners_am(db, mp_ids, stichtag)
    mieter = _mieter_am(db, mp_ids, stichtag)
    an_mieter = {
        mp_id for mp_id, wert in bill_to_am(db, mp_ids, stichtag).items() if wert is BillTo.MIETER
    }
    empfaenger: dict[int, Empfaenger] = {}
    for mp_id in mp_ids:
        if mp_id in an_mieter and mp_id in mieter:
            empfaenger[mp_id] = Empfaenger.von_mieter(mieter[mp_id])
        elif mp_id in owners:
            empfaenger[mp_id] = Empfaenger.von_owner(owners[mp_id])
    return _MpEmpfaenger(empfaenger=empfaenger, mieter=mieter, mieter_fehlt=an_mieter - set(mieter))


def recipients_at(
    db: Session, positions: list[BillingPosition], stichtag: date
) -> dict[int, Empfaenger | None]:
    """Empfaenger je Position zum Stichtag: aus der Messstelle bzw. Eigentuemer der Restposition."""
    mp_ids = [p.measuring_point_id for p in positions if p.measuring_point_id is not None]
    je_mp = _empfaenger_je_mp(db, mp_ids, stichtag).empfaenger
    return {
        p.id: (
            je_mp.get(p.measuring_point_id)
            if p.measuring_point_id is not None
            else (Empfaenger.von_owner(p.owner) if p.owner is not None else None)
        )
        for p in positions
    }


def next_sort_order(db: Session, circle_id: int) -> int:
    """Reihenfolge fuer eine neue Position: ans Ende des Kreises."""
    hoechste = db.scalar(
        select(func.max(BillingPosition.sort_order)).where(BillingPosition.circle_id == circle_id)
    )
    return min((hoechste or 0) + 10, SORT_ORDER_MAX)


def reorder_positions(
    db: Session, circle: BillingCircle, position_ids: list[int]
) -> list[BillingPosition]:
    """Setzt die Reihenfolge aller Positionen des Kreises (10, 20, 30, ...).

    Die Liste muss jede Position des Kreises genau einmal enthalten (auch nicht mehr gueltige),
    sonst 422 - ein veralteter Browser-Stand soll nichts still vertauschen.
    """
    positionen = {p.id: p for p in positions_at(db, circle.id, None)}
    if len(position_ids) != len(set(position_ids)) or set(position_ids) != set(positionen):
        raise ProblemError(
            status_code=422,
            title="Invalid position order",
            detail="Die Reihenfolge muss jede Position des Kreises genau einmal enthalten "
            "- bitte die Seite neu laden.",
        )
    geordnet = [positionen[i] for i in position_ids]
    for index, position in enumerate(geordnet, start=1):
        position.sort_order = index * 10
    return geordnet


def check_circle(db: Session, circle: BillingCircle, stichtag: date) -> BillingCheckRead:
    """Loest die zum Stichtag gueltigen Positionen auf; meldet, was eine Abrechnung verhindert."""
    positionen = positions_at(db, circle.id, stichtag)
    mp_ids = [p.measuring_point_id for p in positionen if p.measuring_point_id is not None]

    je_mp = _empfaenger_je_mp(db, mp_ids, stichtag)
    zaehler: set[int] = set()
    if mp_ids:
        for pm in db.scalars(
            select(PhysicalMeter).where(PhysicalMeter.measuring_point_id.in_(mp_ids))
        ):
            eingebaut = pm.installed_at <= stichtag
            if eingebaut and (pm.removed_at is None or pm.removed_at >= stichtag):
                zaehler.add(pm.measuring_point_id)
    kst = kostenstellen_am(db, mp_ids, stichtag)
    aktive_ids = {p.id for p in positionen}

    zeilen: list[BillingCheckRow] = []
    befunde: list[BillingFinding] = []

    def befund(p: BillingPosition, code: str, text: str) -> None:
        befunde.append(BillingFinding(position_id=p.id, label=p.label, code=code, message=text))

    empfaenger_je_position: dict[int, Empfaenger] = {}
    for p in positionen:
        empfaenger: Empfaenger | None
        if p.kind is BillingPositionKind.METER and p.measuring_point_id is not None:
            empfaenger = je_mp.empfaenger.get(p.measuring_point_id)
            kostenstelle = kst.get(p.measuring_point_id)
            mieter = je_mp.mieter.get(p.measuring_point_id)
            mieter_name = mieter.display_name if mieter is not None else None
            if p.measuring_point_id not in zaehler:
                befund(p, "ohne_zaehler", "Messstelle hat zum Stichtag keinen eingebauten Zaehler.")
            if p.measuring_point_id in je_mp.mieter_fehlt:
                befund(
                    p,
                    "mieter_fehlt",
                    "Abrechnen an Mieter, aber zum Stichtag kein Mieter - "
                    "die Rechnung geht an den Eigentuemer.",
                )
        else:
            empfaenger = Empfaenger.von_owner(p.owner) if p.owner is not None else None
            kostenstelle = p.kostenstelle
            mieter_name = None
        if empfaenger is None:
            befund(p, "ohne_eigentuemer", "Kein Eigentuemer (Empfaenger) zum Stichtag.")
        else:
            empfaenger_je_position[p.id] = empfaenger
        if kostenstelle is None:
            befund(p, "ohne_kostenstelle", "Keine Kostenstelle zum Stichtag.")
        if p.parent_position_id is not None and p.parent_position_id not in aktive_ids:
            befund(p, "hauptzaehler_inaktiv", "Der Hauptzaehler ist zum Stichtag nicht gueltig.")
        zeilen.append(
            BillingCheckRow(
                position_id=p.id,
                label=p.label,
                kind=p.kind,
                measuring_point_id=p.measuring_point_id,
                measuring_point_name=p.measuring_point.name if p.measuring_point else None,
                parent_position_id=p.parent_position_id,
                owner_id=empfaenger.owner_id if empfaenger else None,
                owner_name=empfaenger.name if empfaenger else None,
                recipient_kind=empfaenger.kind if empfaenger else BillTo.OWNER,
                internal_allocation=bool(empfaenger and empfaenger.internal_allocation),
                kostenstelle=kostenstelle,
                mieter_name=mieter_name,
                invoice_line=invoice_line_for(p, mieter_name, kostenstelle),
            )
        )
    befunde += _mehrdeutige_empfaenger(positionen, empfaenger_je_position)
    if not positionen:
        befunde.append(
            BillingFinding(
                position_id=None,
                label=circle.code,
                code="keine_positionen",
                message="Der Kreis hat zum Stichtag keine Positionen.",
            )
        )
    return BillingCheckRead(stichtag=stichtag, positions=zeilen, findings=befunde)


def _mehrdeutige_empfaenger(
    positionen: list[BillingPosition], empfaenger: dict[int, Empfaenger]
) -> list[BillingFinding]:
    """Abrechnung und Uebertragung gruppieren nach Empfaengernamen. Tragen verschiedene
    Empfaenger denselben Namen (Mieter-Namen sind nicht eindeutig), fielen ihre Rechnungen
    still zusammen - das blockiert die Abrechnung, bis die Namen eindeutig sind."""
    je_name: dict[str, set[tuple[BillTo, int | None]]] = {}
    for e in empfaenger.values():
        wer = (e.kind, e.owner_id if e.kind is BillTo.OWNER else e.mieter_id)
        je_name.setdefault(e.name, set()).add(wer)
    doppelt = {name for name, wer in je_name.items() if len(wer) > 1}
    return [
        BillingFinding(
            position_id=p.id,
            label=p.label,
            code="empfaenger_mehrdeutig",
            message=f"Mehrere Empfaenger heissen '{empfaenger[p.id].name}' - "
            "bitte die Namen eindeutig machen.",
        )
        for p in positionen
        if p.id in empfaenger and empfaenger[p.id].name in doppelt
    ]
