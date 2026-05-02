"""Anwendungs-Konfiguration via pydantic-settings.

Werte können über Umgebungsvariablen mit Präfix ``METERS_`` überschrieben
werden, z. B. ``METERS_SECRET_KEY=...``. Im LXC-Setup landet die Konfig in
``/opt/zaehler/data/meters.env`` und wird vom systemd-Service eingelesen.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT.parent / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="METERS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Zaehlerstand"
    debug: bool = False

    database_url: str = Field(default_factory=lambda: f"sqlite:///{DATA_DIR / 'meters.db'}")

    secret_key: str = "change-me-in-production"
    session_lifetime_days: int = 30
    bcrypt_rounds: int = 12

    login_max_attempts: int = 5
    login_window_seconds: int = 60
    login_lockout_seconds: int = 15 * 60

    cookie_secure: bool = False
    cookie_samesite: str = "strict"

    # Server-Bindung — wird von ``meters.server`` als startbarem Modul gelesen.
    # Default 0.0.0.0 für direkten LAN-Zugriff; auf 127.0.0.1 setzen, sobald ein
    # Reverse-Proxy mit HTTPS davor steht.
    bind_host: str = "0.0.0.0"
    bind_port: int = 8000

    static_dir: Path = Path(__file__).resolve().parent.parent / "static"


settings = Settings()
