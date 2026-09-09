/**
 * Admin-Bereich „Verrechnete Messstellen": virtuelle Messstellen aus
 * +/− Komponenten echter Messstellen (z. B. Realverbrauch Biogasanlage =
 * Netzbezug + Solar-Produktion − Solar-Einspeisung).
 *
 * Jede Komponente wählt eine Messstelle (auf den vmp-Typ gefiltert), bei
 * Strom optional die Richtung (Bezug/Einspeisung) und das Vorzeichen.
 * Die Komponentenliste wird beim Speichern komplett ersetzt (Backend-
 * Konvention, kein Einzel-CRUD).
 */

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Plus, Sigma, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  Button,
  Card,
  EmptyState,
  LargeTitle,
  Section,
  Select,
  Sheet,
  TextField,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { TYPE_LABELS } from '@/lib/meterLabels';
import type {
  FlowDirection,
  LocationRead,
  MeasuringPointRead,
  MeterType,
  VirtualMeasuringPointRead,
} from '@/lib/types';

export function VirtualPointsAdminPage() {
  const [vmps, setVmps] = useState<VirtualMeasuringPointRead[] | null>(null);
  const [points, setPoints] = useState<MeasuringPointRead[]>([]);
  const [locations, setLocations] = useState<LocationRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<VirtualMeasuringPointRead | null>(null);

  useEffect(() => {
    api
      .get<VirtualMeasuringPointRead[]>('/virtual-measuring-points')
      .then(setVmps)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
    api
      .get<MeasuringPointRead[]>('/measuring-points')
      .then(setPoints)
      .catch(() => {
        /* Formular zeigt dann eine leere Auswahl */
      });
    api
      .get<LocationRead[]>('/locations')
      .then(setLocations)
      .catch(() => {
        /* Standort-Auswahl bleibt dann leer („kein Standort" ist weiterhin möglich) */
      });
  }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  return (
    <>
      <LargeTitle title="Verrechnete Messstellen" />
      <p className="text-body-sm text-secondary">
        Eine verrechnete Messstelle kombiniert die Verbräuche echter Messstellen mit Plus und Minus
        — z.&nbsp;B. realer Verbrauch der Biogasanlage = Netzbezug + Solar-Produktion −
        Solar-Einspeisung. Sie erscheint im Dashboard und in den Auswertungen als eigene Reihe.
      </p>
      {error ? (
        <div className="rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-danger">
          {error}
        </div>
      ) : null}

      <Section header="Neue verrechnete Messstelle">
        <div className="p-5">
          <VmpForm points={points} locations={locations} initial={null} onSaved={refresh} />
        </div>
      </Section>

      {vmps && vmps.length === 0 ? (
        <EmptyState
          icon={<Sigma size={32} />}
          title="Noch keine verrechneten Messstellen"
          description="Lege oben die erste Verrechnung aus +/− Komponenten an."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(vmps ?? []).map((v) => (
            <VmpCard key={v.id} vmp={v} onEdit={() => setEditing(v)} onChanged={refresh} />
          ))}
        </div>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Verrechnete Messstelle bearbeiten"
      >
        {editing ? (
          <VmpForm
            points={points}
            locations={locations}
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

function VmpCard({
  vmp,
  onEdit,
  onChanged,
}: {
  vmp: VirtualMeasuringPointRead;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Verrechnete Messstelle "${vmp.name}" löschen?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/virtual-measuring-points/${vmp.id}`);
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
            <Sigma size={20} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-headline tracking-tight text-label">
              <Link to={`/verrechnung/${vmp.id}`} className="underline-offset-2 hover:underline">
                {vmp.name}
              </Link>
            </div>
            <div className="text-caption text-tertiary">{TYPE_LABELS[vmp.type]}</div>
            {vmp.location_name ? (
              <div className="truncate text-caption text-tertiary">
                {vmp.main_location_name
                  ? `${vmp.location_name} · ${vmp.main_location_name}`
                  : vmp.location_name}
              </div>
            ) : null}
            {vmp.note ? (
              <div className="mt-0.5 truncate text-caption text-tertiary">{vmp.note}</div>
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
            className="text-danger hover:bg-danger/10"
          >
            Löschen
          </Button>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {vmp.components.map((c) => (
          <li
            key={c.id}
            className="bg-fill/40 flex items-center gap-2 rounded-pill border-hairline border-border px-3 py-1.5 text-body-sm"
          >
            <span
              className={`num w-4 shrink-0 text-center font-semibold ${
                c.sign < 0 ? 'text-danger' : 'text-primary'
              }`}
            >
              {c.sign < 0 ? '−' : '+'}
            </span>
            <span className="min-w-0 flex-1 truncate text-label">{c.measuring_point_name}</span>
            {vmp.type === 'electricity' ? (
              <span className="shrink-0 text-caption text-tertiary">
                {c.direction === 'einspeisung' ? 'Einspeisung' : 'Bezug'}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {error ? (
        <div className="mt-3 rounded-pill border-hairline border-danger/40 bg-danger/10 p-2 text-caption text-danger">
          {error}
        </div>
      ) : null}
    </Card>
  );
}

interface ComponentDraft {
  measuring_point_id: number | '';
  direction: FlowDirection;
  sign: 1 | -1;
}

const EMPTY_COMPONENT: ComponentDraft = { measuring_point_id: '', direction: 'bezug', sign: 1 };

/** Formular für Anlegen (initial=null) und Bearbeiten (Komponenten vorbefüllt). */
function VmpForm({
  points,
  locations,
  initial,
  onSaved,
  onCancel,
}: {
  points: MeasuringPointRead[];
  locations: LocationRead[];
  initial: VirtualMeasuringPointRead | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [type, setType] = useState<MeterType>(initial?.type ?? 'electricity');
  const [locationId, setLocationId] = useState<number | null>(initial?.location_id ?? null);
  const [components, setComponents] = useState<ComponentDraft[]>(
    initial
      ? initial.components.map((c) => ({
          measuring_point_id: c.measuring_point_id,
          direction: c.direction,
          sign: c.sign < 0 ? -1 : 1,
        }))
      : [{ ...EMPTY_COMPONENT }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeOptions = useMemo(() => points.filter((p) => p.type === type), [points, type]);

  function pickType(next: MeterType) {
    setType(next);
    // Typwechsel macht die gewählten Messstellen ungültig — Auswahl leeren.
    setComponents([{ ...EMPTY_COMPONENT }]);
  }

  function setComponent(index: number, patch: Partial<ComponentDraft>) {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (components.some((c) => c.measuring_point_id === '')) {
      setError('Bitte für jede Komponente eine Messstelle wählen.');
      return;
    }
    setError(null);
    setBusy(true);
    const componentsPayload = components.map((c) => ({
      measuring_point_id: c.measuring_point_id,
      direction: c.direction,
      sign: c.sign,
    }));
    const stammdaten = { name, note: note || null, type, location_id: locationId };
    try {
      if (initial) {
        // PATCH: ``location_id: null`` allein heißt „nicht angefasst" — das
        // Entfernen des Standorts braucht das explizite ``clear_location``.
        // ``components`` nur mitschicken, wenn es welche gibt: das Backend
        // verlangt bei gesendeter Liste ≥ 1 Eintrag, eine leere Liste gibt es
        // nur bei verwaisten Verrechnungen (Komponenten-MPs gelöscht) — deren
        // Stammdaten müssen trotzdem speicherbar bleiben.
        await api.patch(`/virtual-measuring-points/${initial.id}`, {
          ...stammdaten,
          ...(componentsPayload.length > 0 ? { components: componentsPayload } : {}),
          clear_location: locationId === null,
        });
      } else {
        await api.post('/virtual-measuring-points', {
          ...stammdaten,
          components: componentsPayload,
        });
        setName('');
        setNote('');
        setLocationId(null);
        setComponents([{ ...EMPTY_COMPONENT }]);
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
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextField label="Notiz (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Select
        label="Zählerart"
        value={type}
        onChange={(e) => pickType(e.target.value as MeterType)}
      >
        {(Object.keys(TYPE_LABELS) as MeterType[]).map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t]}
          </option>
        ))}
      </Select>
      <Select
        label="Standort"
        value={locationId ?? ''}
        onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— kein Standort —</option>
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </Select>

      <div className="space-y-2">
        <div className="text-caption-bold uppercase text-tertiary">Komponenten</div>
        {components.length === 0 ? (
          <div className="text-caption text-tertiary">
            Diese Verrechnung hat keine Komponenten — sie liefert keine Werte, bis Komponenten
            ergänzt sind.
          </div>
        ) : null}
        {components.map((c, idx) => (
          <div key={idx} className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setComponent(idx, { sign: c.sign === 1 ? -1 : 1 })}
              aria-label={c.sign === 1 ? 'Vorzeichen: plus' : 'Vorzeichen: minus'}
              className={`num flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border-hairline border-border text-headline font-semibold ${
                c.sign < 0 ? 'bg-danger/10 text-danger' : 'bg-primary-soft text-primary-deep'
              }`}
            >
              {c.sign < 0 ? '−' : '+'}
            </button>
            <div className="min-w-0 flex-1">
              <Select
                label={`Messstelle ${idx + 1}`}
                value={c.measuring_point_id}
                onChange={(e) =>
                  setComponent(idx, {
                    measuring_point_id: e.target.value ? Number(e.target.value) : '',
                  })
                }
                required
              >
                <option value="">— bitte wählen —</option>
                {typeOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            {type === 'electricity' ? (
              <div className="w-36 shrink-0">
                <Select
                  label="Richtung"
                  value={c.direction}
                  onChange={(e) =>
                    setComponent(idx, { direction: e.target.value as FlowDirection })
                  }
                >
                  <option value="bezug">Bezug</option>
                  <option value="einspeisung">Einspeisung</option>
                </Select>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setComponents((prev) => prev.filter((_, i) => i !== idx))}
              disabled={components.length === 1}
              aria-label="Komponente entfernen"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="bordered"
          size="sm"
          leftIcon={<Plus size={14} />}
          onClick={() => setComponents((prev) => [...prev, { ...EMPTY_COMPONENT }])}
        >
          Komponente hinzufügen
        </Button>
      </div>

      {error ? <div className="text-caption text-danger">{error}</div> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : initial ? 'Speichern' : 'Anlegen'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="bordered" onClick={onCancel}>
            Abbrechen
          </Button>
        ) : null}
      </div>
    </form>
  );
}
