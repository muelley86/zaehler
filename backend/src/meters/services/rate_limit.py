"""Einfacher In-Memory Token-Bucket fuer Login-Fehlversuche pro IP.

Process-lokal — fuer eine Single-Instance-LXC-Deployment ausreichend. Bei
Mehr-Worker-Setup waere ein gemeinsamer Speicher (Redis o.ae.) noetig; das
ist hier bewusst nicht implementiert, da die App als ein Prozess laeuft.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field

from meters.core.config import settings


@dataclass(slots=True)
class _IPState:
    failures: deque[float] = field(default_factory=deque)
    locked_until: float = 0.0


class LoginRateLimiter:
    def __init__(
        self,
        *,
        max_attempts: int | None = None,
        window_seconds: int | None = None,
        lockout_seconds: int | None = None,
    ) -> None:
        self._max = max_attempts if max_attempts is not None else settings.login_max_attempts
        self._window = (
            window_seconds if window_seconds is not None else settings.login_window_seconds
        )
        self._lockout = (
            lockout_seconds if lockout_seconds is not None else settings.login_lockout_seconds
        )
        self._state: dict[str, _IPState] = {}
        self._lock = threading.Lock()

    def check(self, ip: str) -> float | None:
        """Liefert ``None`` wenn erlaubt, sonst Sekunden bis zum Ende der Sperre."""
        now = time.monotonic()
        with self._lock:
            state = self._state.get(ip)
            if state is None:
                return None
            if state.locked_until > now:
                return state.locked_until - now
            self._trim(state, now)
            return None

    def record_failure(self, ip: str) -> float | None:
        now = time.monotonic()
        with self._lock:
            state = self._state.setdefault(ip, _IPState())
            self._trim(state, now)
            state.failures.append(now)
            if len(state.failures) >= self._max:
                state.locked_until = now + self._lockout
                state.failures.clear()
                return float(self._lockout)
            return None

    def record_success(self, ip: str) -> None:
        with self._lock:
            self._state.pop(ip, None)

    def _trim(self, state: _IPState, now: float) -> None:
        cutoff = now - self._window
        while state.failures and state.failures[0] < cutoff:
            state.failures.popleft()


login_limiter = LoginRateLimiter()

# Zweiter Limiter pro Username — schützt gegen IP-Hopping (Mobilfunk, IPv6
# Privacy Extensions, Tor). Etwas großzügiger als der IP-Limiter, weil ein
# legitimer User mal das Passwort tippt; bei dauerhaft falschen Eingaben
# greift eine längere Sperre. Username wird vor Verwendung lowergecast,
# damit ``Admin``/``admin`` denselben Bucket teilen.
username_limiter = LoginRateLimiter(
    max_attempts=10,
    window_seconds=10 * 60,
    lockout_seconds=30 * 60,
)
