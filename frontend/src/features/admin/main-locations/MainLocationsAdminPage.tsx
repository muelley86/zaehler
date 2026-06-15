import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Building2 } from 'lucide-react';

import { Button, EmptyState, LargeTitle, Section, Sheet, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { LocationRead, MainLocationRead } from '@/lib/types';

import { MasterDataList } from '../_shared/MasterDataList';

export function MainLocationsAdminPage() {
  const [items, setItems] = useState<MainLocationRead[] | null>(null);
  const [locations, setLocations] = useState<LocationRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<MainLocationRead | null>(null);

  useEffect(() => {
    api
      .get<MainLocationRead[]>('/main-locations')
      .then(setItems)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
    api
      .get<LocationRead[]>('/locations')
      .then(setLocations)
      .catch(() => {
        /* nicht kritisch — count ist optional */
      });
  }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  async function handleDelete(item: MainLocationRead) {
    if (
      !window.confirm(
        `Hauptstandort "${item.name}" loeschen? Zugeordnete Zaehlerstandorte bleiben erhalten, verlieren aber die Zuordnung.`,
      )
    )
      return;
    setError(null);
    try {
      await api.delete(`/main-locations/${item.id}`);
      refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Loeschen fehlgeschlagen.');
    }
  }

  // Anzahl der zugeordneten Zaehlerstandorte pro Hauptstandort — fuer die
  // Sublabel-Zeile. Locations ohne ``main_location_id`` werden ignoriert.
  const locationCountByMain = useMemo(() => {
    const map = new Map<number, number>();
    locations?.forEach((loc) => {
      if (loc.main_location_id !== null) {
        map.set(loc.main_location_id, (map.get(loc.main_location_id) ?? 0) + 1);
      }
    });
    return map;
  }, [locations]);

  return (
    <>
      <LargeTitle title="Hauptstandorte" />
      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      ) : null}

      <CreateForm onCreated={refresh} />

      <MasterDataList
        items={items}
        icon={<Building2 size={18} />}
        getId={(m) => m.id}
        getName={(m) => m.name}
        getSearchText={(m) => m.name.toLowerCase()}
        mpCount={(id) => locationCountByMain.get(id) ?? 0}
        formatCount={(n) =>
          n === 0
            ? 'Keine Zaehlerstandorte'
            : `${n} ${n === 1 ? 'Zaehlerstandort' : 'Zaehlerstandorte'}`
        }
        getDetailHref={(m) => `/admin/hauptstandorte/${m.id}`}
        searchPlaceholder="Hauptstandort suchen…"
        emptyState={
          <EmptyState
            icon={<Building2 size={32} />}
            title="Noch keine Hauptstandorte"
            description="Ein Hauptstandort gruppiert mehrere Zaehlerstandorte zu einer logischen Einheit."
          />
        }
        onEdit={(m) => setEditing(m)}
        onDelete={handleDelete}
      />

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Hauptstandort bearbeiten"
      >
        {editing ? (
          <EditForm
            item={editing}
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

function EditForm({
  item,
  onSaved,
  onCancel,
}: {
  item: MainLocationRead;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [note, setNote] = useState(item.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/main-locations/${item.id}`, {
        name,
        note: note || null,
      });
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
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextField label="Notiz" value={note} onChange={(e) => setNote(e.target.value)} />
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
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/main-locations', { name, note: note || null });
      setName('');
      setNote('');
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Anlegen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section header="Neuer Hauptstandort">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 p-5">
        <TextField
          label="Name"
          placeholder="z. B. Hauptgebaeude"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <TextField
          label="Notiz (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error ? <div className="text-caption text-danger">{error}</div> : null}
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Anlegen'}
        </Button>
      </form>
    </Section>
  );
}
