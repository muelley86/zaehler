/**
 * Strom-Messstellen mit eingebautem Zähler, die zum Stichtag in keinem Abrechnungskreis als
 * Position stehen und damit nicht abgerechnet werden (Plan Phase 4d). Standardmäßig eingeklappt;
 * die Anzahl steht auch eingeklappt im Kopf.
 */
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Section, TextField } from '@/components/ui';
import { api } from '@/lib/api';
import type { UnassignedMeterRead } from '@/lib/types';

import { errorText, lastDayOfPreviousMonth } from './circleForm';

export function UnassignedMetersCard({ tick = 0 }: { tick?: number }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
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
    <Section
      header={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-1 text-left uppercase"
        >
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
          Nicht abgerechnete Strom-Messstellen
          {meters !== null ? <span className="num">· {meters.length}</span> : null}
        </button>
      }
    >
      <div id={panelId}>
        {open ? (
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
              <ul aria-label="Nicht abgerechnete Messstellen">
                {meters.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 rounded-badge px-2 py-1 text-caption even:bg-fill"
                  >
                    <Link to={`/admin/messstellen/${m.id}`} className="text-primary">
                      {m.name}
                    </Link>
                    <span className="text-tertiary">{m.serial_numbers}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : error ? (
          <div className="px-5 py-3 text-caption text-danger">{error}</div>
        ) : (
          <p className="px-5 py-3 text-caption text-tertiary">
            {meters === null
              ? 'Lade…'
              : meters.length === 0
                ? 'Alle Strom-Messstellen mit Zähler werden abgerechnet.'
                : 'Eingeklappt — zum Anzeigen auf die Überschrift tippen.'}
          </p>
        )}
      </div>
    </Section>
  );
}
