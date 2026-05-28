"""QR-Token-Verheiratung (Feature A).

Anonyme Tokens werden im Vorrat erzeugt, später Messstellen zugeordnet.
Beim Scan ruft der Frontend ``GET /qr-tokens/{token}/resolve`` und navigiert
in die Erfassungsmaske der zugeordneten MP. Berechtigung zum Zuweisen:
Admin oder Recorder mit Flag ``can_assign_qr_tokens``.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from meters.api.deps import AdminUser, CurrentUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    MeasuringPoint,
    QrToken,
    User,
    UserRole,
)
from meters.schemas import (
    QrTokenAssignRequest,
    QrTokenBulkCreateRequest,
    QrTokenRead,
    QrTokenResolveResponse,
)
from meters.services.access import accessible_mp_ids, assert_can_access_mp
from meters.services.audit import record
from meters.services.qr import qr_png_bytes, qr_svg_bytes
from meters.services.qr_token import (
    assign_token,
    bulk_create_tokens,
    find_by_token,
    unassign_token,
)

router = APIRouter(prefix="/qr-tokens", tags=["qr-tokens"])
logger = logging.getLogger(__name__)

# Größenmapping für QR-Generierung — analog zum bisherigen Direkt-URL-Endpoint.
_QR_BOX_SIZES: dict[str, int] = {"small": 6, "medium": 8, "large": 12}


def _to_read(token: QrToken, *, mp_name: str | None = None) -> QrTokenRead:
    return QrTokenRead(
        id=token.id,
        token=token.token,
        measuring_point_id=token.measuring_point_id,
        measuring_point_name=mp_name,
        created_at=token.created_at,
        created_by_user_id=token.created_by_user_id,
        assigned_at=token.assigned_at,
        assigned_by_user_id=token.assigned_by_user_id,
    )


def _build_token_url(request: Request, token_str: str) -> str:
    """``${scheme}://${host}/q/${token}`` — kompakte URL für QR-Codes.

    Der Shortpath ``/q/X`` spart gegenüber ``/erfassen?token=X`` 13 Zeichen,
    was den QR-Code typischerweise eine Version kleiner werden lässt
    (V3 -> V2: 29x29 -> 25x25 Module). Bei 10 mm Etikettengroesse entspricht
    das ~17 % größeren Modulen — spürbar bessere Scannbarkeit auf den
    schmalen Avery-Etiketten.

    Frontend hat eine SPA-Route ``/q/:token``, die intern auf
    ``/erfassen?token=...`` weiterleitet (siehe ``App.tsx``). Die
    Legacy-URL ``/erfassen?token=...`` bleibt parallel gültig — bestehende
    geklebte Etiketten funktionieren weiter.
    """
    scheme = request.url.scheme or "http"
    host = request.url.netloc or request.headers.get("host", "")
    return f"{scheme}://{host}/q/{token_str}"


def _can_user_assign(user: User) -> bool:
    return user.role is UserRole.ADMIN or user.can_assign_qr_tokens


# ---------------------------------------------------------------------------
# Listing & Bulk-Create
# ---------------------------------------------------------------------------


@router.get("", response_model=list[QrTokenRead])
def list_tokens(
    db: DbDep,
    _admin: AdminUser,
    status_filter: Literal["all", "assigned", "unassigned"] = Query("all", alias="status"),
    measuring_point_id: int | None = Query(None),
) -> list[QrTokenRead]:
    """Listet alle Tokens. Filter nach Zuordnungsstatus oder MP-ID."""
    stmt = select(QrToken).order_by(QrToken.created_at.desc(), QrToken.id.desc())
    # measuring_point_id impliziert assigned-Status (überschreibt status_filter).
    if measuring_point_id is not None:
        stmt = stmt.where(QrToken.measuring_point_id == measuring_point_id)
    elif status_filter == "assigned":
        stmt = stmt.where(QrToken.measuring_point_id.is_not(None))
    elif status_filter == "unassigned":
        stmt = stmt.where(QrToken.measuring_point_id.is_(None))

    rows = list(db.scalars(stmt))
    # MP-Namen separat in einem Schritt laden (kleiner Datensatz, einfacher
    # als joinedload-Magie auf der nullable-FK).
    mp_ids = {r.measuring_point_id for r in rows if r.measuring_point_id is not None}
    mp_names: dict[int, str] = {}
    if mp_ids:
        for mp in db.scalars(select(MeasuringPoint).where(MeasuringPoint.id.in_(mp_ids))):
            mp_names[mp.id] = mp.name
    return [
        _to_read(r, mp_name=mp_names.get(r.measuring_point_id) if r.measuring_point_id else None)
        for r in rows
    ]


@router.post("", response_model=list[QrTokenRead], status_code=status.HTTP_201_CREATED)
def bulk_create(
    payload: QrTokenBulkCreateRequest,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> list[QrTokenRead]:
    """Erzeugt mehrere unzugeordnete Tokens auf einmal."""
    tokens = bulk_create_tokens(db, count=payload.count, created_by_user_id=admin.id)
    ip = client_ip(request)
    for t in tokens:
        record(
            db,
            user_id=admin.id,
            action=AuditAction.TOKEN_CREATED,
            entity_type=AuditEntityType.QR_TOKEN,
            entity_id=t.id,
            diff={"token": t.token},
            ip_address=ip,
        )
    db.commit()
    return [_to_read(t) for t in tokens]


# ---------------------------------------------------------------------------
# Pro-Token: assign/unassign/delete/qr/resolve
# ---------------------------------------------------------------------------


def _load_or_404(db: DbSession, token_str: str) -> QrToken:
    t = find_by_token(db, token_str)
    if t is None:
        raise ProblemError(status_code=404, title="Token not found")
    return t


@router.get("/print-bootstrap.js", include_in_schema=False)
def print_bootstrap_script() -> Response:
    """Statisches JS für die Bulk-Druck-Seite.

    Hintergrund: Die App setzt ``Content-Security-Policy: script-src 'self'``.
    Das via ``window.open('') + document.write`` erzeugte Druck-Fenster ist
    ``about:blank`` und erbt die CSP des Openers — Inline-``<script>`` und
    ``onclick=""`` werden dort blockiert. Das Bootstrap-JS wird stattdessen
    via ``<script src="…">`` geladen, was ``script-src 'self'`` erlaubt.

    Verhalten:
    - Wartet, bis alle Bilder (= QR-SVGs) geladen sind, dann ``window.print()``.
    - Hängt einen delegierten Click-Handler an document, der
      ``[data-action="print"]`` und ``[data-action="close"]`` bedient.

    Kein User-spezifischer Inhalt → öffentlich cachebar (5 min reicht; bei
    Code-Änderung wird die Datei beim nächsten Reload aktualisiert).
    """
    body = b"""(function () {
  'use strict';
  var imgs = Array.prototype.slice.call(document.images);
  var pending = imgs.length;
  function autoprint() {
    setTimeout(function () { try { window.focus(); } catch (e) {} window.print(); }, 600);
  }
  if (pending === 0) {
    autoprint();
  } else {
    imgs.forEach(function (img) {
      if (img.complete) {
        if (--pending === 0) autoprint();
      } else {
        var done = function () { if (--pending === 0) autoprint(); };
        img.addEventListener('load', done);
        img.addEventListener('error', done);
      }
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    var btn = t.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'print') {
      window.print();
    } else if (action === 'close') {
      window.close();
    }
  });
})();
"""
    return Response(
        content=body,
        media_type="application/javascript",
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/{token_str}/qr")
def render_qr(
    token_str: str,
    request: Request,
    db: DbDep,
    _admin: AdminUser,
    format: Literal["png", "svg"] = "png",
    size: Literal["small", "medium", "large"] = "medium",
) -> Response:
    """Rendert den QR-Code (PNG/SVG) mit Inhalt ``…/erfassen?token=…``."""
    _load_or_404(db, token_str)
    url = _build_token_url(request, token_str)
    box_size = _QR_BOX_SIZES[size]
    # Render in try/except, damit beim Bulk-Druck eines vollen Bogens
    # (z. B. Avery l4731rev mit 189 Etiketten) jeder einzelne Fehler im
    # Log landet und das Frontend einen brauchbaren Detail-Text bekommt
    # statt einem nackten 500. Mögliche Ursachen: qrcode-DataOverflow,
    # Pillow-IO, Threadpool-Drift unter dichtem Concurrency-Load.
    try:
        if format == "svg":
            body = qr_svg_bytes(url, box_size=box_size)
            media_type = "image/svg+xml"
        else:
            body = qr_png_bytes(url, box_size=box_size)
            media_type = "image/png"
    except Exception as exc:
        logger.exception("QR-Render fehlgeschlagen fuer Token %s (format=%s)", token_str, format)
        raise ProblemError(
            status_code=500,
            title="QR render failed",
            detail=f"{type(exc).__name__}: {exc}",
        ) from exc
    return Response(
        content=body,
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
    )


@router.get("/{token_str}/resolve", response_model=QrTokenResolveResponse)
def resolve_token(
    token_str: str,
    db: DbDep,
    user: CurrentUser,
) -> QrTokenResolveResponse:
    """Liefert die zugeordnete MP (falls bekannt) plus Berechtigung des
    aktuellen Users zur Zuordnung.

    Sicherheits-Verhalten:
    - Token unbekannt → 404 (kein Leak gültiger Tokens).
    - Token zugeordnet, aber User hat keinen Zugriff auf die MP → 404
      (kein Leak fremder MP-Existenz). Admin sieht alle.
    - Token unzugeordnet → 200 mit ``measuring_point_id=null`` und der
      ``can_assign``-Info, damit der Frontend ein Assign-Modal anbieten
      oder einen Hinweis "Bitte Admin um Zuordnung" zeigen kann.
    """
    token = _load_or_404(db, token_str)

    if token.measuring_point_id is not None:
        # Zuordnung existiert — User muss Zugriff auf die MP haben
        accessible = accessible_mp_ids(db, user)
        if accessible is not None and token.measuring_point_id not in accessible:
            raise ProblemError(status_code=404, title="Token not found")
        return QrTokenResolveResponse(
            measuring_point_id=token.measuring_point_id,
            can_assign=_can_user_assign(user),
        )

    return QrTokenResolveResponse(
        measuring_point_id=None,
        can_assign=_can_user_assign(user),
    )


@router.post("/{token_str}/assign", response_model=QrTokenRead)
def assign(
    token_str: str,
    payload: QrTokenAssignRequest,
    request: Request,
    db: DbDep,
    user: CurrentUser,
) -> QrTokenRead:
    """Ordnet den Token einer Messstelle zu.

    Berechtigt sind:
    - Admins (immer)
    - Recorder mit Flag ``can_assign_qr_tokens=True`` — sie dürfen aber nur
      MPs zuweisen, auf die sie selbst Zugriff haben.

    Bereits zugeordnete Tokens werden mit 409 abgelehnt — explizites
    ``DELETE /qr-tokens/{token}/assign`` muss vorher den alten Eintrag
    entfernen, damit Verhängungen nicht versehentlich überschrieben werden.
    """
    if not _can_user_assign(user):
        raise ProblemError(
            status_code=403,
            title="Forbidden",
            detail=(
                "Diese Aktion erfordert Admin-Rechte oder die Berechtigung zur QR-Code-Zuweisung."
            ),
        )

    token = _load_or_404(db, token_str)
    if token.measuring_point_id is not None:
        raise ProblemError(
            status_code=409,
            title="Token already assigned",
            detail=(
                "Dieser Token ist bereits einer Messstelle zugeordnet. "
                "Bitte zuerst die bestehende Zuordnung lösen."
            ),
            extra={"measuring_point_id": token.measuring_point_id},
        )

    # MP-Existenz + Zugriff prüfen. assert_can_access_mp wirft 404, wenn der
    # Recorder keinen Zugriff hat — aus Sicht des Endpoints ist es derselbe
    # Fehlerfall wie "MP existiert nicht".
    if db.get(MeasuringPoint, payload.measuring_point_id) is None:
        raise ProblemError(status_code=404, title="Measuring point not found")
    assert_can_access_mp(db, user, payload.measuring_point_id)

    assign_token(
        db,
        token=token,
        measuring_point_id=payload.measuring_point_id,
        assigned_by_user_id=user.id,
    )
    record(
        db,
        user_id=user.id,
        action=AuditAction.TOKEN_ASSIGNED,
        entity_type=AuditEntityType.QR_TOKEN,
        entity_id=token.id,
        diff={
            "token": token.token,
            "measuring_point_id": payload.measuring_point_id,
        },
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(token)
    mp = db.get(MeasuringPoint, token.measuring_point_id) if token.measuring_point_id else None
    return _to_read(token, mp_name=mp.name if mp else None)


@router.delete("/{token_str}/assign", response_model=QrTokenRead)
def unassign(
    token_str: str,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> QrTokenRead:
    """Hebt die Zuweisung auf, der Token bleibt zur erneuten Vergabe verfügbar."""
    token = _load_or_404(db, token_str)
    previous_mp = token.measuring_point_id
    if not unassign_token(db, token=token):
        raise ProblemError(
            status_code=409,
            title="Token not assigned",
            detail="Dieser Token ist keiner Messstelle zugeordnet.",
        )
    record(
        db,
        user_id=admin.id,
        action=AuditAction.TOKEN_UNASSIGNED,
        entity_type=AuditEntityType.QR_TOKEN,
        entity_id=token.id,
        diff={"token": token.token, "previous_measuring_point_id": previous_mp},
        ip_address=client_ip(request),
    )
    db.commit()
    return _to_read(token)


@router.delete("/{token_str}", status_code=204)
def delete_token(
    token_str: str,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> None:
    """Löscht den Token komplett. Sticker wird damit unbrauchbar — nur
    sinnvoll, wenn Etikett zerstört oder verloren ist."""
    token = _load_or_404(db, token_str)
    record(
        db,
        user_id=admin.id,
        action=AuditAction.TOKEN_DELETED,
        entity_type=AuditEntityType.QR_TOKEN,
        entity_id=token.id,
        diff={"token": token.token, "measuring_point_id": token.measuring_point_id},
        ip_address=client_ip(request),
    )
    db.delete(token)
    db.commit()
