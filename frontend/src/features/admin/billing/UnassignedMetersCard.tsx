/**
 * Strom-Messstellen mit eingebautem Zähler, die zum Stichtag in keinem Abrechnungskreis als
 * Position stehen und damit nicht abgerechnet werden (Plan Phase 4d).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Section, TextField } from '@/components/ui';
import { api } from '@/lib/api';
import type { UnassignedMeterRead } from '@/lib/types';

import { errorText, lastDayOfPreviousMonth } from './circleForm';

export function UnassignedMetersCard({ tick = 0 }: { tick?: number }) {
  const [stichtag, setStichtag] = useState(lastDayOfPreviousMonth);
  const [meters, setMeters] = useState<UnassignedMeterRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stichtag) return;
    let cancelled = false;
    api
      .get<UnassignedMeterRead[]>(
        `/billing-circles/unassigned-meters?stichtag=${encodeURIComponent(stichtag)}`,
      )
      .then((d) => {
        if (!cancelled) {
          setMeters(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMeters(null);
          setError(errorText(err, 'Konnte die Messstellen nicht laden.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stichtag, tick]);

  return (
    <Section header="Nicht abgerechnete Strom-Messstellen">
      <div className="space-y-3 p-5">
        <TextField
          label="Stichtag"
          type="date"
          value={stichtag}
          onChange={(e) => setStichtag(e.target.value)}
          hint="Strom-Messstellen mit Zähler, die zum Stichtag in keinem Kreis als Position stehen."
        />
        {error ? <div className="text-caption text-danger">{error}</div> : null}
        {meters === null ? null : meters.length === 0 ? (
          <div className="rounded-card bg-success/10 p-3 text-caption text-success">
            Alle Strom-Messstellen mit Zähler werden abgerechnet.
          </div>
        ) : (
          <ul className="space-y-1" aria-label="Nicht abgerechnete Messstellen">
            {meters.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-caption">
                <Link to={`/admin/messstellen/${m.id}`} className="text-primary">
                  {m.name}
                </Link>
                <span className="text-tertiary">{m.serial_numbers}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
