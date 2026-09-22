import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound } from 'lucide-react';

import { Button, EmptyState, LargeTitle, Section, Sheet } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { MeasuringPointRead, MieterRead } from '@/lib/types';

import { MasterDataList } from '../_shared/MasterDataList';
import { FormFields, MieterCreateForm } from './MieterFormFields';
import { fromMieter, toBody } from './mieterFormState';
import type { MieterFormState } from './mieterFormState';

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
        <div className="rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-danger">
          {error}
        </div>
      ) : null}

      <Section header="Neuer Mieter">
        <MieterCreateForm onCreated={refresh} className="p-5" />
      </Section>

      <MasterDataList
        items={mieters}
        icon={<KeyRound size={18} />}
        getId={(m) => m.id}
        getName={(m) => m.display_name}
        getSearchText={(m) =>
          [m.display_name, m.address_city, m.email, m.phone].filter(Boolean).join(' ').toLowerCase()
        }
        mpCount={(id) => mpCountByMieter.get(id) ?? 0}
        getDetailHref={(m) => `/admin/mieter/${m.id}`}
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
