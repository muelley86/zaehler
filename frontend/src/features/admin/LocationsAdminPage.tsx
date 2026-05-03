import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { MapPin, Pencil, Trash2 } from 'lucide-react';

import { Button, Card, EmptyState, LargeTitle, Section, Sheet, TextField } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError, api } from '@/lib/api';
import type { LocationRead, MeasuringPointRead } from '@/lib/types';

export function LocationsAdminPage() {
  const [locations, setLocations] = useState<LocationRead[] | null>(null);
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
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
    api
      .get<MeasuringPointRead[]>('/measuring-points')
      .then(setPoints)
      .catch(() => {
        /* nicht kritisch — count ist optional */
      });
  }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  const mpCountByLocation = useMemo(() => {
    const map = new Map<number, number>();
    points?.forEach((mp) => {
      if (mp.location_id !== null) map.set(mp.location_id, (map.get(mp.location_id) ?? 0) + 1);
    });
    return map;
  }, [points]);

  return (
    <PageContainer>
      <LargeTitle title="Standorte" />
      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      ) : null}

      <CreateForm onCreated={refresh} />

      {locations && locations.length === 0 ? (
        <EmptyState
          icon={<MapPin size={32} />}
          title="Noch keine Standorte"
          description="Standorte helfen, Messstellen sauber zu gruppieren."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(locations ?? []).map((loc) => (
            <LocationCard
              key={loc.id}
              loc={loc}
              mpCount={mpCountByLocation.get(loc.id) ?? 0}
              onEdit={() => setEditing(loc)}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Standort bearbeiten">
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
    </PageContainer>
  );
}

function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 space-y-5 p-4 pb-12 md:p-7">{children}</div>
    </div>
  );
}

function LocationCard({
  loc,
  mpCount,
  onEdit,
  onChanged,
}: {
  loc: LocationRead;
  mpCount: number;
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
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="bg-gradient-primary shadow-glow-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-white">
            <MapPin size={20} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-headline tracking-tight text-label">{loc.name}</div>
            <div className="text-caption text-tertiary">
              {mpCount === 0
                ? 'Keine Messstellen'
                : `${mpCount} ${mpCount === 1 ? 'Messstelle' : 'Messstellen'}`}
            </div>
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
        {loc.note ? loc.note : <em className="text-tertiary">Keine Notiz</em>}
      </div>

      {error ? (
        <div className="border-danger/40 bg-danger/10 mt-3 rounded-pill border-hairline p-2 text-caption text-danger">
          {error}
        </div>
      ) : null}
    </Card>
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
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 p-5">
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
