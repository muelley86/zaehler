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

    # Wenn True, wird ``X-Forwarded-For`` als Client-IP gewertet — nur
    # einschalten, wenn ein vertrauenswürdiger Reverse-Proxy davor steht.
    # Sonst kann jeder Client den Header fälschen und damit Rate-Limiter
    # umgehen / Audit-Log vergiften.
    trust_proxy: bool = False

    # Erlaubte Origins für mutating-Requests (CSRF-Schutz als Defense-in-Depth
    # zu SameSite=strict). Komma-getrennt in der ENV setzen, z. B.
    # METERS_ALLOWED_ORIGINS="https://zaehler.example.com".
    # Same-Origin-Requests sind unabhängig davon immer erlaubt.
    allowed_origins: list[str] = []

    static_dir: Path = Path(__file__).resolve().parent.parent / "static"


settings = Settings()


def assert_secure_secret_key() -> None:
    """Bricht den Boot ab, wenn der Default-SECRET_KEY in einer Produktions-
    Konfig (debug=False) noch verwendet wird. Im Dev-Modus nur Warnung.
    """
    import warnings

    if settings.secret_key == "change-me-in-production":
        if settings.debug:
            warnings.warn(
                "METERS_SECRET_KEY ist auf den Default 'change-me-in-production' gesetzt — "
                "im Dev-Modus geduldet, aber für Produktion Pflicht-Override.",
                stacklevel=2,
            )
        else:
            raise RuntimeError(
                "METERS_SECRET_KEY ist nicht gesetzt (Default: 'change-me-in-production'). "
                "Setze einen zufälligen Wert in /opt/zaehler/data/meters.env, z. B. "
                "`python -c 'import secrets; print(secrets.token_urlsafe(48))'`."
            )
