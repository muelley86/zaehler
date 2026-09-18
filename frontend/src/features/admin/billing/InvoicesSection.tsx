/**
 * Eingangsrechnungen eines Abrechnungskreises: PDF hochladen (der Server liest Kopf und Positionen
 * und prüft die Abnahmestelle), Liste je Monat mit aufklappbaren Positionen, Original-PDF öffnen,
 * falsch importierte Rechnung löschen.
 */
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Trash2 } from 'lucide-react';

import { Section } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateDe, formatDe } from '@/lib/format';
import type { BillingInvoiceRead } from '@/lib/types';

import { errorText } from './circleForm';
import { InvoiceUpload } from './InvoiceUpload';

const eur = (v: string) =>
  `${formatDe(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function InvoicesSection({ circleId }: { circleId: number }) {
  const [invoices, setInvoices] = useState<BillingInvoiceRead[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<BillingInvoiceRead[]>(`/billing-circles/${circleId}/invoices`)
      .then((d) => {
        if (!cancelled) setInvoices(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Konnte die Rechnungen nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [circleId, tick]);

  async function remove(inv: BillingInvoiceRead) {
    if (!window.confirm(`Rechnung ${inv.nummer} wirklich löschen?`)) return;
    try {
      await api.delete(`/billing-circles/${circleId}/invoices/${inv.id}`);
      setTick((t) => t + 1);
    } catch (err) {
      setError(errorText(err, 'Löschen fehlgeschlagen.'));
    }
  }

  return (
    <Section header="Rechnungen">
      <div className="space-y-3 p-5">
        <InvoiceUpload
          circleId={circleId}
          onImported={(inv) => {
            setOpen(inv.id);
            setTick((t) => t + 1);
          }}
        />
        {error ? <div className="text-caption text-danger">{error}</div> : null}
      </div>
      {invoices.length === 0 ? (
        <div className="px-5 pb-5 text-caption text-tertiary">Noch keine Rechnungen.</div>
      ) : (
        <ul className="divide-y divide-separator" aria-label="Rechnungen">
          {invoices.map((inv) => {
            const expanded = open === inv.id;
            return (
              <li key={inv.id} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : inv.id)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span className="min-w-0">
                      <span className="block truncate text-body font-semibold text-label">
                        {formatDateDe(inv.period_from)} – {formatDateDe(inv.period_to)} ·{' '}
                        {eur(inv.betrag_netto)}
                      </span>
                      <span className="block truncate text-caption text-tertiary">
                        Nr. {inv.nummer} vom {formatDateDe(inv.datum)} ·{' '}
                        {formatDe(inv.verbrauch_kwh)} kWh
                        {inv.hinweise.length > 0 ? ` · ${inv.hinweise.length} Hinweise` : ''}
                      </span>
                    </span>
                  </button>
                  <a
                    href={`/api/v1/billing-circles/${circleId}/invoices/${inv.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`PDF der Rechnung ${inv.nummer} öffnen`}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-secondary hover:bg-fill"
                  >
                    <FileText size={14} />
                  </a>
                  <button
                    type="button"
                    onClick={() => void remove(inv)}
                    aria-label={`Rechnung ${inv.nummer} löschen`}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-danger hover:bg-danger/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {expanded ? (
                  <div className="mt-2 space-y-2 pl-6">
                    {inv.hinweise.length > 0 ? (
                      <ul className="space-y-1 text-caption text-secondary">
                        {inv.hinweise.map((h, i) => (
                          <li key={i}>Hinweis: {h}</li>
                        ))}
                      </ul>
                    ) : null}
                    <table className="w-full text-caption">
                      <thead className="text-tertiary">
                        <tr>
                          <th className="py-1 text-left font-normal">Position</th>
                          <th className="py-1 text-right font-normal">Menge kWh</th>
                          <th className="py-1 text-right font-normal">ct/kWh</th>
                          <th className="py-1 text-right font-normal">Betrag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inv.positions.map((p) => (
                          <tr key={p.id} className="border-t border-separator">
                            <td className="py-1 text-label">
                              {p.name}
                              {p.kategorie ? (
                                <span className="ml-1 text-tertiary">({p.kategorie})</span>
                              ) : null}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {p.menge !== null ? formatDe(p.menge) : ''}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {p.preis_ct !== null ? formatDe(p.preis_ct) : ''}
                            </td>
                            <td className="py-1 text-right tabular-nums">{eur(p.betrag)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
