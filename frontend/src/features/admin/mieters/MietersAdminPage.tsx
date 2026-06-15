import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, Pencil, Trash2 } from 'lucide-react';

import { Button, Card, EmptyState, LargeTitle, Section, Sheet, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { MeasuringPointRead, MieterRead } from '@/lib/types';

export function MietersAdminPage() {
  const [mieters, setMieters] = useState<MieterRead[] | null>(null);
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<MieterRead | null>(null);

  useEffect(() => {
    api
      .get<MieterRead[]>('/mieters')
      .then(setMieters)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
    api
      .get<MeasuringPointRead[]>('/measuring-points')
      .then(setPoints)
      .catch(() => {
        /* nicht kritisch — count ist optional */
      });
  }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  const mpCountByMieter = useMemo(() => {
    const map = new Map<number, number>();
    points?.forEach((mp) => {
      if (mp.current_mieter_id !== null) {
        map.set(mp.current_mieter_id, (map.get(mp.current_mieter_id) ?? 0) + 1);
      }
    });
    return map;
  }, [points]);

  return (
    <>
      <LargeTitle title="Mieter" />
      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      ) : null}

      <CreateForm onCreated={refresh} />

      {mieters && mieters.length === 0 ? (
        <EmptyState
          icon={<KeyRound size={32} />}
          title="Noch keine Mieter"
          description="Mieter können optional einer Messstelle zugeordnet werden und tauchen in Suche, Export und Filter auf."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(mieters ?? []).map((m) => (
            <MieterCard
              key={m.id}
              mieter={m}
              mpCount={mpCountByMieter.get(m.id) ?? 0}
              onEdit={() => setEditing(m)}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Mieter bearbeiten">
        {editing ? (
          <MieterForm
            initial={editing}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function MieterCard({
  mieter,
  mpCount,
  onEdit,
  onChanged,
}: {
  mieter: MieterRead;
  mpCount: number;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !window.confirm(
        `Mieter "${mieter.name}" löschen?\n\nMessstellen behalten ihre Daten, die historische Zuordnung wird auf „unbekannt" gesetzt.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/mieters/${mieter.id}`);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
    } finally {
      setBusy(false);
    }
  }

  const addressLine = [mieter.address_street, mieter.address_postcode, mieter.address_city]
    .filter(Boolean)
    .join(', ');
  const contactLine = [mieter.email, mieter.phone].filter(Boolean).join(' · ');

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="bg-gradient-primary shadow-glow-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-white">
            <KeyRound size={20} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-headline tracking-tight text-label">{mieter.name}</div>
            <div className="text-caption text-tertiary">
              {mpCount === 0
                ? 'Keine Messstellen'
                : `${mpCount} ${mpCount === 1 ? 'Messstelle' : 'Messstellen'}`}
            </div>
            {addressLine ? (
              <div className="mt-0.5 truncate text-caption text-tertiary">{addressLine}</div>
            ) : null}
            {contactLine ? (
              <div className="mt-0.5 truncate text-caption text-tertiary">{contactLine}</div>
            ) : null}
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="plain" size="sm" leftIcon={<Pencil size={14} />} onClick={onEdit}>
            Bearbeiten
          </Button>
          <Button
            variant="plain"
            size="sm"
            leftIcon={<Trash2 size={14} />}
            onClick={() => void remove()}
            disabled={busy}
            className="hover:bg-danger/10 text-danger"
          >
            Löschen
          </Button>
        </div>
      </div>

      <div
        className="mt-4 rounded-pill border-l-2 border-primary bg-fill p-3 text-body-sm text-secondary"
        style={{ borderLeftWidth: '3px' }}
      >
        {mieter.note ? mieter.note : <em className="text-tertiary">Keine Notiz</em>}
      </div>

      {error ? (
        <div className="border-danger/40 bg-danger/10 mt-3 rounded-pill border-hairline p-2 text-caption text-danger">
          {error}
        </div>
      ) : null}
    </Card>
  );
}

interface MieterFormState {
  name: string;
  address_street: string;
  address_postcode: string;
  address_city: string;
  email: string;
  phone: string;
  note: string;
}

function emptyFormState(): MieterFormState {
  return {
    name: '',
    address_street: '',
    address_postcode: '',
    address_city: '',
    email: '',
    phone: '',
    note: '',
  };
}

function fromMieter(m: MieterRead): MieterFormState {
  return {
    name: m.name,
    address_street: m.address_street ?? '',
    address_postcode: m.address_postcode ?? '',
    address_city: m.address_city ?? '',
    email: m.email ?? '',
    phone: m.phone ?? '',
    note: m.note ?? '',
  };
}

function toBody(s: MieterFormState): Record<string, unknown> {
  return {
    name: s.name,
    address_street: s.address_street || null,
    address_postcode: s.address_postcode || null,
    address_city: s.address_city || null,
    email: s.email || null,
    phone: s.phone || null,
    note: s.note || null,
  };
}

function MieterForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: MieterRead;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<MieterFormState>(() => fromMieter(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/mieters/${initial.id}`, toBody(state));
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
      <FormFields state={state} onChange={setState} />
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

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [state, setState] = useState<MieterFormState>(() => emptyFormState());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/mieters', toBody(state));
      setState(emptyFormState());
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Anlegen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section header="Neuer Mieter">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 p-5">
        <FormFields state={state} onChange={setState} />
        {error ? <div className="text-caption text-danger">{error}</div> : null}
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Anlegen'}
        </Button>
      </form>
    </Section>
  );
}

function FormFields({
  state,
  onChange,
}: {
  state: MieterFormState;
  onChange: (s: MieterFormState) => void;
}) {
  function set<K extends keyof MieterFormState>(key: K, value: string) {
    onChange({ ...state, [key]: value });
  }
  return (
    <>
      <TextField
        label="Name"
        value={state.name}
        onChange={(e) => set('name', e.target.value)}
        required
      />
      <TextField
        label="Straße + Hausnr. (optional)"
        value={state.address_street}
        onChange={(e) => set('address_street', e.target.value)}
      />
      <div className="grid grid-cols-3 gap-2">
        <TextField
          label="PLZ"
          value={state.address_postcode}
          onChange={(e) => set('address_postcode', e.target.value)}
          inputMode="numeric"
          pattern="\d{5}"
          maxLength={5}
          hint="5 Ziffern"
        />
        <div className="col-span-2">
          <TextField
            label="Ort"
            value={state.address_city}
            onChange={(e) => set('address_city', e.target.value)}
          />
        </div>
      </div>
      <TextField
        label="E-Mail"
        value={state.email}
        onChange={(e) => set('email', e.target.value)}
        type="email"
      />
      <TextField
        label="Telefon"
        value={state.phone}
        onChange={(e) => set('phone', e.target.value)}
        type="tel"
      />
      <TextField label="Notiz" value={state.note} onChange={(e) => set('note', e.target.value)} />
    </>
  );
}
