"""DTOs für den gemischten, paginierten Erfassungs-Stream (``GET /entries``).

Ein ``EntryRead`` ist entweder eine Erfassung/Bestandskorrektur (``reading``)
oder eine Lieferung (``delivery``). ``previous_value`` ist der vorherige Stand
desselben Registers (nur bei reading/correction) — für die Verbrauchs-Delta-
Anzeige in der Liste, damit das Frontend nicht den ganzen Bestand laden muss.
"""

from __future__ import annotations

from typing import Literal

from meters.schemas.common import APIModel, DecimalStr
from meters.schemas.delivery import DeliveryRead
from meters.schemas.reading import ReadingRead


class EntryRead(APIModel):
    kind: Literal["reading", "correction", "delivery"]
    reading: ReadingRead | None = None
    delivery: DeliveryRead | None = None
    previous_value: DecimalStr | None = None


class EntriesPage(APIModel):
    items: list[EntryRead]
    total: int
