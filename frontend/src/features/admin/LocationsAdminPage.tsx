import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import {
  Button,
  EmptyState,
  LargeTitle,
  Section,
  Sheet,
  TextField,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { LocationRead } from '@/lib/types';

export function LocationsAdminPage() {
  const [locations, setLocations] = useState<LocationRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<LocationRead | null>(null);

  useEffect(() => {
    api
      .get<LocationRead[]>('/locations')
      .then(setLocations)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  return (
    <div className="space-y-5 pb-4">
      <LargeTitle title="Standorte" />
      {error ? (
        <div className="mx-4 rounded-ios-lg bg-ios-red/15 p-3 text-ios-red">{error}</div>
      ) : null}
      <div className="space-y-5 px-4">
        <CreateForm onCreated={refresh} />

        {locations && locations.length === 0 ? (
          <EmptyState title="Noch keine Standorte" />
        ) : (
          <Section header="Bestehende Standorte">
            <ul className="divide-y divide-ios-separator/60">
              {(locations ?? []).map((loc) => (
                <LocationItem
                  key={loc.id}
                  loc={loc}
                  onEdit={() => setEditing(loc)}
                  onChanged={refresh}
                />
              ))}
            </ul>
          </Section>
        )}
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Standort bearbeiten"
      >
        {editing ? (
          <EditForm
            loc={editing}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function LocationItem({
  loc,
  onEdit,
  onChanged,
}: {
  loc: LocationRead;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Standort "${loc.name}" löschen?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/locations/${loc.id}`);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-ios-body">{loc.name}</div>
          {loc.note ? (
            <div className="text-ios-footnote text-ios-tertiary">{loc.note}</div>
          ) : null}
        </div>
        <Button
          variant="plain"
          size="sm"
          leftIcon={<Pencil size={14} />}
          onClick={onEdit}
        >
          Bearbeiten
        </Button>
        <Button
          variant="plain"
          size="sm"
          leftIcon={<Trash2 size={14} />}
          onClick={() => void remove()}
          disabled={busy}
          className="text-ios-red hover:bg-ios-red/10"
        >
          Löschen
        </Button>
      </div>
      {error ? (
        <div className="mt-2 rounded-ios-lg bg-ios-red/15 p-2 text-ios-footnote text-ios-red">
          {error}
        </div>
      ) : null}
    </li>
  );
}

function EditForm({
  loc,
  onSaved,
  onCancel,
}: {
  loc: LocationRead;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(loc.name);
  const [note, setNote] = useState(loc.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/locations/${loc.id}`, { name, note: note || null });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextField
        label="Notiz"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={error}
      />
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
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/locations', { name, note: note || null });
      setName('');
      setNote('');
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section header="Neuer Standort">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 p-4">
        <TextField
          label="Name"
          placeholder="z. B. Keller"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <TextField
          label="Notiz (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={error}
        />
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Anlegen'}
        </Button>
      </form>
    </Section>
  );
}
