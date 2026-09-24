/**
 * Versionsvergleich (Plan Phase 5): stellt den Lauf seiner Vorversion gegenüber und zeigt je
 * Position, was sich geändert hat. Damit ist eine Korrekturversion nachvollziehbar, ohne zwei
 * Ausdrucke nebeneinanderzulegen.
 */
import { useEffect, useState } from 'react';

import { Section } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDe } from '@/lib/format';
import type { BillingDiffStatus, BillingRunDiff } from '@/lib/types';

import { errorText } from './circleForm';
import { eur } from './runFormat';

const STATUS_LABEL: Record<BillingDiffStatus, string> = {
  gleich: 'unverändert',
  geaendert: 'geändert',
  neu: 'neu',
  entfallen: 'entfallen',
};

const STATUS_CLASS: Record<BillingDiffStatus, string> = {
  gleich: 'text-tertiary',
  geaendert: 'bg-warning/15 text-warning',
  neu: 'bg-success/10 text-success',
  entfallen: 'bg-danger/10 text-danger',
};

/** Feldnamen aus dem Vergleich in die Sprache der Oberfläche. */
const FELD_LABEL: Record<string, string> = {
  owner_name: 'Empfänger',
  kostenstelle: 'Kostenstelle',
  invoice_line: 'Rechnungszeile',
  serial_numbers: 'Zählernummer',
  transformer_factor: 'Wandlerfaktor',
  stand_alt: 'Stand alt',
  stand_neu: 'Stand neu',
  korrektur: 'Korrektur',
  kwh: 'kWh',
  eur: 'Betrag',
};

/** Preis einer Seite; ohne Ergebnis (Entwurf mit Fehler) steht dort kein Nullwert, sondern "—". */
function preis(wert: string | null): string {
  return wert === null ? '—' : `${formatDe(wert)} €/kWh`;
}

function Delta({ wert, einheit }: { wert: string | null; einheit: 'kwh' | 'eur' }) {
  if (wert === null || Number(wert) === 0) return <span className="text-tertiary">—</span>;
  const positiv = Number(wert) > 0;
  return (
    <span className={positiv ? 'text-warning' : 'text-primary'}>
      {positiv ? '+' : ''}
      {einheit === 'eur' ? eur(wert) : formatDe(wert)}
    </span>
  );
}

export function RunDiffSection({ circleId, runId }: { circleId: number; runId: number }) {
  const [diff, setDiff] = useState<BillingRunDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<BillingRunDiff>(`/billing-circles/${circleId}/runs/${runId}/vergleich`)
      .then((d) => {
        if (!cancelled) setDiff(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Konnte den Vergleich nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [circleId, runId]);

  if (!diff) {
    return error ? (
      <Section header="Vergleich mit der Vorversion">
        <div className="p-5 text-caption text-tertiary">{error}</div>
      </Section>
    ) : null;
  }

  const geaendert = diff.zeilen.filter((z) => z.status !== 'gleich');

  return (
    <Section header={`Vergleich Version ${diff.alt.version} → ${diff.neu.version}`}>
      <div className="space-y-3 p-5">
        {diff.neu.begruendung ? (
          <div className="text-caption text-secondary">
            Begründung: <span className="text-label">{diff.neu.begruendung}</span>
          </div>
        ) : null}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-caption sm:grid-cols-4">
          <dt className="text-tertiary">Preis</dt>
          <dd className="tabular-nums">
            {preis(diff.alt.preis_eur)} → {preis(diff.neu.preis_eur)}
          </dd>
          <dt className="text-tertiary">Summe</dt>
          <dd className="tabular-nums">
            {eur(diff.alt.gesamt_eur)} → {eur(diff.neu.gesamt_eur)}
          </dd>
          <dt className="text-tertiary">Differenz kWh</dt>
          <dd className="tabular-nums">
            <Delta wert={diff.kwh_delta} einheit="kwh" />
          </dd>
          <dt className="text-tertiary">Differenz Betrag</dt>
          <dd className="tabular-nums">
            <Delta wert={diff.eur_delta} einheit="eur" />
          </dd>
        </dl>

        {geaendert.length === 0 ? (
          <div className="rounded-card bg-fill p-3 text-caption text-secondary">
            Keine Zeile hat sich geändert – die Versionen unterscheiden sich nur in den Parametern.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-caption" aria-label="Geänderte Zeilen">
              <thead className="text-tertiary">
                <tr>
                  <th scope="col" className="py-1 pr-3">
                    Position
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    Was
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right">
                    kWh
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right">
                    Δ kWh
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right">
                    Betrag
                  </th>
                  <th scope="col" className="py-1 text-right">
                    Δ Betrag
                  </th>
                </tr>
              </thead>
              <tbody>
                {geaendert.map((z) => (
                  <tr key={z.label} className="border-t border-separator even:bg-fill">
                    <td className="py-1 pr-3 text-label">
                      {z.label}
                      <span className={`ml-2 rounded-full px-1.5 py-0.5 ${STATUS_CLASS[z.status]}`}>
                        {STATUS_LABEL[z.status]}
                      </span>
                    </td>
                    <td className="py-1 pr-3 text-secondary">
                      {z.felder.map((f) => FELD_LABEL[f] ?? f).join(', ') || '—'}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {z.kwh_alt !== null ? formatDe(z.kwh_alt) : '—'} →{' '}
                      {z.kwh_neu !== null ? formatDe(z.kwh_neu) : '—'}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      <Delta wert={z.kwh_delta} einheit="kwh" />
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {eur(z.eur_alt)} → {eur(z.eur_neu)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      <Delta wert={z.eur_delta} einheit="eur" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-caption text-tertiary">
          {diff.zeilen.length - geaendert.length} von {diff.zeilen.length} Zeilen unverändert.
        </p>
      </div>
    </Section>
  );
}
