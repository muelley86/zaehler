/**
 * Historien-Card „Abrechnen an“ (Eigentümer oder Mieter) mit Gültigkeitszeitraum (seit
 * Migration 0047).
 *
 * Gleiches Bedienmuster wie `KostenstelleHistoryCard` (Wechsel + Perioden-Editor). Ohne
 * Periode rechnet die Abrechnung an den Eigentümer ab; bei „Mieter“ an den zum Monatsende
 * aktuellen Mieter — gibt es keinen, geht die Rechnung an den Eigentümer.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { Button, Section, Select, Sheet, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateDe } from '@/lib/format';
import type { BillTo, BillToAssignmentRead, MeasuringPointRead } from '@/lib/types';

const BILL_TO_LABEL: Record<BillTo, string> = {
  owner: 'Eigentümer',
  mieter: 'Mieter (ohne Mieter: Eigentümer)',
};

function parseBillTo(raw: string): BillTo {
  return raw === 'mieter' ? 'mieter' : 'owner';
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : fallback;
}

function BillToSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: BillTo;
  onChange: (v: BillTo) => void;
}) {
  return (
    <Select label={label} value={value} onChange={(e) => onChange(parseBillTo(e.target.value))}>
      <option value="owner">{BILL_TO_LABEL.owner}</option>
      <option value="mieter">{BILL_TO_LABEL.mieter}</option>
    </Select>
  );
}

function PeriodForm({
  mpId,
  period,
  onSaved,
  onCancel,
}: {
  mpId: number;
  period: BillToAssignmentRead | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [billTo, setBillTo] = useState<BillTo>(period?.bill_to ?? 'mieter');
  const [validFrom, setValidFrom] = useState(period?.valid_from ?? '');
  const [validTo, setValidTo] = useState(period?.valid_to ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validFrom) {
      setError('Bitte ein Beginn-Datum wählen.');
      return;
    }
    setError(null);
    setBusy(true);
    const body = {
      bill_to: billTo,
      valid_from: validFrom,
      valid_to: validTo === '' ? null : validTo,
    };
    try {
      if (period) {
        await api.patch(`/measuring-points/${mpId}/bill-to/${period.id}`, body);
      } else {
        await api.post(`/measuring-points/${mpId}/bill-to`, body);
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
      <BillToSelect label="Abrechnen an" value={billTo} onChange={setBillTo} />
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
  current,
  onSaved,
  onCancel,
}: {
  mpId: number;
  current: BillTo;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [billTo, setBillTo] = useState<BillTo>(current === 'owner' ? 'mieter' : 'owner');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post(`/measuring-points/${mpId}/change-bill-to`, {
        bill_to: billTo,
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
      <BillToSelect label="Künftig abrechnen an" value={billTo} onChange={setBillTo} />
      <TextField
        label="Wechsel zum"
        type="date"
        value={validFrom}
        onChange={(e) => setValidFrom(e.target.value)}
        hint="Ab diesem Tag gilt die neue Einstellung; frühere Monate bleiben unverändert."
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

export function BillToHistoryCard({ mp }: { mp: MeasuringPointRead }) {
  const [history, setHistory] = useState<BillToAssignmentRead[]>([]);
  const [changeOpen, setChangeOpen] = useState(false);
  // null = Sheet zu; { period: null } = neue Periode; { period: a } = bearbeiten.
  const [periodSheet, setPeriodSheet] = useState<{
    period: BillToAssignmentRead | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<BillToAssignmentRead[]>(`/measuring-points/${mp.id}/bill-to`)
      .then((d) => {
        if (!cancelled) setHistory(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Konnte „Abrechnen an“ nicht laden.'));
      });
    return () => {
      cancelled = true;
    };
  }, [mp.id, tick]);

  const current: BillTo = history.find((a) => a.valid_to === null)?.bill_to ?? 'owner';

  function refresh() {
    setTick((t) => t + 1);
  }

  async function removePeriod(a: BillToAssignmentRead) {
    const text = `Periode „${BILL_TO_LABEL[a.bill_to]}“ ab ${formatDateDe(a.valid_from)} wirklich löschen?`;
    if (!window.confirm(text)) return;
    try {
      await api.delete(`/measuring-points/${mp.id}/bill-to/${a.id}`);
      refresh();
    } catch (err) {
      window.alert(errorText(err, 'Löschen fehlgeschlagen.'));
    }
  }

  return (
    <Section
      header={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Abrechnen an</span>
          <div className="flex gap-2">
            <Button
              variant="bordered"
              size="sm"
              onClick={() => setPeriodSheet({ period: null })}
              aria-label="Abrechnen-an-Periode hinzufügen"
            >
              Periode hinzufügen
            </Button>
            <Button
              variant="bordered"
              size="sm"
              onClick={() => setChangeOpen(true)}
              aria-label="Abrechnen an wechseln"
            >
              Wechseln
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2 p-5">
        {error ? (
          <div className="text-caption text-danger">{error}</div>
        ) : (
          <>
            <div className="text-body-sm text-label">
              Aktuell: <span className="font-semibold">{BILL_TO_LABEL[current]}</span>
            </div>
            {history.length === 0 ? (
              <div className="text-caption text-tertiary">
                Keine Periode hinterlegt — abgerechnet wird an den Eigentümer.
              </div>
            ) : (
              history.map((a) => (
                <div
                  key={a.id}
                  className="bg-fill/40 flex items-center justify-between gap-2 rounded-pill border-hairline border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-body-sm font-semibold text-label">
                      {BILL_TO_LABEL[a.bill_to]}
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
                      aria-label="Abrechnen-an-Periode bearbeiten"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-secondary transition-colors hover:bg-fill"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void removePeriod(a)}
                      aria-label="Abrechnen-an-Periode löschen"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger/10"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
      <Sheet open={changeOpen} onClose={() => setChangeOpen(false)} title="Abrechnen an wechseln">
        {changeOpen ? (
          <ChangeForm
            mpId={mp.id}
            current={current}
            onSaved={() => {
              setChangeOpen(false);
              refresh();
            }}
            onCancel={() => setChangeOpen(false)}
          />
        ) : null}
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
