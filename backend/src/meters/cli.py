"""Schmale CLI fuer Bootstrap-Aufgaben.

Aufruf:

    uv run python -m meters.cli create-admin --username admin --password "<pw>"
    uv run python -m meters.cli create-admin --username admin --password "<pw>" --email admin@x.tld
    uv run python -m meters.cli reset-password --username admin --password "<pw>" --force-change
    uv run python -m meters.cli repair-legacy-timestamps            # Dry-Run (zeigt nur an)
    uv run python -m meters.cli repair-legacy-timestamps --apply    # schreibt die Korrektur
    uv run python -m meters.cli repair-midnight-readings            # Dry-Run (zeigt nur an)
    uv run python -m meters.cli repair-midnight-readings --apply    # schreibt die Korrektur
    uv run python -m meters.cli recompute-monthly                   # Backfill monthly_consumption
    uv run python -m meters.cli relabel-register-unit --type heating --from kWh --to MWh
    uv run python -m meters.cli relabel-register-unit --type heating --from kWh --to MWh --apply
    uv run python -m meters.cli seed-readings --year 2025             # Dry-Run (Testdaten planen)
    uv run python -m meters.cli seed-readings --year 2025 --apply     # schreiben (+ Snapshot)
    uv run python -m meters.cli seed-readings --year 2025 --remove --apply  # wieder entfernen
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from meters.core.config import settings
from meters.core.security import hash_password
from meters.db import SessionLocal, engine
from meters.models import (
    MeasuringPoint,
    MeterType,
    PhysicalMeter,
    Reading,
    Register,
    User,
    UserRole,
)
from meters.schemas.measuring_point import ALLOWED_HEATING_UNITS
from meters.services.backup import snapshot_sqlite
from meters.services.legacy_timestamp_repair import repair_legacy_timestamps
from meters.services.midnight_repair import repair_midnight_readings
from meters.services.monthly_consumption import recompute_all, recompute_register
from meters.services.seed_readings import remove_seed, seed_note, seed_year


def _ensure_schema_initialized() -> None:
    """Bricht ab, wenn die Datenbank nicht via alembic initialisiert wurde.

    Früher rief diese CLI ``Base.metadata.create_all(engine)`` auf — das
    erzeugt aber Tabellen am Migrations-Tracking vorbei und führt langfristig
    zu einer inkonsistenten DB (kein ``alembic_version``, fehlende Spalten
    aus späteren Migrationen). Stattdessen verlangen wir jetzt einen
    sauberen ``alembic upgrade head``-Lauf vor dem ersten Admin-Anlegen.
    """
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "user" not in tables or "alembic_version" not in tables:
        print(
            "Datenbank ist nicht migriert. Bitte zuerst ausführen:\n"
            "  cd backend && uv run alembic upgrade head\n",
            file=sys.stderr,
        )
        raise SystemExit(3)


def _cmd_create_admin(args: argparse.Namespace) -> int:
    if len(args.password) < 12:
        print("Passwort muss mindestens 12 Zeichen haben.", file=sys.stderr)
        return 2

    _ensure_schema_initialized()
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.username == args.username))
        if existing is not None:
            print(f"Benutzer '{args.username}' existiert bereits.", file=sys.stderr)
            return 1
        user = User(
            username=args.username,
            email=args.email,
            password_hash=hash_password(args.password),
            role=UserRole.ADMIN,
            is_active=True,
            force_password_change=args.force_change,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Admin angelegt: id={user.id} username={user.username}")
    return 0


def _cmd_reset_password(args: argparse.Namespace) -> int:
    if len(args.password) < 12:
        print("Passwort muss mindestens 12 Zeichen haben.", file=sys.stderr)
        return 2

    _ensure_schema_initialized()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == args.username))
        if user is None:
            print(f"Benutzer '{args.username}' nicht gefunden.", file=sys.stderr)
            return 1
        user.password_hash = hash_password(args.password)
        user.is_active = True
        if args.force_change:
            user.force_password_change = True
        db.commit()
        print(
            f"Passwort für '{user.username}' (id={user.id}) zurückgesetzt"
            + (" — Änderung beim nächsten Login erzwungen." if args.force_change else ".")
        )
    return 0


def _refresh_monthly_cache(db: Session, register_ids: set[int]) -> int:
    """Berechnet den materialisierten Monats-Cache (``monthly_consumption``) der
    betroffenen Register neu und committed.

    Die Repair-Kommandos verschieben ``reading_at`` (mitunter über eine
    Monatsgrenze) und laufen als eigener Prozess OHNE ``create_app()`` — der
    Session-Hook, der ``monthly_consumption`` sonst nach jeder Ablese-Änderung
    automatisch pflegt, ist hier also NICHT aktiv. Ohne diesen Schritt bliebe der
    Cache stale: Tag/Woche/Jahr (on-the-fly) stimmen sofort, die Monats-Diagramme
    zeigten aber bis zur nächsten Änderung je Register falsche Werte.
    """
    for register_id in register_ids:
        recompute_register(db, register_id)
    db.commit()
    return len(register_ids)


def _cmd_repair_legacy_timestamps(args: argparse.Namespace) -> int:
    """Korrigiert synthetische Readings, die vor Fix #148 naiv-UTC abgelegt
    wurden (``Anfangsstand`` / ``Endstand vor Tausch``). Ohne ``--apply`` nur
    Dry-Run — es wird nichts geschrieben."""
    _ensure_schema_initialized()
    apply = bool(args.apply)
    with SessionLocal() as db:
        result = repair_legacy_timestamps(db, dry_run=not apply)
        for p in result.planned:
            flag = "  ⚠ KOLLISION (übersprungen)" if p.collision else ""
            print(
                f"  #{p.reading_id} reg={p.register_id} [{p.note}] "
                f"{p.before:%Y-%m-%d %H:%M:%S} → {p.after:%Y-%m-%d %H:%M:%S}{flag}"
            )
        if result.affected == 0:
            print("Keine betroffenen Altzeilen gefunden — nichts zu tun.")
            return 0
        if apply:
            db.commit()
            touched = {p.register_id for p in result.planned if not p.collision}
            n = _refresh_monthly_cache(db, touched)
            print(
                f"\nAngewendet: {result.applied} korrigiert, "
                f"{result.skipped_collisions} wegen Kollision übersprungen.\n"
                f"Monats-Cache für {n} Register neu berechnet."
            )
        else:
            db.rollback()
            collisions = sum(1 for p in result.planned if p.collision)
            print(
                f"\nDRY-RUN: {result.affected} betroffen "
                f"({collisions} davon mit Kollision). Nichts geändert.\n"
                "Vor dem Schreiben ein DB-Backup anlegen, dann erneut mit --apply ausführen."
            )
    return 0


def _cmd_repair_midnight_readings(args: argparse.Namespace) -> int:
    """Verschiebt Readings, deren lokale Zeit exakt Mitternacht (00:00) ist, auf
    den Vortag 23:59:59 — damit der Verbrauch vollstaendig der vorhergehenden
    Periode zugeordnet wird. Ohne ``--apply`` nur Dry-Run."""
    _ensure_schema_initialized()
    apply = bool(args.apply)
    with SessionLocal() as db:
        result = repair_midnight_readings(db, dry_run=not apply)
        for p in result.planned:
            flag = "  ⚠ KOLLISION (übersprungen)" if p.collision else ""
            print(
                f"  #{p.reading_id} reg={p.register_id} "
                f"{p.before:%Y-%m-%d %H:%M:%S} → {p.after:%Y-%m-%d %H:%M:%S}{flag}"
            )
        if result.affected == 0:
            print("Keine Mitternachts-Readings gefunden — nichts zu tun.")
            return 0
        if apply:
            db.commit()
            touched = {p.register_id for p in result.planned if not p.collision}
            n = _refresh_monthly_cache(db, touched)
            print(
                f"\nAngewendet: {result.applied} korrigiert, "
                f"{result.skipped_collisions} wegen Kollision übersprungen.\n"
                f"Monats-Cache für {n} Register neu berechnet."
            )
        else:
            db.rollback()
            collisions = sum(1 for p in result.planned if p.collision)
            print(
                f"\nDRY-RUN: {result.affected} betroffen "
                f"({collisions} davon mit Kollision). Nichts geändert.\n"
                "Vor dem Schreiben ein DB-Backup anlegen, dann erneut mit --apply ausführen."
            )
    return 0


def _cmd_recompute_monthly(_args: argparse.Namespace) -> int:
    """Backfill der materialisierten Monats-Statistik (``monthly_consumption``)
    für alle Register. Einmalig nach dem Deploy auszuführen, das die Lese-Pfade
    auf die Tabelle umstellt; danach hält der Session-Hook sie automatisch aktuell."""
    _ensure_schema_initialized()
    with SessionLocal() as db:
        count = recompute_all(db)
        db.commit()
    print(f"monthly_consumption neu berechnet für {count} Register.")
    return 0


def _cmd_relabel_register_unit(args: argparse.Namespace) -> int:
    """Benennt die Einheit aller passenden Register um (``--from`` → ``--to``),
    OHNE die gespeicherten Werte zu ändern (reines Label). Anwendungsfall:
    versehentlich kWh statt MWh angelegte Wärmemengenzähler. Default: Dry-Run;
    ``--apply`` schreibt. ``--type`` grenzt auf einen Messstellen-Typ ein (z. B.
    ``heating`` — schließt gleich-einheitige Strom-Register aus)."""
    from_unit: str = args.from_unit
    to_unit: str = args.to_unit
    mp_type: str = args.type

    if not (1 <= len(to_unit) <= 16) or not (1 <= len(from_unit) <= 16):
        print("--from/--to müssen 1 bis 16 Zeichen lang sein.", file=sys.stderr)
        return 2
    if from_unit == to_unit:
        print("--from und --to sind identisch — nichts zu tun.", file=sys.stderr)
        return 2
    if mp_type == MeterType.HEATING.value and to_unit not in ALLOWED_HEATING_UNITS:
        print(
            f"--to {to_unit!r} ist keine gültige Heizungs-Einheit "
            f"({sorted(ALLOWED_HEATING_UNITS)}).",
            file=sys.stderr,
        )
        return 2

    _ensure_schema_initialized()
    apply = bool(args.apply)
    with SessionLocal() as db:
        stmt = (
            select(Register)
            .join(PhysicalMeter, Register.physical_meter_id == PhysicalMeter.id)
            .join(MeasuringPoint, PhysicalMeter.measuring_point_id == MeasuringPoint.id)
            .where(Register.unit == from_unit, MeasuringPoint.type == MeterType(mp_type))
        )
        registers = list(db.scalars(stmt))
        if not registers:
            print(f"Keine {mp_type}-Register mit Einheit {from_unit!r} gefunden — nichts zu tun.")
            return 0

        print(f"{len(registers)} Register: Einheit {from_unit!r} → {to_unit!r}")
        for r in registers:
            mp = r.physical_meter.measuring_point
            n_readings = db.scalar(
                select(func.count()).select_from(Reading).where(Reading.register_id == r.id)
            )
            print(f"  #{r.id} {mp.name} / {r.label} ({r.unit}) — {n_readings} Erfassungen")

        if not apply:
            db.rollback()
            print(
                "\nDRY-RUN: nichts geändert. Vor dem Schreiben ein DB-Backup anlegen, "
                "dann erneut mit --apply ausführen."
            )
            return 0

        for r in registers:
            r.unit = to_unit
        db.commit()
        # ``monthly_consumption.unit`` ist denormalisiert → Cache der betroffenen
        # Register neu berechnen, damit auch die Monats-Diagramme die neue Einheit zeigen.
        n = _refresh_monthly_cache(db, {r.id for r in registers})
        print(
            f"\nAngewendet: {len(registers)} Register auf {to_unit!r} umbenannt "
            f"(Werte unverändert), Monats-Cache für {n} Register neu berechnet."
        )
    return 0


def _sqlite_path() -> Path | None:
    """Dateipfad der SQLite-DB aus ``settings.database_url`` (None bei anderen URLs)."""
    prefix = "sqlite:///"
    if not settings.database_url.startswith(prefix):
        return None
    return Path(settings.database_url[len(prefix) :])


def _cmd_seed_readings(args: argparse.Namespace) -> int:
    """Synthetische Monatsstände für ein Jahr anlegen (``--apply``) bzw. mit
    ``--remove`` wieder entfernen. Nur für Dev-/Test-Datenbanken gedacht: die
    Ablesungen tragen die Notiz ``Testdaten <Jahr>`` und sind darüber jederzeit
    restlos rückbaubar. Vor dem Schreiben wird ein SQLite-Snapshot gezogen."""
    _ensure_schema_initialized()
    year: int = args.year
    with SessionLocal() as db:
        if args.remove:
            count, register_ids = remove_seed(db, year=year, apply=args.apply)
            if not args.apply:
                print(f"DRY-RUN: {count} Ablesungen mit Notiz '{seed_note(year)}' würden entfernt.")
                print("Zum Entfernen: --remove --apply")
                return 0
            refreshed = _refresh_monthly_cache(db, register_ids)
            print(
                f"Entfernt: {count} Ablesungen '{seed_note(year)}'; "
                f"Monats-Cache: {refreshed} Register."
            )
            return 0

        user = db.scalar(select(User).where(User.username == args.user))
        if user is None:
            print(f"Benutzer '{args.user}' nicht gefunden (--user).", file=sys.stderr)
            return 2

        if args.apply:
            db_path = _sqlite_path()
            if db_path is not None and db_path.exists():
                stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                snapshot = db_path.with_name(f"{db_path.name}.pre-seed-{stamp}")
                snapshot_sqlite(db_path, snapshot)
                print(f"Snapshot vor dem Schreiben: {snapshot}")

        report = seed_year(db, user_id=user.id, year=year, apply=args.apply)
        mode = "Angewendet" if args.apply else "DRY-RUN"
        print(
            f"{mode}: {report.point_count} Ablesungen '{seed_note(year)}' für "
            f"{len(report.planned)} Register; {len(report.skipped)} Register übersprungen."
        )
        for register_id, reason in sorted(report.skipped.items()):
            print(f"  übersprungen: Register {register_id} — {reason}")
        if not args.apply:
            print("Zum Schreiben: --apply (legt vorher einen Snapshot der SQLite-Datei an).")
            return 0
        refreshed = _refresh_monthly_cache(db, report.register_ids)
        print(f"Monats-Cache neu berechnet für {refreshed} Register.")
        print(f"Rückbau: seed-readings --year {year} --remove --apply")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="meters.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)

    create = sub.add_parser("create-admin", help="Initialen Admin-Benutzer anlegen")
    create.add_argument("--username", required=True)
    create.add_argument("--password", required=True)
    create.add_argument("--email", default=None)
    create.add_argument(
        "--force-change",
        action="store_true",
        help="Admin muss beim ersten Login das Passwort ändern.",
    )
    create.set_defaults(func=_cmd_create_admin)

    reset = sub.add_parser(
        "reset-password",
        help="Passwort eines bestehenden Benutzers neu setzen (z. B. wenn vergessen).",
    )
    reset.add_argument("--username", required=True)
    reset.add_argument("--password", required=True)
    reset.add_argument(
        "--force-change",
        action="store_true",
        help="Benutzer muss beim nächsten Login ein neues Passwort setzen.",
    )
    reset.set_defaults(func=_cmd_reset_password)

    repair = sub.add_parser(
        "repair-legacy-timestamps",
        help=(
            "Synthetische Readings (Anfangsstand/Endstand vor Tausch) korrigieren, "
            "die vor dem Zeitzonen-Fix naiv-UTC gespeichert wurden. "
            "Default: Dry-Run; --apply schreibt."
        ),
    )
    repair.add_argument(
        "--apply",
        action="store_true",
        help="Korrektur tatsächlich schreiben (sonst nur Dry-Run-Anzeige).",
    )
    repair.set_defaults(func=_cmd_repair_legacy_timestamps)

    midnight = sub.add_parser(
        "repair-midnight-readings",
        help=(
            "Readings an lokaler Mitternacht (00:00) auf den Vortag 23:59:59 "
            "verschieben (Perioden-Zuordnung). Default: Dry-Run; --apply schreibt."
        ),
    )
    midnight.add_argument(
        "--apply",
        action="store_true",
        help="Korrektur tatsächlich schreiben (sonst nur Dry-Run-Anzeige).",
    )
    midnight.set_defaults(func=_cmd_repair_midnight_readings)

    recompute = sub.add_parser(
        "recompute-monthly",
        help=(
            "Materialisierte Monats-Statistik (monthly_consumption) für alle "
            "Register neu berechnen (Backfill, einmalig nach dem Deploy)."
        ),
    )
    recompute.set_defaults(func=_cmd_recompute_monthly)

    relabel = sub.add_parser(
        "relabel-register-unit",
        help=(
            "Einheit passender Register umbenennen (--from → --to), OHNE Werte zu ändern "
            "(z. B. versehentlich kWh statt MWh angelegte Wärmemengenzähler). "
            "Default: Dry-Run; --apply schreibt."
        ),
    )
    relabel.add_argument(
        "--type",
        choices=[t.value for t in MeterType],
        default=MeterType.HEATING.value,
        help="Messstellen-Typ, auf den eingegrenzt wird (Default: heating).",
    )
    relabel.add_argument(
        "--from", dest="from_unit", required=True, help="Aktuelle Einheit, z. B. kWh."
    )
    relabel.add_argument("--to", dest="to_unit", required=True, help="Neue Einheit, z. B. MWh.")
    relabel.add_argument(
        "--apply",
        action="store_true",
        help="Umbenennung tatsächlich schreiben (sonst nur Dry-Run-Anzeige).",
    )
    relabel.set_defaults(func=_cmd_relabel_register_unit)

    seed = sub.add_parser(
        "seed-readings",
        help=(
            "Synthetische Monatsstände für ein Jahr anlegen (Dev-/Testdaten, Notiz "
            "'Testdaten <Jahr>'), mit --remove wieder entfernen. "
            "Default: Dry-Run; --apply schreibt."
        ),
    )
    seed.add_argument("--year", type=int, default=2025, help="Zieljahr (Default: 2025).")
    seed.add_argument(
        "--user", default="admin", help="Benutzername als created_by (Default: admin)."
    )
    seed.add_argument(
        "--remove", action="store_true", help="Markierte Testdaten des Jahres entfernen."
    )
    seed.add_argument(
        "--apply", action="store_true", help="Tatsächlich schreiben (sonst nur Dry-Run-Anzeige)."
    )
    seed.set_defaults(func=_cmd_seed_readings)

    args = parser.parse_args(argv)
    func = args.func
    return int(func(args))


if __name__ == "__main__":
    raise SystemExit(main())
