"""Schmale CLI fuer Bootstrap-Aufgaben.

Aufruf:

    uv run python -m meters.cli create-admin --username admin --password "<pw>"
    uv run python -m meters.cli create-admin --username admin --password "<pw>" --email admin@x.tld
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import select

from meters.core.security import hash_password
from meters.db import Base, SessionLocal, engine
from meters.models import User, UserRole


def _cmd_create_admin(args: argparse.Namespace) -> int:
    if len(args.password) < 12:
        print("Passwort muss mindestens 12 Zeichen haben.", file=sys.stderr)
        return 2

    Base.metadata.create_all(engine)
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

    args = parser.parse_args(argv)
    func = args.func
    return int(func(args))


if __name__ == "__main__":
    raise SystemExit(main())
