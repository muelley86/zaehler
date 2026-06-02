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
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from meters.core.security import hash_password
from meters.db import SessionLocal, engine
from meters.models import User, UserRole
from meters.services.legacy_timestamp_repair import repair_legacy_timestamps
from meters.services.midnight_repair import repair_midnight_readings
from meters.services.monthly_consumption import recompute_all, recompute_register


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

    args = parser.parse_args(argv)
    func = args.func
    return int(func(args))


if __name__ == "__main__":
    raise SystemExit(main())
