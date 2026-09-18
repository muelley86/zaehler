"""Kleine Helfer rund um die Rechnung eines Abrechnungslaufs."""

from __future__ import annotations

from sqlalchemy.orm import Session

from meters.core.problem import ProblemError
from meters.models import BillingInvoice, BillingRun


def invoice_of_run(db: Session, run: BillingRun) -> BillingInvoice:
    """Die Rechnung des Laufs; der RESTRICT-FK garantiert, dass sie existiert."""
    invoice = db.get(BillingInvoice, run.invoice_id)
    if invoice is None:  # pragma: no cover - durch ondelete=RESTRICT ausgeschlossen
        raise ProblemError(status_code=404, title="Invoice not found")
    return invoice
