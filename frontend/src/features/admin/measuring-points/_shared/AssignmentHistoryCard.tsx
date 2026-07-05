/**
 * Generische Historien-Card fuer periodisierte Messstellen-Zuordnungen
 * (Eigentuemer / Lieferant / Mieter). Ersetzt drei zuvor 1:1 gespiegelte
 * Card-Familien in MeasuringPointDetailPage.
 *
 * Muster wie `admin/_shared/MasterDataList<T>`: Daten-Shape bleibt beim
 * Aufrufer (Getter-Funktionen + Endpoint-Discriminator in der Config),
 * Layout/Logik hier. Verhalten 1:1 zur frueheren OwnerHistoryCard:
 * `cancelled`-Fetch-Guard, `tick`+`onChanged`-Refresh, confirm/alert beim
 * Loeschen, Client-Validierung, `valid_to===''→null`, ChangeForm-Default
 * `validFrom=heute`, `disabled` wenn Master-Liste leer, still verschluckter
 * Master-GET-Fehler.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { Button, Section, Select, Sheet, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateDe } from '@/lib/format';
import type {
  MeasuringPointRead,
  MieterAssignmentRead,
  MieterRead,
  OwnerAssignmentRead,
  OwnerRead,
  SupplierAssignmentRead,
  SupplierRead,
} from '@/lib/types';

export interface AssignmentHistoryConfig<TAssignment, TMaster> {
  /** Endpoint-Segment: /measuring-points/{id}/<resource> */
  resource: string;
  /** Endpoint-Segment fuer den Wechsel: /measuring-points/{id}/<changePath> */
  changePath: string;
  /** Master-Liste: GET /<masterResource> */
  masterResource: string;
  /** Request-Body-Key fuer die Master-ID (owner_id / supplier_id / mieter_id) */
  idField: string;
  getAssignmentId: (a: TAssignment) => number;
  getAssignmentMasterId: (a: TAssignment) => number | null;
  getAssignmentName: (a: TAssignment) => string | null;
  getValidFrom: (a: TAssignment) => string;
  getValidTo: (a: TAssignment) => string | null;
  getMasterId: (m: TMaster) => number;
  getMasterLabel: (m: TMaster) => string;
  labels: {
    historyHeader: string;
    emptyText: string;
    addPeriodButton: string;
    /** Nur gesetzt, wenn der Button einen abweichenden Accessible Name braucht. */
    addPeriodAriaLabel?: string;
    changeButton: string; // dient auch als Sheet-Titel
    periodSelectLabel: string;
    changeSelectLabel: string;
    selectRequired: string;
    changeSubmitLabel: string;
    changeErrorText: string;
    /** Praefix der Loesch-Bestaetigung: `<noun> "<name>" wirklich loeschen?` */
    deleteConfirmNoun: string;
    /** aria-labels der Zeilen-Buttons (bei Mieter/Lieferant entity-spezifisch). */
    editAriaLabel: string;
    deleteAriaLabel: string;
  };
}

function AssignmentPeriodForm<TAssignment, TMaster>({
  mpId,
  masters,
  period,
  config,
  onSaved,
  onCancel,
}: {
  mpId: number;
  masters: TMaster[];
  period: TAssignment | null;
  config: AssignmentHistoryConfig<TAssignment, TMaster>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [masterId, setMasterId] = useState<number | ''>(
    period ? (config.getAssignmentMasterId(period) ?? '') : '',
  );
  const [validFrom, setValidFrom] = useState(period ? config.getValidFrom(period) : '');
  const [validTo, setValidTo] = useState(period ? (config.getValidTo(period) ?? '') : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (masterId === '') {
      setError(config.labels.selectRequired);
      return;
    }
    if (!validFrom) {
      setError('Bitte ein Beginn-Datum wählen.');
      return;
    }
    setError(null);
    setBusy(true);
    const body: Record<string, unknown> = {
      [config.idField]: masterId,
      valid_from: validFrom,
      valid_to: validTo === '' ? null : validTo,
    };
    try {
      if (period) {
        await api.patch(
          `/measuring-points/${mpId}/${config.resource}/${config.getAssignmentId(period)}`,
          body,
        );
      } else {
        await api.post(`/measuring-points/${mpId}/${config.resource}`, body);
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
      <Select
        label={config.labels.periodSelectLabel}
        value={masterId}
        onChange={(e) => setMasterId(e.target.value ? Number(e.target.value) : '')}
        required
      >
        <option value="">— bitte wählen —</option>
        {masters.map((m) => (
          <option key={config.getMasterId(m)} value={config.getMasterId(m)}>
            {config.getMasterLabel(m)}
          </option>
        ))}
      </Select>
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

function ChangeAssignmentForm<TAssignment, TMaster>({
  mpId,
  masters,
  config,
  onSaved,
  onCancel,
}: {
  mpId: number;
  masters: TMaster[];
  config: AssignmentHistoryConfig<TAssignment, TMaster>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [masterId, setMasterId] = useState<number | ''>('');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (masterId === '') {
      setError(config.labels.selectRequired);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post(`/measuring-points/${mpId}/${config.changePath}`, {
        [config.idField]: masterId,
        valid_from: validFrom,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError(config.labels.changeErrorText);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
      <Select
        label={config.labels.changeSelectLabel}
        value={masterId}
        onChange={(e) => setMasterId(e.target.value ? Number(e.target.value) : '')}
        required
      >
        <option value="">— bitte wählen —</option>
        {masters.map((m) => (
          <option key={config.getMasterId(m)} value={config.getMasterId(m)}>
            {config.getMasterLabel(m)}
          </option>
        ))}
      </Select>
      <TextField
        label="Wechsel zum"
        type="date"
        value={validFrom}
        onChange={(e) => setValidFrom(e.target.value)}
        required
      />
      {error ? <div className="text-caption text-danger">{error}</div> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : config.labels.changeSubmitLabel}
        </Button>
        <Button type="button" variant="bordered" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

export function AssignmentHistoryCard<TAssignment, TMaster>({
  mp,
  onChanged,
  config,
}: {
  mp: MeasuringPointRead;
  onChanged: () => void;
  config: AssignmentHistoryConfig<TAssignment, TMaster>;
}) {
  const [history, setHistory] = useState<TAssignment[]>([]);
  const [masters, setMasters] = useState<TMaster[]>([]);
  const [open, setOpen] = useState(false);
  // null = Sheet zu; { period: null } = neue Periode; { period: a } = bearbeiten.
  const [periodSheet, setPeriodSheet] = useState<{ period: TAssignment | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // cancelled-Flag verwirft Antworten nach Unmount/MP-Wechsel.
    let cancelled = false;
    api
      .get<TAssignment[]>(`/measuring-points/${mp.id}/${config.resource}`)
      .then((d) => {
        if (!cancelled) setHistory(d);
      })
      .catch((err: unknown) => {
        if (!cancelled && err instanceof ApiError)
          setError(err.problem.detail ?? err.problem.title);
      });
    api
      .get<TMaster[]>(`/${config.masterResource}`)
      .then((d) => {
        if (!cancelled) setMasters(d);
      })
      .catch(() => {
        /* Dropdown bleibt leer */
      });
    return () => {
      cancelled = true;
    };
  }, [mp.id, tick, config.resource, config.masterResource]);

  function refresh() {
    setTick((t) => t + 1);
    onChanged();
  }

  async function removePeriod(a: TAssignment) {
    const label = config.getAssignmentName(a) ?? 'unbekannt';
    if (!window.confirm(`${config.labels.deleteConfirmNoun} "${label}" wirklich löschen?`)) return;
    try {
      await api.delete(
        `/measuring-points/${mp.id}/${config.resource}/${config.getAssignmentId(a)}`,
      );
      refresh();
    } catch (err) {
      if (err instanceof ApiError) window.alert(err.problem.detail ?? err.problem.title);
    }
  }

  return (
    <Section
      header={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{config.labels.historyHeader}</span>
          <div className="flex gap-2">
            <Button
              variant="bordered"
              size="sm"
              onClick={() => setPeriodSheet({ period: null })}
              disabled={masters.length === 0}
              aria-label={config.labels.addPeriodAriaLabel}
            >
              {config.labels.addPeriodButton}
            </Button>
            <Button
              variant="bordered"
              size="sm"
              onClick={() => setOpen(true)}
              disabled={masters.length === 0}
            >
              {config.labels.changeButton}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2 p-5">
        {error ? (
          <div className="text-caption text-danger">{error}</div>
        ) : history.length === 0 ? (
          <div className="text-caption text-tertiary">{config.labels.emptyText}</div>
        ) : (
          history.map((a) => {
            const active = config.getValidTo(a) === null;
            const name = config.getAssignmentName(a);
            const validTo = config.getValidTo(a);
            return (
              <div
                key={config.getAssignmentId(a)}
                className="bg-fill/40 flex items-center justify-between gap-2 rounded-pill border-hairline border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-body-sm font-semibold text-label">
                    {name ?? <em className="text-tertiary">unbekannt</em>}
                  </div>
                  <div className="text-caption text-tertiary">
                    ab {formatDateDe(config.getValidFrom(a))}
                    {validTo ? ` bis ${formatDateDe(validTo)}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {active ? (
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary-deep">
                      aktiv
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setPeriodSheet({ period: a })}
                    aria-label={config.labels.editAriaLabel}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-secondary transition-colors hover:bg-fill"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void removePeriod(a)}
                    aria-label={config.labels.deleteAriaLabel}
                    className="hover:bg-danger/10 flex h-7 w-7 items-center justify-center rounded-full text-danger transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={config.labels.changeButton}>
        <ChangeAssignmentForm
          mpId={mp.id}
          masters={masters}
          config={config}
          onSaved={() => {
            setOpen(false);
            refresh();
          }}
          onCancel={() => setOpen(false)}
        />
      </Sheet>
      <Sheet
        open={periodSheet !== null}
        onClose={() => setPeriodSheet(null)}
        title={periodSheet?.period ? 'Periode bearbeiten' : 'Periode hinzufügen'}
      >
        {periodSheet ? (
          <AssignmentPeriodForm
            mpId={mp.id}
            masters={masters}
            period={periodSheet.period}
            config={config}
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

// --- Konfigurationen je Ressource (nur die Variationspunkte) -----------------

export const OWNER_ASSIGNMENT_CONFIG: AssignmentHistoryConfig<OwnerAssignmentRead, OwnerRead> = {
  resource: 'owners',
  changePath: 'change-owner',
  masterResource: 'owners',
  idField: 'owner_id',
  getAssignmentId: (a) => a.id,
  getAssignmentMasterId: (a) => a.owner_id,
  getAssignmentName: (a) => a.owner_name,
  getValidFrom: (a) => a.valid_from,
  getValidTo: (a) => a.valid_to,
  getMasterId: (m) => m.id,
  getMasterLabel: (m) => m.name,
  labels: {
    historyHeader: 'Eigentümer-Historie',
    emptyText: 'Noch keine Eigentümer-Zuordnung.',
    addPeriodButton: 'Periode hinzufügen',
    changeButton: 'Eigentümer wechseln',
    periodSelectLabel: 'Eigentümer',
    changeSelectLabel: 'Neuer Eigentümer',
    selectRequired: 'Bitte einen Eigentümer wählen.',
    changeSubmitLabel: 'Wechseln',
    changeErrorText: 'Wechsel fehlgeschlagen.',
    deleteConfirmNoun: 'Eigentümer-Periode',
    editAriaLabel: 'Periode bearbeiten',
    deleteAriaLabel: 'Periode löschen',
  },
};

export const SUPPLIER_ASSIGNMENT_CONFIG: AssignmentHistoryConfig<
  SupplierAssignmentRead,
  SupplierRead
> = {
  resource: 'suppliers',
  changePath: 'change-supplier',
  masterResource: 'suppliers',
  idField: 'supplier_id',
  getAssignmentId: (a) => a.id,
  getAssignmentMasterId: (a) => a.supplier_id,
  getAssignmentName: (a) => a.supplier_name,
  getValidFrom: (a) => a.valid_from,
  getValidTo: (a) => a.valid_to,
  getMasterId: (m) => m.id,
  getMasterLabel: (m) => m.name,
  labels: {
    historyHeader: 'Lieferanten-Historie',
    emptyText: 'Noch keine Lieferanten-Zuordnung.',
    addPeriodButton: 'Periode hinzufügen',
    addPeriodAriaLabel: 'Lieferanten-Periode hinzufügen',
    changeButton: 'Lieferant wechseln',
    periodSelectLabel: 'Lieferant',
    changeSelectLabel: 'Neuer Lieferant',
    selectRequired: 'Bitte einen Lieferanten wählen.',
    changeSubmitLabel: 'Wechseln',
    changeErrorText: 'Wechsel fehlgeschlagen.',
    deleteConfirmNoun: 'Lieferanten-Periode',
    editAriaLabel: 'Lieferanten-Periode bearbeiten',
    deleteAriaLabel: 'Lieferanten-Periode löschen',
  },
};

export const MIETER_ASSIGNMENT_CONFIG: AssignmentHistoryConfig<MieterAssignmentRead, MieterRead> = {
  resource: 'mieters',
  changePath: 'change-mieter',
  masterResource: 'mieters',
  idField: 'mieter_id',
  getAssignmentId: (a) => a.id,
  getAssignmentMasterId: (a) => a.mieter_id,
  getAssignmentName: (a) => a.mieter_name,
  getValidFrom: (a) => a.valid_from,
  getValidTo: (a) => a.valid_to,
  getMasterId: (m) => m.id,
  getMasterLabel: (m) => m.display_name,
  labels: {
    historyHeader: 'Mieter-Historie',
    emptyText: 'Noch keine Mieter-Zuordnung.',
    addPeriodButton: 'Mieter-Periode hinzufügen',
    changeButton: 'Mieter wechseln',
    periodSelectLabel: 'Mieter',
    changeSelectLabel: 'Neuer Mieter',
    selectRequired: 'Bitte einen Mieter wählen.',
    changeSubmitLabel: 'Wechseln',
    changeErrorText: 'Wechsel fehlgeschlagen.',
    deleteConfirmNoun: 'Mieter-Periode',
    editAriaLabel: 'Mieter-Periode bearbeiten',
    deleteAriaLabel: 'Mieter-Periode löschen',
  },
};
