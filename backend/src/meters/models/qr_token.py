"""QrToken — anonymer QR-Code, der einer Messstelle zugeordnet werden kann.

Workflow:

1. Admin erzeugt eine oder mehrere Tokens auf Vorrat (``measuring_point_id``
   ist initial NULL).
2. Tokens werden im Bulk auf Etikettenpapier gedruckt.
3. Bei der Inbetriebnahme klebt jemand einen Sticker auf den Zähler und
   ordnet den Token einer Messstelle zu (Admin oder Recorder mit Flag
   :attr:`User.can_assign_qr_tokens`).
4. Beim Scannen wird ``GET /qr-tokens/{token}/resolve`` aufgerufen, das
   die zugeordnete MP zurückliefert.

Token-String ist 8 Zeichen Crockford-Base32 (32^8 ≈ 10^12 Möglichkeiten,
keine visuell mehrdeutigen Zeichen — kein I, L, O, U, 0, 1).

Mehrere Tokens dürfen auf dieselbe MP zeigen (z.B. zweiter Sticker an
einem alternativen Eingang). Nicht erlaubt: dass ein Token gleichzeitig
zu zwei MPs gehört — das ist durch die einfache FK-Spalte gegeben.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from meters.db import Base


class QrToken(Base):
    __tablename__ = "qr_token"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 8 Zeichen Crockford-Base32 — UNIQUE im Index, sonst kein
    # Sortier-Kriterium.
    token: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)
    measuring_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("measuring_point.id", ondelete="SET NULL"),
    )
    # Erstellung — created_by ist nicht-nullable, damit Audit-Trail
    # rückwirkend lesbar bleibt. RESTRICT, kein Cascade.
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp(), nullable=False,
    )
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id"), nullable=False,
    )
    # Zuweisung — beide nullable, da unzugewiesene Tokens existieren.
    assigned_at: Mapped[datetime | None] = mapped_column()
    assigned_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("user.id"))
