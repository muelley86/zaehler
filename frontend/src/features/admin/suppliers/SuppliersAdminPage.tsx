import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Handshake } from 'lucide-react';

import { Button, EmptyState, LargeTitle, Section, Sheet, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { MeasuringPointRead, SupplierRead } from '@/lib/types';

import { MasterDataList } from '../_shared/MasterDataList';

export function SuppliersAdminPage() {
  const [suppliers, setSuppliers] = useState<SupplierRead[] | null>(null);
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<SupplierRead | null>(null);

  useEffect(() => {
    api
      .get<SupplierRead[]>('/suppliers')
      .then(setSuppliers)
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

  async function handleDelete(supplier: SupplierRead) {
    if (
      !window.confirm(
        `Lieferant "${supplier.name}" löschen?\n\nMessstellen behalten ihre Daten, die historische Zuordnung wird auf „unbekannt" gesetzt.`,
      )
    )
      return;
    setError(null);
    try {
      await api.delete(`/suppliers/${supplier.id}`);
      refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Löschen fehlgeschlagen.');
    }
  }

  const mpCountBySupplier = useMemo(() => {
    const map = new Map<number, number>();
    points?.forEach((mp) => {
      if (mp.current_supplier_id !== null) {
        map.set(mp.current_supplier_id, (map.get(mp.current_supplier_id) ?? 0) + 1);
      }
    });
    return map;
  }, [points]);

  return (
    <>
      <LargeTitle title="Lieferanten" />
      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      ) : null}

      <CreateForm onCreated={refresh} />

      <MasterDataList
        items={suppliers}
        icon={<Handshake size={18} />}
        getId={(s) => s.id}
        getName={(s) => s.name}
        getSearchText={(s) =>
          [s.name, s.address_city, s.email, s.phone].filter(Boolean).join(' ').toLowerCase()
        }
        mpCount={(id) => mpCountBySupplier.get(id) ?? 0}
        getDetailHref={(s) => `/admin/lieferanten/${s.id}`}
        searchPlaceholder="Lieferant suchen (Name oder Ort)…"
        emptyState={
          <EmptyState
            icon={<Handshake size={32} />}
            title="Noch keine Lieferanten"
            description="Lieferanten können Messstellen zugeordnet werden und tauchen in den Filtern der Messstellen-Übersicht auf."
          />
        }
        onEdit={(s) => setEditing(s)}
        onDelete={handleDelete}
      />

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Lieferant bearbeiten">
        {editing ? (
          <SupplierForm
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

interface SupplierFormState {
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

function emptyFormState(): SupplierFormState {
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

function fromSupplier(s: SupplierRead): SupplierFormState {
  return {
    name: s.name,
    address_street: s.address_street ?? '',
    address_postcode: s.address_postcode ?? '',
    address_city: s.address_city ?? '',
    email: s.email ?? '',
    phone: s.phone ?? '',
    vat_id: s.vat_id ?? '',
    tax_id: s.tax_id ?? '',
    note: s.note ?? '',
  };
}

function toBody(s: SupplierFormState): Record<string, unknown> {
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

function SupplierForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: SupplierRead;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<SupplierFormState>(() => fromSupplier(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/suppliers/${initial.id}`, toBody(state));
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
  const [state, setState] = useState<SupplierFormState>(() => emptyFormState());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/suppliers', toBody(state));
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
    <Section header="Neuer Lieferant">
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
  state: SupplierFormState;
  onChange: (s: SupplierFormState) => void;
}) {
  function set<K extends keyof SupplierFormState>(key: K, value: string) {
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
