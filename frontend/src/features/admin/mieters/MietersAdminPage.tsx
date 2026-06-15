import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound } from 'lucide-react';

import { Button, EmptyState, LargeTitle, Section, Sheet, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { MeasuringPointRead, MieterRead } from '@/lib/types';

import { MasterDataList } from '../_shared/MasterDataList';

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

  async function handleDelete(mieter: MieterRead) {
    if (
      !window.confirm(
        `Mieter "${mieter.display_name}" löschen?\n\nMessstellen behalten ihre Daten, die historische Zuordnung wird auf „unbekannt" gesetzt.`,
      )
    )
      return;
    setError(null);
    try {
      await api.delete(`/mieters/${mieter.id}`);
      refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Löschen fehlgeschlagen.');
    }
  }

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

      <MasterDataList
        items={mieters}
        icon={<KeyRound size={18} />}
        getId={(m) => m.id}
        getName={(m) => m.display_name}
        getSearchText={(m) =>
          [m.display_name, m.address_city, m.email, m.phone].filter(Boolean).join(' ').toLowerCase()
        }
        mpCount={(id) => mpCountByMieter.get(id) ?? 0}
        searchPlaceholder="Mieter suchen (Name oder Ort)…"
        emptyState={
          <EmptyState
            icon={<KeyRound size={32} />}
            title="Noch keine Mieter"
            description="Mieter können optional einer Messstelle zugeordnet werden und tauchen in Suche, Export und Filter auf."
          />
        }
        onEdit={(m) => setEditing(m)}
        onDelete={handleDelete}
      />

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

interface MieterFormState {
  first_name: string;
  last_name: string;
  address_street: string;
  address_postcode: string;
  address_city: string;
  email: string;
  phone: string;
  note: string;
}

function emptyFormState(): MieterFormState {
  return {
    first_name: '',
    last_name: '',
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
    first_name: m.first_name ?? '',
    last_name: m.last_name,
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
    first_name: s.first_name || null,
    last_name: s.last_name,
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
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Vorname (optional)"
          value={state.first_name}
          onChange={(e) => set('first_name', e.target.value)}
        />
        <TextField
          label="Nachname"
          value={state.last_name}
          onChange={(e) => set('last_name', e.target.value)}
          required
        />
      </div>
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
