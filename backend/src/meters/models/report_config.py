"""ReportConfig — gespeicherte, GETEILTE Auswertungs-Konfiguration.

Benannte Vorlage fuer den Auswertungen-Bereich (Dimension, Granularitaet,
Zeitraum-Definition, Filter). Wie Owners/Locations ein geteilter Stammdaten-
Satz: jeder eingeloggte User darf lesen/ausfuehren, nur Admin anlegen/aendern/
loeschen. Die eigentliche Aggregation passiert ad hoc ueber den
``/reports/aggregate``-Endpoint; hier werden nur die Parameter persistiert.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import JSON, Date, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from meters.db import Base, TimestampMixin
from meters.models._enums import ReportDimension, ReportGranularity, ReportPeriodKind


class ReportConfig(Base, TimestampMixin):
    __tablename__ = "report_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    dimension: Mapped[ReportDimension] = mapped_column(
        SAEnum(ReportDimension, name="report_dimension", native_enum=False, length=20),
        nullable=False,
    )
    granularity: Mapped[ReportGranularity] = mapped_column(
        SAEnum(ReportGranularity, name="report_granularity", native_enum=False, length=10),
        nullable=False,
    )
    period_kind: Mapped[ReportPeriodKind] = mapped_column(
        SAEnum(ReportPeriodKind, name="report_period_kind", native_enum=False, length=20),
        nullable=False,
    )
    # Nur bei period_kind=FIXED gesetzt.
    from_date: Mapped[date | None] = mapped_column(Date)
    to_date: Mapped[date | None] = mapped_column(Date)
    # Kategoriale Filter (typisiert ueber ReportFilterModel im Schema serialisiert).
    filters: Mapped[dict[str, Any] | None] = mapped_column(JSON)
