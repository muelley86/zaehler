/**
 * Abrechnungsläufe eines Kreises: Liste (Monat, Version, Status, Preis, Summe, Differenz) und Anlegen
 * eines Entwurfs für einen Monat. Details und Festschreiben auf der Seite des Laufs. Zwei bis zwölf
 * angehakte Läufe lassen sich auf der Vergleichsseite nebeneinanderstellen.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { Button, Section, TextField } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDe } from '@/lib/format';
import type { BillingRunRead, BillingRunSummary } from '@/lib/types';

import { errorText, lastDayOfPreviousMonth } from './circleForm';
import { eur, eurDiff, kwhDiff, mitProzent, RUN_STATUS_CLASS, RUN_STATUS_LABEL } from './runFormat';

const MIN_VERGLEICH = 2;
const MAX_VERGLEICH = 12;

export function BillingRunsSection({ circleId }: { circleId: number }) {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<BillingRunSummary[]>([]);
  const [monat, setMonat] = useState(() => lastDayOfPreviousMonth().slice(0, 7));
  const [begruendung, setBegruendung] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Zum Vergleich angehakte Läufe, in der Reihenfolge des Anhakens.
  const [auswahl, setAuswahl] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<BillingRunSummary[]>(`/billing-circles/${circleId}/runs`)
      .then((d) => {
        if (!cancelled) setRuns(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Konnte die Abrechnungsläufe nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [circleId]);

  const vergleichbar = auswahl.length >= MIN_VERGLEICH && auswahl.length <= MAX_VERGLEICH;

  function umschalten(runId: number) {
    setAuswahl((bisher) =>
      bisher.includes(runId) ? bisher.filter((id) => id !== runId) : [...bisher, runId],
    );
  }

  const festgeschrieben = runs.some((r) => r.monat === monat && r.status === 'festgeschrieben');

  async function anlegen(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const run = await api.post<BillingRunRead>(`/billing-circles/${circleId}/runs`, {
        monat,
        begruendung: begruendung.trim() || null,
      });
      void navigate(`/admin/abrechnungskreise/${circleId}/laeufe/${run.id}`);
    } catch (err) {
      setError(errorText(err, 'Anlegen fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section header="Abrechnungsläufe">
      <form onSubmit={(e) => void anlegen(e)} className="space-y-3 p-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TextField
            label="Abrechnungsmonat"
            type="month"
            value={monat}
            onChange={(e) => setMonat(e.target.value)}
            required
          />
          {festgeschrieben ? (
            <TextField
              label="Begründung neue Version"
              value={begruendung}
              onChange={(e) => setBegruendung(e.target.value)}
              maxLength={500}
              required
            />
          ) : null}
        </div>
        {error ? <div className="text-caption text-danger">{error}</div> : null}
        <Button type="submit" variant="filled" disabled={busy || !monat}>
          {busy ? 'Lege an…' : festgeschrieben ? 'Neue Version anlegen' : 'Entwurf anlegen'}
        </Button>
      </form>
      {runs.length === 0 ? (
        <div className="px-5 pb-5 text-caption text-tertiary">Noch keine Abrechnungsläufe.</div>
      ) : (
        <div className="overflow-x-auto px-5 pb-5">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <Button
              variant="bordered"
              size="sm"
              disabled={!vergleichbar}
              onClick={() =>
                void navigate(
                  `/admin/abrechnungskreise/${circleId}/vergleich?laeufe=${auswahl.join(',')}`,
                )
              }
            >
              {auswahl.length > 0 ? `Vergleichen (${auswahl.length})` : 'Vergleichen'}
            </Button>
            <span className="text-caption text-tertiary">
              {auswahl.length > MAX_VERGLEICH
                ? `Höchstens ${MAX_VERGLEICH} Läufe lassen sich vergleichen.`
                : 'Zwei oder mehr Läufe anhaken, um sie nebeneinanderzustellen.'}
            </span>
          </div>
          <table className="w-full text-left text-caption" aria-label="Abrechnungsläufe">
            <thead className="text-tertiary">
              <tr>
                <th className="w-8 py-1 pr-3">
                  <span className="sr-only">Zum Vergleich auswählen</span>
                </th>
                <th className="py-1 pr-3">Monat</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3 text-right">Preis</th>
                <th className="py-1 pr-3 text-right">Summe</th>
                <th className="py-1 pr-3 text-right">Differenz</th>
                <th className="py-1 pr-3 text-right">Differenz kWh</th>
                <th className="py-1 text-right">Blockierend</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-separator even:bg-fill">
                  <td className="py-1 pr-3">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      aria-label={`${r.monat} · V${r.version} zum Vergleich auswählen`}
                      checked={auswahl.includes(r.id)}
                      onChange={() => umschalten(r.id)}
                    />
                  </td>
                  <td className="py-1 pr-3">
                    <Link
                      to={`/admin/abrechnungskreise/${circleId}/laeufe/${r.id}`}
                      className="text-primary"
                    >
                      {r.monat} · V{r.version}
                    </Link>
                  </td>
                  <td className="py-1 pr-3">
                    <span className={`rounded-full px-2 py-0.5 ${RUN_STATUS_CLASS[r.status]}`}>
                      {RUN_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {r.preis_eur === null ? '—' : `${formatDe(r.preis_eur)} €/kWh`}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{eur(r.gesamt_eur)}</td>
                  <td className="py-1 pr-3 text-right whitespace-nowrap tabular-nums">
                    {mitProzent(eurDiff(r.differenz_eur), r.differenz_prozent)}
                  </td>
                  <td className="py-1 pr-3 text-right whitespace-nowrap tabular-nums">
                    {r.differenz_kwh === null
                      ? '—'
                      : mitProzent(kwhDiff(r.differenz_kwh), r.differenz_kwh_prozent)}
                  </td>
                  <td
                    className={`py-1 text-right tabular-nums ${
                      r.blocking_count > 0 ? 'text-danger' : ''
                    }`}
                  >
                    {r.status === 'entwurf' ? r.blocking_count : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
