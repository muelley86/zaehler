"""Per-Recorder MP-Zugriff (Feature B).

Helfer für die Berechtigungsprüfung auf Messstellen-Ebene. Admin sieht
immer alles — wir geben in dem Fall :data:`None` zurück (semantisch:
"keine Beschränkung") oder lassen die Query unverändert. Das vermeidet
es, für Admin teure Subqueries auszuführen.

Recorder ohne Eintrag in :class:`UserMeasuringPointAccess` haben für
diese MP keinen Zugriff. Wir liefern in dem Fall **404 Not Found**, nicht
403 — damit ein Recorder nicht aus Antwort-Codes auf die Existenz
fremder MPs schließen kann.

Pre-Check über Register-IDs: viele mutierende Endpoints (Reading,
Delivery) bekommen nur ein ``register_id`` und müssen daraus auf den
zugehörigen MP zurückrechnen. :func:`assert_can_access_register` macht
genau das in einer Query.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.orm import InstrumentedAttribute, selectinload
from sqlalchemy.orm import Session as DbSession

from meters.core.problem import ProblemError
from meters.models import (
    Location,
    MeasuringPoint,
    PhysicalMeter,
    Register,
    User,
    UserMeasuringPointAccess,
    UserRole,
    VirtualMeasuringPoint,
)


def accessible_mp_ids(db: DbSession, user: User) -> set[int] | None:
    """IDs der für ``user`` zugänglichen MPs.

    Liefert ``None`` für Admins (semantisch "keine Beschränkung").
    Recorder erhält ein konkretes Set — leer, falls keine Zuweisung
    vorhanden ist.
    """
    if user.role is UserRole.ADMIN:
        return None
    rows = db.scalars(
        select(UserMeasuringPointAccess.measuring_point_id).where(
            UserMeasuringPointAccess.user_id == user.id
        )
    )
    return set(rows)


def is_fully_accessible(vmp: VirtualMeasuringPoint, allowed: set[int]) -> bool:
    """Ist eine verrechnete Messstelle fuer diesen Zugriffsumfang sichtbar?

    Nur, wenn *saemtliche* Komponenten zugaenglich sind — sonst liesse sich
    aus dem Aggregat auf fremde Messstellen zurueckrechnen. Eine leere
    Komponentenliste gilt bewusst als nicht sichtbar.

    Liegt hier und nicht im VMP-Service, weil beide Seiten dieselbe Regel
    brauchen (Standort-Sichtbarkeit und VMP-Sichtbarkeit) und sie sonst
    auseinanderlaufen koennten.
    """
    return bool(vmp.components) and all(c.measuring_point_id in allowed for c in vmp.components)


def accessible_location_ids(db: DbSession, user: User) -> set[int] | None:
    """IDs der Standorte, die ``user`` sehen darf. ``None`` = keine Beschraenkung.

    Ein Standort ist sichtbar, sobald mindestens eine zugaengliche Messstelle
    auf ihn zeigt — echte MPs ebenso wie verrechnete (deren Zugriffsregel
    "alle Komponenten zugaenglich" wird dabei mitgenommen). Ohne diese
    Ableitung saehe ein Recorder ohne jede MP-Zuweisung die komplette
    Standortliste samt Adressen, waehrend der Filter fuer die Messstellen
    selbst sauber greift.
    """
    mp_ids = accessible_mp_ids(db, user)
    if mp_ids is None:
        return None
    location_ids: set[int] = set()
    if mp_ids:
        rows = db.scalars(
            select(MeasuringPoint.location_id).where(
                MeasuringPoint.id.in_(mp_ids),
                MeasuringPoint.location_id.is_not(None),
            )
        )
        location_ids.update(r for r in rows if r is not None)
    if not mp_ids:
        # Ohne jede MP-Zuweisung kann auch keine verrechnete Messstelle
        # sichtbar sein — die Query unten spart man sich dann.
        return location_ids
    # Verrechnete Messstellen haben einen eigenen Standort; fuer die
    # Sichtbarkeitsregel gilt dieselbe Funktion wie im VMP-Service, damit
    # Standort- und VMP-Sicht nicht auseinanderlaufen koennen.
    vmps = db.scalars(
        select(VirtualMeasuringPoint)
        .where(VirtualMeasuringPoint.location_id.is_not(None))
        .options(selectinload(VirtualMeasuringPoint.components))
    )
    for vmp in vmps:
        if is_fully_accessible(vmp, mp_ids) and vmp.location_id is not None:
            location_ids.add(vmp.location_id)
    return location_ids


def accessible_main_location_ids(db: DbSession, user: User) -> set[int] | None:
    """Hauptstandorte, auf die mindestens ein sichtbarer Standort zeigt."""
    location_ids = accessible_location_ids(db, user)
    if location_ids is None:
        return None
    if not location_ids:
        return set()
    rows = db.scalars(
        select(Location.main_location_id).where(
            Location.id.in_(location_ids),
            Location.main_location_id.is_not(None),
        )
    )
    return {r for r in rows if r is not None}


def assert_can_access_mp(
    db: DbSession,
    user: User,
    mp_id: int,
    *,
    not_found_title: str | None = None,
) -> None:
    """Wirft 404, wenn ``user`` keinen Zugriff auf ``mp_id`` hat.

    Admin: durchgelassen ohne DB-Lookup. Recorder: Subquery prüft den
    Eintrag. 404 statt 403, um die Existenz fremder MPs nicht zu leaken
    (siehe Modul-Dokumentation).

    ``not_found_title`` existiert, weil die 404 sonst *selbst* zum
    Existenz-Orakel wird: liefert ein Endpoint für "Reading gibt es
    nicht" den Titel ``"Reading not found"`` und für "Reading gehört zu
    einer fremden Messstelle" den Titel ``"Measuring point not found"``,
    kann ein Recorder den ID-Raum abzählen. Solche Caller geben hier
    ihren eigenen, einheitlichen Titel mit.
    """
    if user.role is UserRole.ADMIN:
        return
    has_access = db.scalar(
        select(UserMeasuringPointAccess.measuring_point_id).where(
            UserMeasuringPointAccess.user_id == user.id,
            UserMeasuringPointAccess.measuring_point_id == mp_id,
        )
    )
    if has_access is None:
        raise ProblemError(
            status_code=404,
            title=not_found_title or "Measuring point not found",
        )


def assert_can_access_register(
    db: DbSession,
    user: User,
    register_id: int,
    *,
    not_found_title: str | None = None,
) -> None:
    """Wie :func:`assert_can_access_mp`, aber für ``register_id``.

    Macht den Join Register → PhysicalMeter → MeasuringPoint und prüft
    den dortigen MP-Zugriff. Für Endpoints, die nur das Register kennen
    (POST/PATCH/DELETE Reading, Delivery).

    Wirft 404 sowohl wenn das Register nicht existiert als auch wenn der
    User keinen Zugriff auf die MP hat — kein Leak.
    """
    if user.role is UserRole.ADMIN:
        # Admin braucht den MP-Check nicht, aber das Register muss
        # existieren — sonst wäre die nachfolgende Logik im Caller mit
        # einer 500 statt einer sauberen 404 unterwegs. Existenz prüfen
        # wir trotzdem nicht hier; das macht der Caller (z.B. ReadingCreate
        # validiert das Register beim Insert). Diese Funktion ist nur die
        # Berechtigungs-Prüfung.
        return
    mp_id = db.scalar(
        select(PhysicalMeter.measuring_point_id)
        .join(Register, Register.physical_meter_id == PhysicalMeter.id)
        .where(Register.id == register_id)
    )
    if mp_id is None:
        raise ProblemError(
            status_code=404,
            title=not_found_title or "Register not found",
        )
    assert_can_access_mp(db, user, mp_id, not_found_title=not_found_title)


def restrict_mp_query(
    query: Select[Any],
    user: User,
    *,
    mp_id_column: InstrumentedAttribute[int],
) -> Select[Any]:
    """Hängt eine WHERE-Klausel an, die ``mp_id_column`` auf zugängliche
    MPs einschränkt.

    Admin: Query unverändert. Recorder: ``mp_id_column.in_(subquery)``
    mit einer korrelierten Subquery auf
    :class:`UserMeasuringPointAccess`. Die Subquery wird nicht
    materialisiert; SQLite optimiert das in einen Hash-Join.

    ``mp_id_column`` muss eine InstrumentedAttribute auf einer Spalte
    vom Typ Integer sein, die einen MeasuringPoint referenziert
    (z.B. ``MeasuringPoint.id`` direkt oder ``PhysicalMeter.measuring_point_id``).
    """
    if user.role is UserRole.ADMIN:
        return query
    subq = select(UserMeasuringPointAccess.measuring_point_id).where(
        UserMeasuringPointAccess.user_id == user.id
    )
    return query.where(mp_id_column.in_(subq))
