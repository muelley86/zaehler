import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { User } from 'lucide-react';

import { Button, EmptyState, LargeTitle, Section, Sheet, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { MeasuringPointRead, OwnerRead } from '@/lib/types';

import { MasterDataList } from '../_shared/MasterDataList';

export function OwnersAdminPage() {
  const [owners, setOwners] = useState<OwnerRead[] | null>(null);
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<OwnerRead | null>(null);

  useEffect(() => {
    api
      .get<OwnerRead[]>('/owners')
      .then(setOwners)
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

  async function handleDelete(owner: OwnerRead) {
    if (
      !window.confirm(
        `Eigentümer "${owner.name}" löschen?\n\nMessstellen behalten ihre Daten, die historische Zuordnung wird auf „unbekannt" gesetzt.`,
      )
    )
      return;
    setError(null);
    try {
      await api.delete(`/owners/${owner.id}`);
      refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Löschen fehlgeschlagen.');
    }
  }

  const mpCountByOwner = useMemo(() => {
    const map = new Map<number, number>();
    points?.forEach((mp) => {
      if (mp.current_owner_id !== null) {
        map.set(mp.current_owner_id, (map.get(mp.current_owner_id) ?? 0) + 1);
      }
    });
    return map;
  }, [points]);

  return (
    <>
      <LargeTitle title="Eigentümer" />
      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      ) : null}

      <CreateForm onCreated={refresh} />

      <MasterDataList
        items={owners}
        icon={<User size={18} />}
        getId={(o) => o.id}
        getName={(o) => o.name}
        getSearchText={(o) =>
          [o.name, o.address_city, o.email, o.phone].filter(Boolean).join(' ').toLowerCase()
        }
        mpCount={(id) => mpCountByOwner.get(id) ?? 0}
        searchPlaceholder="Eigentümer suchen (Name oder Ort)…"
        emptyState={
          <EmptyState
            icon={<User size={32} />}
            title="Noch keine Eigentümer"
            description="Eigentümer können Messstellen zugeordnet werden und tauchen in Suche, Export und Filter auf."
          />
        }
        onEdit={(o) => setEditing(o)}
        onDelete={handleDelete}
      />

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Eigentümer bearbeiten">
        {editing ? (
          <OwnerForm
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

interface OwnerFormState {
  name: string;
  address_street: string;
  address_postcode: string;
  address_city: string;
  email: string;
  phone: string;
  vat_id: string;
  tax_id: string;
  note: string;
}

function emptyFormState(): OwnerFormState {
  return {
    name: '',
    address_street: '',
    address_postcode: '',
    address_city: '',
    email: '',
    phone: '',
    vat_id: '',
    tax_id: '',
    note: '',
  };
}

function fromOwner(o: OwnerRead): OwnerFormState {
  return {
    name: o.name,
    address_street: o.address_street ?? '',
    address_postcode: o.address_postcode ?? '',
    address_city: o.address_city ?? '',
    email: o.email ?? '',
    phone: o.phone ?? '',
    vat_id: o.vat_id ?? '',
    tax_id: o.tax_id ?? '',
    note: o.note ?? '',
  };
}

function toBody(s: OwnerFormState): Record<string, unknown> {
  return {
    name: s.name,
    address_street: s.address_street || null,
    address_postcode: s.address_postcode || null,
    address_city: s.address_city || null,
    email: s.email || null,
    phone: s.phone || null,
    vat_id: s.vat_id || null,
    tax_id: s.tax_id || null,
    note: s.note || null,
  };
}

function OwnerForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: OwnerRead;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<OwnerFormState>(() => fromOwner(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/owners/${initial.id}`, toBody(state));
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
  const [state, setState] = useState<OwnerFormState>(() => emptyFormState());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/owners', toBody(state));
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
    <Section header="Neuer Eigentümer">
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
  state: OwnerFormState;
  onChange: (s: OwnerFormState) => void;
}) {
  function set<K extends keyof OwnerFormState>(key: K, value: string) {
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
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="USt-IdNr."
          value={state.vat_id}
          onChange={(e) => set('vat_id', e.target.value.toUpperCase())}
          pattern="[A-Z]{2}[A-Z0-9]{2,18}"
          maxLength={20}
          hint="z. B. DE123456789"
        />
        <TextField
          label="Steuer-Nr."
          value={state.tax_id}
          onChange={(e) => set('tax_id', e.target.value)}
        />
      </div>
      <TextField label="Notiz" value={state.note} onChange={(e) => set('note', e.target.value)} />
    </>
  );
}
