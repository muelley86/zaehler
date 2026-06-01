"""Idempotenter Bootstrap für das lokale Dev-Setup (`npm run dev`).

Legt den Admin-User `admin` / `admin123` an (falls fehlend) und seedet eine
Demo-Messstelle mit monatlichen Ablesungen, damit das Dashboard nicht leer ist
(nur, wenn noch keine Messstelle existiert).

Erwartet eine bereits migrierte DB (``alembic upgrade head``). Wird von
``scripts/dev.sh`` mit CWD=backend via ``uv run python`` aufgerufen, sodass die
DB-/Secret-Konfiguration aus ``backend/.env`` greift.

Hinweis: ``admin123`` liegt bewusst unter der 12-Zeichen-Policy der App. Der
Hash wird hier direkt gesetzt (umgeht die CLI-Prüfung); der Login selbst prüft
keine Länge. Reines lokales Test-Setup.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select

from meters.core.security import hash_password
from meters.db import SessionLocal
from meters.models import MeasuringPoint, MeterType, Reading, User, UserRole
from meters.services.meter_replacement import install_first_meter

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"  # bewusst < 12 Zeichen — nur lokales Test-Setup
DEMO_NAME = "Hauptzähler Strom (Demo)"

# Saisonale Monats-Deltas (kWh): Bezug höher im Winter, Einspeisung (PV) im Sommer.
BEZUG_DELTA = {1: 520, 2: 480, 3: 430, 4: 360, 5: 300, 6: 260,
               7: 250, 8: 260, 9: 300, 10: 380, 11: 470, 12: 540}
EINSP_DELTA = {1: 60, 2: 110, 3: 210, 4: 320, 5: 420, 6: 480,
               7: 500, 8: 450, 9: 330, 10: 200, 11: 90, 12: 50}


def ensure_admin(db) -> User:  # type: ignore[no-untyped-def]
    user = db.scalar(select(User).where(User.username == ADMIN_USERNAME))
    if user is not None:
        return user
    user = User(
        username=ADMIN_USERNAME,
        email=None,
        password_hash=hash_password(ADMIN_PASSWORD),
        role=UserRole.ADMIN,
        is_active=True,
        force_password_change=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"[dev] Admin '{ADMIN_USERNAME}' angelegt (Passwort: {ADMIN_PASSWORD}).")
    return user


def ensure_demo(db, user: User) -> None:  # type: ignore[no-untyped-def]
    if db.scalar(select(MeasuringPoint)) is not None:
        return  # Es gibt bereits Messstellen — kein Demo-Seed.

    mp = MeasuringPoint(
        name=DEMO_NAME,
        type=MeterType.ELECTRICITY,
        is_bidirectional=True,
        has_dual_tariff=False,
    )
    db.add(mp)
    db.flush()
    install_first_meter(
        db,
        measuring_point=mp,
        serial_number="DEMO-E1",
        installed_at=date(2024, 12, 1),
        initial_values={"1.8.0": Decimal("12000"), "2.8.0": Decimal("3000")},
        user_id=user.id,
        ip_address=None,
    )
    db.commit()
    db.refresh(mp)

    regs = {r.obis_code: r for r in mp.physical_meters[0].registers}
    reg_bezug = regs["1.8.0"]
    reg_einsp = regs["2.8.0"]

    months = [(2025, m) for m in range(1, 13)] + [(2026, m) for m in range(1, 6)]
    bezug = Decimal("12000")
    einsp = Decimal("3000")
    for year, month in months:
        bezug += Decimal(BEZUG_DELTA[month])
        einsp += Decimal(EINSP_DELTA[month])
        at = datetime(year, month, 1, 9, 0, 0)
        db.add(Reading(register_id=reg_bezug.id, value=bezug,
                       reading_at=at, created_by_user_id=user.id))
        db.add(Reading(register_id=reg_einsp.id, value=einsp,
                       reading_at=at, created_by_user_id=user.id))
    db.commit()
    print(f"[dev] Demo-Messstelle '{DEMO_NAME}' mit {len(months)} Stichtagen je Register angelegt.")


def main() -> None:
    db = SessionLocal()
    try:
        user = ensure_admin(db)
        ensure_demo(db, user)
    finally:
        db.close()


if __name__ == "__main__":
    main()
