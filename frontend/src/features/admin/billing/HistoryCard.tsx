/**
 * Verbrauchsverlauf (Plan Phase 5): festgeschriebene Monate je Empfänger bzw. je Position, wahlweise
 * in kWh oder Euro. Beantwortet die häufigste Rückfrage zur Rechnung – „warum ist es diesmal mehr?".
 */
import { useEffect, useState } from 'react';

import { Button, Section } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDe } from '@/lib/format';
import type { BillingHistory, BillingHistoryRow } from '@/lib/types';

import { errorText } from './circleForm';
import { eur } from './runFormat';

type Sicht = 'empfaenger' | 'positionen';
type Einheit = 'eur' | 'kwh';

/** "2026-08" → "08/26". */
function kurz(monat: string): string {
  const [jahr, mon] = monat.split('-');
  return `${mon ?? ''}/${jahr?.slice(2) ?? ''}`;
}

function Zelle({
  zeile,
  monat,
  einheit,
}: {
  zeile: BillingHistoryRow;
  monat: string;
  einheit: Einheit;
}) {
  const punkt = zeile.punkte.find((p) => p.monat === monat);
  if (!punkt) return <span className="text-tertiary">—</span>;
  return (
    <span title={`Version ${punkt.version}`}>
      {einheit === 'eur' ? eur(punkt.eur) : formatDe(punkt.kwh)}
    </span>
  );
}

export function HistoryCard({ circleId }: { circleId: number }) {
  const [data, setData] = useState<BillingHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sicht, setSicht] = useState<Sicht>('empfaenger');
  const [einheit, setEinheit] = useState<Einheit>('eur');

  useEffect(() => {
    let cancelled = false;
    api
      .get<BillingHistory>(`/billing-circles/${circleId}/verlauf`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Konnte den Verlauf nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [circleId]);

  if (!data) {
    return (
      <Section header="Verlauf">
        <div className="p-5 text-caption text-tertiary">{error ?? 'Lade…'}</div>
      </Section>
    );
  }

  if (data.monate.length === 0) {
    return (
      <Section header="Verlauf">
        <div className="p-5 text-caption text-tertiary">
          Noch kein festgeschriebener Monat in den letzten zwölf Monaten.
        </div>
      </Section>
    );
  }

  const zeilen = sicht === 'empfaenger' ? data.empfaenger : data.positionen;

  return (
    <Section header="Verlauf">
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={sicht === 'empfaenger' ? 'filled' : 'bordered'}
            size="sm"
            onClick={() => setSicht('empfaenger')}
          >
            Je Empfänger
          </Button>
          <Button
            variant={sicht === 'positionen' ? 'filled' : 'bordered'}
            size="sm"
            onClick={() => setSicht('positionen')}
          >
            Je Position
          </Button>
          <span className="flex-1" />
          <Button
            variant={einheit === 'eur' ? 'filled' : 'bordered'}
            size="sm"
            onClick={() => setEinheit('eur')}
          >
            Euro
          </Button>
          <Button
            variant={einheit === 'kwh' ? 'filled' : 'bordered'}
            size="sm"
            onClick={() => setEinheit('kwh')}
          >
            kWh
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-caption" aria-label="Verlauf">
            <thead className="text-tertiary">
              <tr>
                <th scope="col" className="py-1 pr-3">
                  {sicht === 'empfaenger' ? 'Empfänger' : 'Position'}
                </th>
                {data.monate.map((m) => (
                  <th key={m} scope="col" className="py-1 pr-3 text-right font-normal">
                    {kurz(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.name} className="border-t border-separator">
                  <th scope="row" className="py-1 pr-3 text-left font-normal text-label">
                    {z.name || '(ohne Empfänger)'}
                    {z.internal_allocation ? (
                      <span className="ml-2 rounded-full bg-fill px-2 py-0.5 text-tertiary">
                        intern
                      </span>
                    ) : null}
                  </th>
                  {data.monate.map((m) => (
                    <td key={m} className="py-1 pr-3 text-right tabular-nums">
                      <Zelle zeile={z} monat={m} einheit={einheit} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}
