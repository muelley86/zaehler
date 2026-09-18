/**
 * Historien-Card für die Kostenstelle mit Gültigkeitszeitraum (seit Migration 0036).
 *
 * Gleiches Bedienmuster wie `AssignmentHistoryCard` (Wechsel + Perioden-Editor),
 * aber mit Zahlenfeld statt Stammdaten-Auswahl — eine Kostenstelle ist kein
 * eigener Datensatz. Die Abrechnung nimmt die Kostenstelle zum Monatsende, daher
 * schreibt ein Wechsel frühere Monate nicht um.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { Button, Section, Sheet, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateDe } from '@/lib/format';
import type { KostenstelleAssignmentRead, MeasuringPointRead } from '@/lib/types';

/** Kostenstelle aus dem Eingabefeld: Ganzzahl 0–99999, sonst Fehlertext. */
function parseKostenstelle(raw: string): number | string {
  const trimmed = raw.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return 'Kostenstelle muss eine Ganzzahl von 0 bis 99999 sein.';
  return Number(trimmed);
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : fallback;
}

function PeriodForm({
  mpId,
  period,
  onSaved,
  onCancel,
}: {
  mpId: number;
  period: KostenstelleAssignmentRead | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [kst, setKst] = useState(period ? String(period.kostenstelle) : '');
  const [validFrom, setValidFrom] = useState(period?.valid_from ?? '');
  const [validTo, setValidTo] = useState(period?.valid_to ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = parseKostenstelle(kst);
    if (typeof parsed === 'string') {
      setError(parsed);
      return;
    }
    if (!validFrom) {
      setError('Bitte ein Beginn-Datum wählen.');
      return;
    }
    setError(null);
    setBusy(true);
    const body = {
      kostenstelle: parsed,
      valid_from: validFrom,
      valid_to: validTo === '' ? null : validTo,
    };
    try {
      if (period) {
        await api.patch(`/measuring-points/${mpId}/kostenstellen/${period.id}`, body);
      } else {
        await api.post(`/measuring-points/${mpId}/kostenstellen`, body);
      }
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Speichern fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
      <TextField
        label="Kostenstelle"
        inputMode="numeric"
        pattern="[0-9]*"
        value={kst}
        onChange={(e) => setKst(e.target.value)}
        required
        numeric
      />
      <TextField
        label="Gültig ab"
        type="date"
        value={validFrom}
        onChange={(e) => setValidFrom(e.target.value)}
        required
      />
      <TextField
        label="Gültig bis (leer = aktive Periode)"
        type="date"
        value={validTo}
        onChange={(e) => setValidTo(e.target.value)}
      />
      {error ? <div className="text-caption text-danger">{error}</div> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Speichern'}
        </Button>
        <Button type="button" variant="bordered" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function ChangeForm({
  mpId,
  onSaved,
  onCancel,
}: {
  mpId: number;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [kst, setKst] = useState('');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = parseKostenstelle(kst);
    if (typeof parsed === 'string') {
      setError(parsed);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post(`/measuring-points/${mpId}/change-kostenstelle`, {
        kostenstelle: parsed,
        valid_from: validFrom,
      });
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Wechsel fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
      <TextField
        label="Neue Kostenstelle"
        inputMode="numeric"
        pattern="[0-9]*"
        value={kst}
        onChange={(e) => setKst(e.target.value)}
        required
        numeric
      />
      <TextField
        label="Wechsel zum"
        type="date"
        value={validFrom}
        onChange={(e) => setValidFrom(e.target.value)}
        hint="Ab diesem Tag gilt die neue Kostenstelle; frühere Monate behalten die alte."
        required
      />
      {error ? <div className="text-caption text-danger">{error}</div> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Wechseln'}
        </Button>
        <Button type="button" variant="bordered" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

export function KostenstelleHistoryCard({
  mp,
  onChanged,
}: {
  mp: MeasuringPointRead;
  onChanged: () => void;
}) {
  const [history, setHistory] = useState<KostenstelleAssignmentRead[]>([]);
  const [changeOpen, setChangeOpen] = useState(false);
  // null = Sheet zu; { period: null } = neue Periode; { period: a } = bearbeiten.
  const [periodSheet, setPeriodSheet] = useState<{
    period: KostenstelleAssignmentRead | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<KostenstelleAssignmentRead[]>(`/measuring-points/${mp.id}/kostenstellen`)
      .then((d) => {
        if (!cancelled) setHistory(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Konnte Kostenstellen nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [mp.id, tick]);

  function refresh() {
    setTick((t) => t + 1);
    onChanged();
  }

  async function removePeriod(a: KostenstelleAssignmentRead) {
    if (!window.confirm(`Kostenstellen-Periode "${a.kostenstelle}" wirklich löschen?`)) return;
    try {
      await api.delete(`/measuring-points/${mp.id}/kostenstellen/${a.id}`);
      refresh();
    } catch (err) {
      window.alert(errorText(err, 'Löschen fehlgeschlagen.'));
    }
  }

  return (
    <Section
      header={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Kostenstellen-Historie</span>
          <div className="flex gap-2">
            <Button
              variant="bordered"
              size="sm"
              onClick={() => setPeriodSheet({ period: null })}
              aria-label="Kostenstellen-Periode hinzufügen"
            >
              Periode hinzufügen
            </Button>
            <Button variant="bordered" size="sm" onClick={() => setChangeOpen(true)}>
              Kostenstelle wechseln
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2 p-5">
        {error ? (
          <div className="text-caption text-danger">{error}</div>
        ) : history.length === 0 ? (
          <div className="text-caption text-tertiary">Noch keine Kostenstelle zugeordnet.</div>
        ) : (
          history.map((a) => (
            <div
              key={a.id}
              className="bg-fill/40 flex items-center justify-between gap-2 rounded-pill border-hairline border-border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="num truncate text-body-sm font-semibold text-label">
                  {a.kostenstelle}
                </div>
                <div className="text-caption text-tertiary">
                  ab {formatDateDe(a.valid_from)}
                  {a.valid_to ? ` bis ${formatDateDe(a.valid_to)}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {a.valid_to === null ? (
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary-deep">
                    aktiv
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPeriodSheet({ period: a })}
                  aria-label="Kostenstellen-Periode bearbeiten"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-secondary transition-colors hover:bg-fill"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => void removePeriod(a)}
                  aria-label="Kostenstellen-Periode löschen"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger/10"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <Sheet open={changeOpen} onClose={() => setChangeOpen(false)} title="Kostenstelle wechseln">
        <ChangeForm
          mpId={mp.id}
          onSaved={() => {
            setChangeOpen(false);
            refresh();
          }}
          onCancel={() => setChangeOpen(false)}
        />
      </Sheet>
      <Sheet
        open={periodSheet !== null}
        onClose={() => setPeriodSheet(null)}
        title={periodSheet?.period ? 'Periode bearbeiten' : 'Periode hinzufügen'}
      >
        {periodSheet ? (
          <PeriodForm
            mpId={mp.id}
            period={periodSheet.period}
            onSaved={() => {
              setPeriodSheet(null);
              refresh();
            }}
            onCancel={() => setPeriodSheet(null)}
          />
        ) : null}
      </Sheet>
    </Section>
  );
}
