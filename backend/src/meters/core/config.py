"""Anwendungs-Konfiguration via pydantic-settings.

Werte können über Umgebungsvariablen mit Präfix ``METERS_`` überschrieben
werden, z. B. ``METERS_SECRET_KEY=...``. Im LXC-Setup landet die Konfig in
``/opt/zaehler/data/meters.env`` und wird vom systemd-Service eingelesen.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

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

    # Lokale Zeitzone fuer aus reinen Datumsangaben erzeugte Zeitstempel
    # (z. B. Erst-/Tausch-Erfassung). Gespeichert wird weiterhin UTC; diese
    # Zeitzone bestimmt nur, welche Wanduhrzeit ein "Datum" lokal bedeutet.
    timezone: str = "Europe/Berlin"

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"Ungueltige Zeitzone: {value!r}") from exc
        return value

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

    # Öffentlich (Internet) erreichbar? Default False = LAN-Betrieb. Wird dies
    # auf True gesetzt (typisch im ``proxy-same``-Setup), verlangt der
    # Boot-Check zwingend ``cookie_secure=True`` und bricht sonst HART ab —
    # damit eine versehentliche Klartext-HTTP-Exposition nicht unbemerkt im
    # Log untergeht. Im reinen LAN-Betrieb NICHT setzen (oder False lassen),
    # sonst startet der Service mit dem dort korrekten ``cookie_secure=False``
    # nicht. Reines Opt-in: ändert für bestehende Setups nichts.
    public_facing: bool = False

    # Erlaubte Origins für mutating-Requests (CSRF-Schutz als Defense-in-Depth
    # zu SameSite=strict). Komma-getrennt in der ENV setzen, z. B.
    # METERS_ALLOWED_ORIGINS="https://zaehler.example.com,https://alt.example.com".
    # Same-Origin-Requests sind unabhängig davon immer erlaubt.
    # NoDecode + field_validator: pydantic-settings würde sonst versuchen,
    # den ENV-Wert als JSON zu parsen — wir wollen ein simples comma-Format.
    allowed_origins: Annotated[list[str], NoDecode] = []

    # Optionale Allowlist von Proxy-IPs (komma-getrennt). Ist sie gesetzt, wird
    # ``X-Forwarded-For`` NUR akzeptiert, wenn die unmittelbare Verbindungs-IP
    # (``request.client.host``) hier gelistet ist — schliesst XFF-Spoofing aus,
    # wenn die App neben dem Proxy auch direkt erreichbar ist. Leer (Default) =
    # altes Verhalten (bei ``trust_proxy=True`` wird XFF immer ausgewertet).
    # Rein additiv — fuer bestehende Setups aendert sich nichts.
    trusted_proxy_ips: Annotated[list[str], NoDecode] = []

    # Optionale feste Basis-URL (z. B. ``https://zaehler.example.com``) fuer
    # gedruckte QR-Code-Links. Hinter einem HTTPS-Reverse-Proxy sieht der
    # App-Request intern oft nur ``http`` — ohne Override truegen gedruckte
    # Etiketten dann eine ``http://``-URL. Leer (Default) = aus dem Request
    # ableiten (altes Verhalten).
    public_base_url: str = ""

    @field_validator("allowed_origins", "trusted_proxy_ips", mode="before")
    @classmethod
    def _split_origins(cls, v: Any) -> Any:
        if v is None:
            return []
        if isinstance(v, str):
            stripped = v.strip()
            if not stripped:
                return []
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return v

    static_dir: Path = Path(__file__).resolve().parent.parent / "static"

    # Ablage für Foto-Uploads an Readings. Liegt unter ``DATA_DIR``, damit
    # systemd's ``ReadWritePaths=/opt/zaehler`` und das Backup-Skript es
    # automatisch erfassen. Override via ``METERS_MEDIA_DIR``.
    media_dir: Path = DATA_DIR / "media" / "photos"

    # Max Upload-Größe für ein Foto vor Reencode (Roh-Datei). 20 MB deckt
    # auch hochauflösende Smartphone-JPEGs ab; alles darüber lehnen wir mit
    # 413 ab, bevor Pillow den Decode startet.
    photo_max_upload_bytes: int = 20 * 1024 * 1024

    # Wenn True, MUESSEN Admins 2FA/TOTP aktiviert haben: ein Admin ohne
    # aktives TOTP wird nach dem Login zur Einrichtung gezwungen und kann bis
    # dahin keine anderen Endpoints nutzen. Default False = kein Zwang (reiner
    # LAN-Betrieb bleibt unberuehrt). Empfohlen bei Internet-Exposition.
    require_totp_for_admin: bool = False


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


def assert_secure_production_config() -> None:
    """Warnt im Log, wenn in Production (``debug=False``) sicherheitsrelevante
    Settings auf unsicheren Defaults stehen.

    - ``cookie_secure=False`` heisst: Session-Cookie wird auch ueber
      unverschluesselte HTTP-Verbindungen mitgeschickt — Sniffing-Risiko.
      Bei Direkt-HTTP-Setups (kein Reverse-Proxy) ist ``False`` jedoch die
      einzige Variante, in der Login ueberhaupt funktioniert — daher im
      LAN-Betrieb nur Warnung, kein Boot-Abort.
    - ``public_facing=True`` + ``cookie_secure=False`` ist dagegen ein HARTER
      Boot-Abort: wer die App bewusst ins Internet stellt, darf das
      Session-Cookie nicht im Klartext ausliefern. Reines Opt-in — ohne
      ``METERS_PUBLIC_FACING`` bleibt das Verhalten fuer bestehende Setups
      unveraendert (nur Warnung).
    - ``trust_proxy=False`` hinter einem Reverse-Proxy heisst: Rate-Limit
      sieht die Proxy-IP statt der Client-IP und limitiert das ganze
      Netzwerk auf 5 Versuche/min.

    Im Dev-Modus passiert nichts, damit ``uv run uvicorn ... --reload`` ohne
    HTTPS bequem laeuft.
    """
    import warnings

    if settings.debug:
        return
    if not settings.cookie_secure:
        if settings.public_facing:
            raise RuntimeError(
                "METERS_PUBLIC_FACING=True verlangt METERS_COOKIE_SECURE=True. "
                "Bei oeffentlicher Erreichbarkeit wuerde das Session-Cookie sonst "
                "im Klartext uebertragen (Sniffing / Session-Hijack). Entweder "
                "einen HTTPS-Reverse-Proxy davorschalten und cookie_secure=True "
                "setzen (Topologie 'proxy-same'), oder fuer reinen LAN-Betrieb "
                "METERS_PUBLIC_FACING entfernen bzw. auf False setzen."
            )
        warnings.warn(
            "METERS_COOKIE_SECURE ist False. Falls ein HTTPS-Reverse-Proxy "
            "davor steht, bitte auf True setzen — sonst geht das Session-"
            "Cookie auch ueber unverschluesseltes HTTP. Bei Direkt-HTTP im "
            "LAN ist False korrekt.",
            stacklevel=2,
        )
    if settings.cookie_secure and not settings.trust_proxy:
        warnings.warn(
            "METERS_TRUST_PROXY ist False, obwohl cookie_secure=True auf einen "
            "Reverse-Proxy-Setup hindeutet. Rate-Limit greift sonst auf die "
            "Proxy-IP zurueck und sperrt alle User gemeinsam. Bitte True setzen.",
            stacklevel=2,
        )
