"""Import der Stromabrechnungs-Stammdaten in Abrechnungskreise (Plan-Schritt 2d).

Ablauf je Kreis: Kreis anlegen/aktualisieren -> je Position Messstelle ueber die Zaehlernummer des
aktiven Zaehlers finden (nie ueber Namen), Eigentuemer ueber den normalisierten Namen -> Position
anlegen/aktualisieren (gueltig ab ``valid_from``) -> fehlende Eigentuemer- und Kostenstellen-
Zuordnung der Messstelle ab ``valid_from`` nachtragen -> Unterzaehler setzen. Abweichungen zwischen
App und Stammdaten (Eigentuemer, Kostenstelle, Wandlerfaktor) werden nur gemeldet.

Der Aufrufer entscheidet ueber commit (Uebernahme) oder rollback (Vorschau) - beide Wege fuehren
denselben Code aus, die Vorschau zeigt also genau, was die Uebernahme tut.
"""

from __future__ import annotations

import re
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    BillingCircle,
    BillingPosition,
    BillingPositionKind,
    MeterType,
    Owner,
    OwnerAssignment,
    PhysicalMeter,
)
from meters.schemas.billing_import import (
    ImportCircle,
    ImportEntry,
    ImportLevel,
    ImportPosition,
    StammdatenImport,
)
from meters.services.audit import record
from meters.services.billing_circle import PositionData, positions_at, validate_position
from meters.services.kostenstelle_assignment import create_assignment as create_kst_assignment
from meters.services.kostenstelle_assignment import kostenstellen_am
from meters.services.owner_assignment import create_assignment as create_owner_assignment


def serial_key(value: str | None) -> str | None:
    """Zaehlernummer als Vergleichsschluessel: ohne Leerraum, gross, ohne fuehrende Nullen."""
    if value is None:
        return None
    text = re.sub(r"\s", "", value).upper()
    return (text.lstrip("0") or "0") if text else None


def name_key(value: str) -> str:
    """Firmenname als Vergleichsschluessel: Kleinschreibung, nur Buchstaben, Ziffern und &."""
    return re.sub(r"[^\w&]|_", "", value.casefold())


class _Importer:
    def __init__(self, db: Session, valid_from: date, user_id: int, ip_address: str | None) -> None:
        self.db = db
        self.stichtag = valid_from
        self.user_id = user_id
        self.ip = ip_address
        self.entries: list[ImportEntry] = []
        self.owners: dict[str, list[Owner]] = {}
        for owner in db.scalars(select(Owner)):
            self.owners.setdefault(name_key(owner.name), []).append(owner)
        self.meters: dict[str, list[PhysicalMeter]] = {}
        for meter in db.scalars(select(PhysicalMeter).where(PhysicalMeter.removed_at.is_(None))):
            key = serial_key(meter.serial_number)
            if key:
                self.meters.setdefault(key, []).append(meter)

    # --- Hilfen ---------------------------------------------------------------------------------

    def _add(self, level: ImportLevel, circle: str, label: str | None, message: str) -> None:
        self.entries.append(ImportEntry(level=level, circle=circle, label=label, message=message))

    def _audit(
        self, action: AuditAction, entity: AuditEntityType, entity_id: int, diff: dict[str, object]
    ) -> None:
        record(
            self.db,
            user_id=self.user_id,
            action=action,
            entity_type=entity,
            entity_id=entity_id,
            diff=diff | {"quelle": "stammdaten-import"},
            ip_address=self.ip,
        )

    # --- Kreis ----------------------------------------------------------------------------------

    def run_circle(self, data: ImportCircle) -> None:
        circle = self.db.scalar(select(BillingCircle).where(BillingCircle.code == data.code))
        if circle is None:
            circle = BillingCircle(
                code=data.code,
                name=data.name,
                rechnungsleger=data.rechnungsleger,
                abnahmestelle=data.abnahmestelle,
                marktlokation=data.marktlokation,
            )
            self.db.add(circle)
            self.db.flush()
            self._audit(
                AuditAction.CREATE, AuditEntityType.BILLING_CIRCLE, circle.id, {"code": data.code}
            )
            self._add("aktion", data.code, None, "Abrechnungskreis angelegt")
        else:
            # Rechnungsleger/Abnahmestelle eines bestehenden Kreises nie per Import ueberschreiben
            # (ein falscher Code in der Datei traefe sonst still den falschen Kreis).
            for feld, text in (
                ("rechnungsleger", "Rechnungsleger"),
                ("abnahmestelle", "Abnahmestelle"),
            ):
                app, datei = getattr(circle, feld), getattr(data, feld)
                if app != datei:
                    self._add(
                        "hinweis",
                        data.code,
                        None,
                        f"{text} App „{app}“, Datei „{datei}“ - nicht geändert",
                    )
            if circle.marktlokation is None and data.marktlokation is not None:
                circle.marktlokation = data.marktlokation
                self._audit(
                    AuditAction.UPDATE,
                    AuditEntityType.BILLING_CIRCLE,
                    circle.id,
                    {"marktlokation": {"from": None, "to": data.marktlokation}},
                )
                self._add("aktion", data.code, None, "Marktlokation nachgetragen")
            elif data.marktlokation not in (None, circle.marktlokation):
                self._add(
                    "hinweis",
                    data.code,
                    None,
                    f"Marktlokation App {circle.marktlokation}, Datei {data.marktlokation}"
                    " - nicht geändert",
                )

        vorhanden = {p.label: p for p in positions_at(self.db, circle.id, self.stichtag)}
        verarbeitet: dict[str, BillingPosition] = {}
        for position in data.positions:
            ergebnis = self._position(circle, position, vorhanden.get(position.label))
            if ergebnis is not None:
                verarbeitet[position.label] = ergebnis
        for position in data.positions:
            if position.label in verarbeitet:
                self._parent(circle, position, verarbeitet, vorhanden)
        importiert = {p.label for p in data.positions}
        for label in vorhanden:
            if label not in importiert:
                self._add(
                    "hinweis",
                    circle.code,
                    label,
                    "nicht mehr in den Stammdaten - unverändert (ggf. „Gültig bis“ setzen)",
                )

    # --- Position -------------------------------------------------------------------------------

    def _owner(self, circle: str, p: ImportPosition) -> Owner | None:
        treffer = self.owners.get(name_key(p.owner_name), [])
        if len(treffer) != 1:
            grund = "fehlt in der App" if not treffer else "ist mehrdeutig"
            self._add("fehler", circle, p.label, f"Eigentümer „{p.owner_name}“ {grund}")
            return None
        owner = treffer[0]
        if p.internal_allocation and not owner.internal_allocation:
            owner.internal_allocation = True
            self._audit(
                AuditAction.UPDATE,
                AuditEntityType.OWNER,
                owner.id,
                {"internal_allocation": {"from": False, "to": True}},
            )
            self._add("aktion", circle, p.label, f"„{owner.name}“ als interne Umlage markiert")
        return owner

    def _meter(self, circle: str, p: ImportPosition) -> PhysicalMeter | None:
        key = serial_key(p.serial_number)
        if key is None:
            self._add(
                "fehler",
                circle,
                p.label,
                "ohne Zählernummer - Messstelle in der App anlegen und Zählernummer in den "
                "Stammdaten ergänzen",
            )
            return None
        treffer = self.meters.get(key, [])
        if len(treffer) != 1:
            grund = (
                "keine Messstelle mit aktivem Zähler" if not treffer else "mehrere Messstellen mit"
            )
            self._add("fehler", circle, p.label, f"{grund} Zählernummer {p.serial_number}")
            return None
        meter = treffer[0]
        if meter.measuring_point.type is not MeterType.ELECTRICITY:
            self._add(
                "fehler", circle, p.label, f"Zählernummer {p.serial_number} ist kein Stromzähler"
            )
            return None
        return meter

    def _position(
        self, circle: BillingCircle, p: ImportPosition, bestehend: BillingPosition | None
    ) -> BillingPosition | None:
        code = circle.code
        owner = self._owner(code, p)
        if owner is None:
            return None
        meter: PhysicalMeter | None = None
        if p.kind is BillingPositionKind.METER:
            meter = self._meter(code, p)
            if meter is None:
                return None
        elif p.kostenstelle is None:
            self._add("fehler", code, p.label, "Restposition ohne Kostenstelle")
            return None

        mp_id = meter.measuring_point_id if meter else None
        rest_owner = owner.id if meter is None else None
        rest_kst = p.kostenstelle if meter is None else None
        ziel: dict[str, object] = {
            "kind": p.kind,
            "sort_order": p.sort_order,
            "measuring_point_id": mp_id,
            "owner_id": rest_owner,
            "kostenstelle": rest_kst,
            "note": p.note,
        }
        # Hauptzaehler setzt erst der zweite Durchlauf; hier nur den bestehenden beibehalten,
        # sofern die Stammdaten weiterhin einen nennen.
        parent = bestehend.parent_position_id if bestehend and p.parent_label else None
        daten = PositionData(
            label=p.label,
            kind=p.kind,
            sort_order=p.sort_order,
            measuring_point_id=mp_id,
            parent_position_id=parent,
            owner_id=rest_owner,
            kostenstelle=rest_kst,
            invoice_line=bestehend.invoice_line if bestehend else None,
            note=p.note,
            valid_from=bestehend.valid_from if bestehend else self.stichtag,
            valid_to=bestehend.valid_to if bestehend else None,
        )
        try:
            validate_position(self.db, circle, daten, bestehend.id if bestehend else None)
        except ProblemError as exc:
            self._add("fehler", code, p.label, exc.detail or exc.title)
            return None

        if meter is not None:
            self._zuordnungen(code, p, meter, owner)

        if bestehend is None:
            position = BillingPosition(
                circle_id=circle.id,
                label=p.label,
                kind=p.kind,
                sort_order=p.sort_order,
                measuring_point_id=mp_id,
                owner_id=rest_owner,
                kostenstelle=rest_kst,
                note=p.note,
                valid_from=self.stichtag,
            )
            self.db.add(position)
            self.db.flush()
            self._audit(
                AuditAction.CREATE,
                AuditEntityType.BILLING_POSITION,
                position.id,
                {"label": p.label, "circle_id": circle.id},
            )
            self._add(
                "aktion", code, p.label, f"Position angelegt (gültig ab {self.stichtag:%d.%m.%Y})"
            )
            return position

        diff: dict[str, object] = {
            k: {"from": str(getattr(bestehend, k)), "to": str(v)}
            for k, v in ziel.items()
            if getattr(bestehend, k) != v
        }
        if diff:
            for name, wert in ziel.items():
                setattr(bestehend, name, wert)
            self._audit(AuditAction.UPDATE, AuditEntityType.BILLING_POSITION, bestehend.id, diff)
            self._add("aktion", code, p.label, f"Position aktualisiert ({', '.join(diff)})")
        return bestehend

    def _zuordnungen(
        self, code: str, p: ImportPosition, meter: PhysicalMeter, owner: Owner
    ) -> None:
        mp_id = meter.measuring_point_id
        tag = self.stichtag
        app_faktor = meter.transformer_factor or 1
        if p.transformer_factor is not None and app_faktor != p.transformer_factor:
            self._add(
                "hinweis",
                code,
                p.label,
                f"Wandlerfaktor App {app_faktor}, Stammdaten {p.transformer_factor}"
                " - nicht geändert",
            )

        zuordnung = self.db.scalar(
            select(OwnerAssignment).where(
                OwnerAssignment.measuring_point_id == mp_id,
                OwnerAssignment.valid_from <= tag,
                or_(OwnerAssignment.valid_to.is_(None), OwnerAssignment.valid_to > tag),
            )
        )
        if zuordnung is None:
            try:
                create_owner_assignment(
                    self.db,
                    mp_id=mp_id,
                    owner_id=owner.id,
                    valid_from=tag,
                    valid_to=None,
                    user_id=self.user_id,
                    ip_address=self.ip,
                )
                self._add("aktion", code, p.label, f"Eigentümer „{owner.name}“ zugeordnet")
            except ProblemError as exc:
                if exc.status_code == 409:  # Guard hat die Transaktion zurueckgerollt
                    raise
                self._add("hinweis", code, p.label, f"Eigentümer nicht zugeordnet: {exc.detail}")
        elif zuordnung.owner_id != owner.id:
            app = zuordnung.owner.name if zuordnung.owner else "unbekannt"
            self._add(
                "hinweis",
                code,
                p.label,
                f"Eigentümer App „{app}“, Stammdaten „{owner.name}“ - nicht geändert",
            )

        if p.kostenstelle is None:
            return
        app_kst = kostenstellen_am(self.db, [mp_id], tag).get(mp_id)
        if app_kst is None:
            try:
                create_kst_assignment(
                    self.db,
                    mp_id=mp_id,
                    kostenstelle=p.kostenstelle,
                    valid_from=tag,
                    valid_to=None,
                    user_id=self.user_id,
                    ip_address=self.ip,
                )
                self._add("aktion", code, p.label, f"Kostenstelle {p.kostenstelle} zugeordnet")
            except ProblemError as exc:
                if exc.status_code == 409:
                    raise
                self._add("hinweis", code, p.label, f"Kostenstelle nicht zugeordnet: {exc.detail}")
        elif app_kst != p.kostenstelle:
            self._add(
                "hinweis",
                code,
                p.label,
                f"Kostenstelle App {app_kst}, Stammdaten {p.kostenstelle} - nicht geändert",
            )

    # --- Unterzaehler ---------------------------------------------------------------------------

    def _parent(
        self,
        circle: BillingCircle,
        p: ImportPosition,
        verarbeitet: dict[str, BillingPosition],
        vorhanden: dict[str, BillingPosition],
    ) -> None:
        position = verarbeitet[p.label]
        haupt: BillingPosition | None = None
        if p.parent_label is not None:
            haupt = verarbeitet.get(p.parent_label) or vorhanden.get(p.parent_label)
            if haupt is None:
                self._add("fehler", circle.code, p.label, f"Hauptzähler „{p.parent_label}“ fehlt")
                return
        ziel_id = haupt.id if haupt else None
        if position.parent_position_id == ziel_id:
            return
        daten = PositionData(
            label=position.label,
            kind=position.kind,
            sort_order=position.sort_order,
            measuring_point_id=position.measuring_point_id,
            parent_position_id=ziel_id,
            owner_id=position.owner_id,
            kostenstelle=position.kostenstelle,
            invoice_line=position.invoice_line,
            note=position.note,
            valid_from=position.valid_from,
            valid_to=position.valid_to,
        )
        try:
            validate_position(self.db, circle, daten, position.id)
        except ProblemError as exc:
            self._add("fehler", circle.code, p.label, exc.detail or exc.title)
            return
        self._audit(
            AuditAction.UPDATE,
            AuditEntityType.BILLING_POSITION,
            position.id,
            {"parent_position_id": {"from": position.parent_position_id, "to": ziel_id}},
        )
        position.parent_position_id = ziel_id
        text = f"Unterzähler von „{haupt.label}“" if haupt else "Hauptzähler entfernt"
        self._add("aktion", circle.code, p.label, text)


def run_import(
    db: Session, data: StammdatenImport, *, user_id: int, ip_address: str | None
) -> list[ImportEntry]:
    importer = _Importer(db, data.valid_from, user_id, ip_address)
    for circle in data.circles:
        importer.run_circle(circle)
    return importer.entries
