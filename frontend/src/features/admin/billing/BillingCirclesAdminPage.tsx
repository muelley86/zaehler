/**
 * Abrechnungskreise der Stromabrechnung: Liste und Anlegen.
 * Stammdaten, Positionen und Prüfbericht liegen auf `/admin/abrechnungskreise/:id`.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Receipt } from 'lucide-react';

import { Button, EmptyState, LargeTitle, Section } from '@/components/ui';
import { api } from '@/lib/api';
import type { BillingCircleRead } from '@/lib/types';

import { CircleFields } from './CircleFields';
import { circleBody, circleFormState, errorText } from './circleForm';
import { MonthOverviewCard } from './MonthOverviewCard';
import { StammdatenImportCard } from './StammdatenImportCard';
import { UnassignedMetersCard } from './UnassignedMetersCard';
import type { CircleFormState } from './circleForm';

export function BillingCirclesAdminPage() {
  const [items, setItems] = useState<BillingCircleRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<BillingCircleRead[]>('/billing-circles')
      .then((d) => {
        if (!cancelled) setItems(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Konnte Abrechnungskreise nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return (
    <>
      <LargeTitle title="Abrechnungskreise" />
      {error ? (
        <div className="rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-danger">
          {error}
        </div>
      ) : null}
      <MonthOverviewCard tick={tick} />
      <StammdatenImportCard onApplied={() => setTick((t) => t + 1)} />
      <CreateForm onCreated={() => setTick((t) => t + 1)} />
      <UnassignedMetersCard tick={tick} />
      <Section header="Kreise">
        {items === null ? (
          <div className="p-5 text-caption text-tertiary">Lade…</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Receipt size={32} />}
            title="Noch keine Abrechnungskreise"
            description="Ein Kreis entspricht einer Abnahmestelle des Stromlieferanten (z. B. NORD, SUED)."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {items.map((c) => (
              <li key={c.id} className="even:bg-fill">
                <Link
                  to={`/admin/abrechnungskreise/${c.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-fill-strong"
                >
                  <span className="num w-14 text-headline text-label">{c.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-label">{c.name}</span>
                    <span className="block truncate text-caption text-tertiary">
                      {c.abnahmestelle}
                      {c.marktlokation ? ` · MaLo ${c.marktlokation}` : ''}
                    </span>
                  </span>
                  <ChevronRight size={16} className="text-tertiary" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [state, setState] = useState<CircleFormState>(() => circleFormState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/billing-circles', circleBody(state));
      setState(circleFormState());
      onCreated();
    } catch (err) {
      setError(errorText(err, 'Anlegen fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section header="Neuer Abrechnungskreis">
      <form onSubmit={(e) => void submit(e)} className="space-y-3 p-5">
        <CircleFields state={state} onChange={setState} />
        {error ? <div className="text-caption text-danger">{error}</div> : null}
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Anlegen'}
        </Button>
      </form>
    </Section>
  );
}
