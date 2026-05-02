"""Gemeinsame pytest-Fixtures.

Wichtig: Test-DB wird VOR dem Import von ``meters.*`` konfiguriert,
damit Settings die Test-URL aufnehmen.
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

_TMP_DB = Path(tempfile.mkdtemp(prefix="meters-test-")) / "test.db"
os.environ["METERS_DATABASE_URL"] = f"sqlite:///{_TMP_DB}"
os.environ["METERS_SECRET_KEY"] = "test-secret-do-not-use-in-prod"
os.environ["METERS_BCRYPT_ROUNDS"] = "4"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from meters.core.security import hash_password  # noqa: E402
from meters.db import Base, SessionLocal, engine  # noqa: E402
from meters.main import app  # noqa: E402
from meters.models import User, UserRole  # noqa: E402
from meters.services.rate_limit import login_limiter  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _create_schema() -> Iterator[None]:
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _clean_tables() -> Iterator[None]:
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    login_limiter._state.clear()


@pytest.fixture
def db() -> Iterator[Session]:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin_user(db: Session) -> User:
    user = User(
        username="admin",
        email="admin@example.com",
        password_hash=hash_password("admin-pass-12345"),
        role=UserRole.ADMIN,
        is_active=True,
        force_password_change=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def recorder_user(db: Session) -> User:
    user = User(
        username="recorder",
        email=None,
        password_hash=hash_password("recorder-pass-1234"),
        role=UserRole.RECORDER,
        is_active=True,
        force_password_change=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_client(admin_user: User) -> Iterator[TestClient]:
    del admin_user
    with TestClient(app) as c:
        resp = c.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "admin-pass-12345"},
        )
        assert resp.status_code == 200, resp.text
        yield c


@pytest.fixture
def recorder_client(recorder_user: User) -> Iterator[TestClient]:
    del recorder_user
    with TestClient(app) as c:
        resp = c.post(
            "/api/v1/auth/login",
            json={"username": "recorder", "password": "recorder-pass-1234"},
        )
        assert resp.status_code == 200, resp.text
        yield c
