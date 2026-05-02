# Backend

FastAPI + SQLAlchemy 2 + Alembic, verwaltet mit `uv`.

## Setup

```sh
uv sync
uv run uvicorn meters.main:app --reload
```

## Lint, Typecheck, Test

```sh
uv run ruff check .
uv run ruff format --check .
uv run mypy
uv run pytest
```

## Migrationen

```sh
uv run alembic revision --autogenerate -m "beschreibung"
uv run alembic upgrade head
```

Die SQLite-Datei liegt unter `../data/meters.db` und wird im WAL-Modus
betrieben (siehe `meters.db.engine` — Einstellung folgt im
Implementierungs-Schritt).
