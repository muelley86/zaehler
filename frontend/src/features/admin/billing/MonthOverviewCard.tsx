/**
 * Monatsübersicht (Plan Phase 5): eine Zeile je Abrechnungskreis, eine Spalte je Monat. Die Zelle
 * zeigt, wie weit der Monat ist – leer, Rechnung da, Entwurf, festgeschrieben, übertragen – und
 * führt per Klick zum Lauf bzw. zum Kreis. Der Zeitraum lässt sich jahrweise verschieben.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button, Section } from '@/components/ui';
import { api } from '@/lib/api';
import type { BillingMonthCell, BillingMonthOverview, BillingMonthStatus } from '@/lib/types';

import { errorText } from './circleForm';
import { eur, monateVerschieben } from './runFormat';

const STATUS_LABEL: Record<BillingMonthStatus, string> = {
  leer: '–',
  rechnung: 'RG',
  entwurf: 'E',
  festgeschrieben: 'F',
  uebertragen: 'Ü',
};

const STATUS_CLASS: Record<BillingMonthStatus, string> = {
  leer: 'bg-fill/50 text-tertiary',
  rechnung: 'bg-fill-strong text-secondary',
  entwurf: 'bg-warning/15 text-warning',
  festgeschrieben: 'bg-success/10 text-success',
  uebertragen: 'bg-success text-white',
};

const STATUS_TEXT: Record<BillingMonthStatus, string> = {
  leer: 'nichts erfasst',
  rechnung: 'Rechnung importiert, kein Lauf',
  entwurf: 'Entwurf',
  festgeschrieben: 'festgeschrieben',
  uebertragen: 'nach Agrarmonitor übertragen',
};

/** "2026-08" → "08/26" für Spaltenkopf und Zellentitel. */
function kurz(monat: string): string {
  const [jahr, mon] = monat.split('-');
  return `${mon ?? ''}/${jahr?.slice(2) ?? ''}`;
}

function titel(zelle: BillingMonthCell): string {
  const teile = [STATUS_TEXT[zelle.status]];
  if (zelle.version !== null) teile.push(`Version ${zelle.version}`);
  if (zelle.eur !== null) teile.push(eur(zelle.eur));
  if (zelle.empfaenger > 0) teile.push(`${zelle.uebertragen}/${zelle.empfaenger} übertragen`);
  if (zelle.blocking > 0) teile.push(`${zelle.blocking} blockierende Befunde`);
  return teile.join(' · ');
}

export function MonthOverviewCard({ tick = 0 }: { tick?: number }) {
  const [zeitraum, setZeitraum] = useState<[string, string] | null>(null);
  const [data, setData] = useState<BillingMonthOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const frage = zeitraum ? `?von=${zeitraum[0]}&bis=${zeitraum[1]}` : '';
    api
      .get<BillingMonthOverview>(`/billing-circles/overview${frage}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Konnte die Monatsübersicht nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [zeitraum, tick]);

  if (!data) {
    return (
      <Section header="Monatsübersicht">
        <div className="p-5 text-caption text-tertiary">{error ?? 'Lade…'}</div>
      </Section>
    );
  }

  return (
    <Section header="Monatsübersicht">
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="bordered"
            size="sm"
            leftIcon={<ChevronLeft size={14} />}
            onClick={() => setZeitraum(monateVerschieben(data.von, data.bis, -12))}
          >
            Früher
          </Button>
          <span className="text-caption text-tertiary">
            {kurz(data.von)} – {kurz(data.bis)}
          </span>
          <Button
            variant="bordered"
            size="sm"
            rightIcon={<ChevronRight size={14} />}
            onClick={() => setZeitraum(monateVerschieben(data.von, data.bis, 12))}
          >
            Später
          </Button>
        </div>
        {error ? <div className="text-caption text-danger">{error}</div> : null}
        {data.kreise.length === 0 ? (
          <div className="text-caption text-tertiary">Noch keine Abrechnungskreise.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-caption" aria-label="Monatsübersicht">
              <thead className="text-tertiary">
                <tr>
                  <th scope="col" className="py-1 pr-3">
                    Kreis
                  </th>
                  {data.monate.map((m) => (
                    <th key={m} scope="col" className="py-1 pr-1 text-center font-normal">
                      {kurz(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.kreise.map((k) => (
                  <tr key={k.circle_id} className="border-t border-separator even:bg-fill">
                    <th scope="row" className="py-1 pr-3 text-left font-normal">
                      <Link to={`/admin/abrechnungskreise/${k.circle_id}`} className="text-primary">
                        {k.code}
                      </Link>
                    </th>
                    {k.monate.map((z) => (
                      <td key={z.monat} className="py-1 pr-1 text-center">
                        <Link
                          to={
                            z.run_id === null
                              ? `/admin/abrechnungskreise/${k.circle_id}/assistent?monat=${z.monat}`
                              : `/admin/abrechnungskreise/${k.circle_id}/laeufe/${z.run_id}`
                          }
                          title={`${k.code} ${kurz(z.monat)}: ${titel(z)}`}
                          aria-label={`${k.code} ${kurz(z.monat)}: ${titel(z)}`}
                          className={`inline-block w-7 rounded px-1 py-0.5 ${STATUS_CLASS[z.status]}`}
                        >
                          {STATUS_LABEL[z.status]}
                        </Link>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-caption text-tertiary">
          RG = Rechnung importiert · E = Entwurf · F = festgeschrieben · Ü = nach Agrarmonitor
          übertragen
        </p>
      </div>
    </Section>
  );
}
