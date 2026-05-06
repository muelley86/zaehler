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

from sqlalchemy import Select, select
from sqlalchemy.orm import Session as DbSession

from meters.core.problem import ProblemError
from meters.models import (
    MeasuringPoint,
    PhysicalMeter,
    Register,
    User,
    UserMeasuringPointAccess,
    UserRole,
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


def assert_can_access_mp(db: DbSession, user: User, mp_id: int) -> None:
    """Wirft 404, wenn ``user`` keinen Zugriff auf ``mp_id`` hat.

    Admin: durchgelassen ohne DB-Lookup. Recorder: Subquery prüft den
    Eintrag. 404 statt 403, um die Existenz fremder MPs nicht zu leaken
    (siehe Modul-Dokumentation).
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
        raise ProblemError(status_code=404, title="Measuring point not found")


def assert_can_access_register(db: DbSession, user: User, register_id: int) -> None:
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
        raise ProblemError(status_code=404, title="Register not found")
    assert_can_access_mp(db, user, mp_id)


def restrict_mp_query(query: Select, user: User, *, mp_id_column) -> Select:
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


def grant_access(
    db: DbSession,
    *,
    user: User,
    mp: MeasuringPoint,
    granted_by: User,
) -> UserMeasuringPointAccess | None:
    """Idempotent: legt einen Access-Eintrag an, falls noch nicht vorhanden.

    Liefert das Objekt, wenn ein neuer Eintrag entstanden ist — ``None``,
    wenn der User schon Zugriff hatte. Audit-Log wird vom Caller
    geschrieben (er kennt den Request-Kontext für die IP-Adresse).
    """
    existing = db.get(UserMeasuringPointAccess, (user.id, mp.id))
    if existing is not None:
        return None
    entry = UserMeasuringPointAccess(
        user_id=user.id,
        measuring_point_id=mp.id,
        granted_by_user_id=granted_by.id,
    )
    db.add(entry)
    db.flush()
    return entry


def revoke_access(db: DbSession, *, user: User, mp_id: int) -> bool:
    """Entfernt den Access-Eintrag. Liefert True, wenn etwas entfernt
    wurde, False wenn er nicht existierte (idempotent).
    """
    existing = db.get(UserMeasuringPointAccess, (user.id, mp_id))
    if existing is None:
        return False
    db.delete(existing)
    db.flush()
    return True
