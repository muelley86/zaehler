import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  Button,
  Card,
  LargeTitle,
  Section,
  Select,
  Sheet,
  Switch,
  TextField,
  TypeBadge,
} from '@/components/ui';
import { DeliveriesSheet } from './DeliveriesSheet';
import { ApiError, api } from '@/lib/api';
import { parseDe } from '@/lib/format';
import { HEATING_SOURCE_LABELS, TYPE_LABELS, describeMeterType } from '@/lib/meterLabels';
import type {
  HeatingSource,
  HeatingUnit,
  LocationRead,
  MeasuringPointRead,
  MeterType,
  PhysicalMeterRead,
  RegisterRead,
} from '@/lib/types';
import { HEATING_UNITS } from '@/lib/types';
import { cx } from '@/components/ui/cx';

interface RegisterDraft {
  label: string;
  unit: HeatingUnit;
  accepts_deliveries: boolean;
  initial_value: string;
  max_value: string;
}

const HEATING_PRESETS: Record<HeatingSource, RegisterDraft[]> = {
  oil: [
    {
      label: 'Betriebsstunden',
      unit: 'h',
      accepts_deliveries: false,
      initial_value: '0',
      max_value: '',
    },
    {
      label: 'Tankstand',
      unit: 'L',
      accepts_deliveries: true,
      initial_value: '',
      max_value: '',
    },
  ],
  gas: [
    {
      label: 'Verbrauch',
      unit: 'm³',
      accepts_deliveries: false,
      initial_value: '0',
      max_value: '',
    },
  ],
  wood_chips: [
    {
      label: 'Betriebsstunden',
      unit: 'h',
      accepts_deliveries: false,
      initial_value: '0',
      max_value: '',
    },
    {
      label: 'Vorrat',
      unit: 'SRM',
      accepts_deliveries: true,
      initial_value: '',
      max_value: '',
    },
  ],
  wood: [
    {
      label: 'Vorrat',
      unit: 'SRM',
      accepts_deliveries: true,
      initial_value: '',
      max_value: '',
    },
  ],
  district_heat: [
    {
      label: 'Wärmemengenzähler',
      unit: 'kWh',
      accepts_deliveries: false,
      initial_value: '0',
      max_value: '',
    },
  ],
};

export function MeasuringPointsAdminPage() {
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [locations, setLocations] = useState<LocationRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    Promise.all([
      api.get<MeasuringPointRead[]>('/measuring-points'),
      api.get<LocationRead[]>('/locations'),
    ])
      .then(([mps, locs]) => {
        setPoints(mps);
        setLocations(locs);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  return (
    <>
      <LargeTitle title="Messstellen" />
      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      ) : null}

      <CreateForm locations={locations} onCreated={refresh} />

      <div className="space-y-3">
        {(points ?? []).map((mp) => (
          <MPCard key={mp.id} mp={mp} locations={locations} onChanged={refresh} />
        ))}
      </div>
    </>
  );
}

function MPCard({
  mp,
  locations,
  onChanged,
}: {
  mp: MeasuringPointRead;
  locations: LocationRead[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function deleteMp() {
    if (!window.confirm(`Messstelle "${mp.name}" wirklich löschen?`)) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await api.delete(`/measuring-points/${mp.id}`);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) setDeleteError(err.problem.detail ?? err.problem.title);
      else setDeleteError('Löschen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padded={false}>
      <div className="flex items-center gap-2 px-5 py-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={open}
          aria-controls={`mp-${mp.id}-body`}
        >
          <TypeBadge type={mp.type} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-headline tracking-tight text-label">{mp.name}</div>
            <div className="text-caption text-tertiary">
              {describeMeterType(mp.type, mp.heating_source)}
              {mp.location_name ? ` · ${mp.location_name}` : ''}
            </div>
          </div>
          {open ? (
            <ChevronUp size={18} className="shrink-0 text-tertiary" />
          ) : (
            <ChevronDown size={18} className="shrink-0 text-tertiary" />
          )}
        </button>
        <Link
          to={`/admin/messstellen/${mp.id}`}
          className="rounded-pill border-hairline border-border bg-fill p-2 text-tertiary transition-colors hover:bg-fill-strong hover:text-label"
          aria-label="Detail-Ansicht öffnen"
          title="Detail-Ansicht"
        >
          <ExternalLink size={14} />
        </Link>
      </div>

      {open ? (
        <div id={`mp-${mp.id}-body`} className="space-y-3 border-t-hairline border-separator p-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="bordered" size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Schließen' : 'Stammdaten'}
            </Button>
            <Button
              variant="plain"
              size="sm"
              leftIcon={<Trash2 size={14} />}
              onClick={() => void deleteMp()}
              disabled={busy}
              className="hover:bg-danger/10 text-danger"
            >
              Löschen
            </Button>
          </div>
          {deleteError ? (
            <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger">
              {deleteError}
            </div>
          ) : null}

          {editing ? (
            <MPEditForm
              mp={mp}
              locations={locations}
              onSaved={() => {
                setEditing(false);
                onChanged();
              }}
            />
          ) : null}

          <div className="space-y-2 pt-1">
            {mp.physical_meters.map((meter) => (
              <MeterPanel key={meter.id} meter={meter} mp={mp} onChanged={onChanged} />
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function MPEditForm({
  mp,
  locations,
  onSaved,
}: {
  mp: MeasuringPointRead;
  locations: LocationRead[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(mp.name);
  const [locationId, setLocationId] = useState<number | null>(mp.location_id);
  const [bidi, setBidi] = useState(mp.is_bidirectional);
  const [dual, setDual] = useState(mp.has_dual_tariff);
  const [tankCapacity, setTankCapacity] = useState(
    mp.tank_capacity ? String(mp.tank_capacity).replace('.', ',') : '',
  );
  const [transformerFactor, setTransformerFactor] = useState(
    mp.transformer_factor !== null ? String(mp.transformer_factor) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name,
        location_id: locationId,
        clear_location: locationId === null,
        is_bidirectional: bidi,
        has_dual_tariff: dual,
      };
      if (mp.type === 'heating') {
        if (tankCapacity.trim() === '') {
          body['clear_tank_capacity'] = true;
        } else {
          body['tank_capacity'] = parseDe(tankCapacity);
        }
      }
      if (mp.type === 'electricity') {
        const trimmed = transformerFactor.trim();
        if (trimmed === '') {
          body['clear_transformer_factor'] = true;
        } else {
          const parsed = Number(trimmed);
          if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new RangeError('Wandlerfaktor muss eine positive Ganzzahl sein.');
          }
          body['transformer_factor'] = parsed;
        }
      }
      await api.patch(`/measuring-points/${mp.id}`, body);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof RangeError) setError(err.message);
      else setError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
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
      {mp.type === 'electricity' ? (
        <>
          <ToggleRow label="Bidirektional (Einspeisung)" checked={bidi} onChange={setBidi} />
          <ToggleRow label="Doppeltarif (HT/NT)" checked={dual} onChange={setDual} />
          <TextField
            label="Wandlerfaktor (optional)"
            inputMode="numeric"
            pattern="[0-9]*"
            value={transformerFactor}
            onChange={(e) => setTransformerFactor(e.target.value)}
            hint="leer = kein Wandler; ganzzahlig (z. B. 20, 50, 100). Verbräuche werden mit dem Faktor multipliziert."
            numeric
          />
          <div className="text-caption text-tertiary">
            Hinweis: Register werden nicht automatisch angepasst — beim nächsten Zählerwechsel
            wirken sich die Flags auf den neuen Zähler aus.
          </div>
        </>
      ) : null}
      {mp.type === 'heating' ? (
        <>
          <TextField
            label="Tankvolumen / Vorratsmenge (optional)"
            inputMode="decimal"
            value={tankCapacity}
            onChange={(e) => setTankCapacity(e.target.value)}
            hint="leer = nicht gesetzt; wird für die Prozent-Anzeige des Vorrats genutzt"
            numeric
          />
          <div className="text-caption text-tertiary">
            Energieträger:{' '}
            <span className="text-label">{HEATING_SOURCE_LABELS[mp.heating_source ?? 'oil']}</span>{' '}
            · Register-Liste verwaltest du im aktiven Zähler weiter unten.
          </div>
        </>
      ) : null}
      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger">
          {error}
        </div>
      ) : null}
      <Button type="submit" variant="filled" disabled={busy} fullWidth>
        {busy ? 'Speichere…' : 'Speichern'}
      </Button>
    </form>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-pill border-hairline border-border bg-fill px-3.5 py-2.5">
      <span className="text-body text-label">{label}</span>
      <Switch checked={checked} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

function MeterPanel({
  meter,
  mp,
  onChanged,
}: {
  meter: PhysicalMeterRead;
  mp: MeasuringPointRead;
  onChanged: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [replace, setReplace] = useState(false);
  const [deliveriesFor, setDeliveriesFor] = useState<RegisterRead | null>(null);

  return (
    <div className="bg-fill/60 rounded-card border-hairline border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="num text-headline text-label">SN {meter.serial_number}</div>
        <div className="num text-caption text-tertiary">
          {meter.installed_at} – {meter.removed_at ?? 'aktiv'}
        </div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {meter.registers.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-body-sm">
            <code className="num rounded-badge bg-primary-soft px-1.5 py-0.5 text-caption font-semibold text-primary-deep">
              {r.obis_code}
            </code>
            <span className="text-label">
              {r.label} <span className="text-tertiary">({r.unit})</span>
            </span>
            {!r.is_active ? (
              <span className="rounded-full bg-fill px-2 text-caption text-secondary">inaktiv</span>
            ) : null}
            {r.accepts_deliveries ? (
              <button
                type="button"
                onClick={() => setDeliveriesFor(r)}
                className="ml-auto rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary-deep"
              >
                Befüllungen
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button variant="plain" size="sm" onClick={() => setEdit((v) => !v)}>
          {edit ? 'Schließen' : 'Stammdaten'}
        </Button>
        {meter.removed_at === null ? (
          <Button variant="plain" size="sm" onClick={() => setReplace(true)}>
            Tauschen
          </Button>
        ) : null}
      </div>

      {edit ? (
        <>
          <MeterEditForm
            meter={meter}
            onSaved={() => {
              setEdit(false);
              onChanged();
            }}
          />
          {mp.type === 'heating' && meter.removed_at === null ? (
            <RegisterEditor meter={meter} onChanged={onChanged} />
          ) : null}
        </>
      ) : null}

      <Sheet open={replace} onClose={() => setReplace(false)} title="Zähler tauschen">
        <ReplaceMeterForm mp={mp} onClose={() => setReplace(false)} onReplaced={onChanged} />
      </Sheet>

      {deliveriesFor ? (
        <DeliveriesSheet
          open={true}
          onClose={() => setDeliveriesFor(null)}
          register={deliveriesFor}
        />
      ) : null}
    </div>
  );
}

function MeterEditForm({ meter, onSaved }: { meter: PhysicalMeterRead; onSaved: () => void }) {
  const [serial, setSerial] = useState(meter.serial_number);
  const [installedAt, setInstalledAt] = useState(meter.installed_at);
  const [removedAt, setRemovedAt] = useState(meter.removed_at ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/physical-meters/${meter.id}`, {
        serial_number: serial,
        installed_at: installedAt,
        removed_at: removedAt || null,
        clear_removed_at: removedAt === '',
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="mt-3 space-y-3">
      <TextField label="Seriennummer" value={serial} onChange={(e) => setSerial(e.target.value)} />
      <TextField
        label="Eingebaut am"
        type="date"
        value={installedAt}
        onChange={(e) => setInstalledAt(e.target.value)}
      />
      <TextField
        label="Ausgebaut am (leer = aktiv)"
        type="date"
        value={removedAt}
        onChange={(e) => setRemovedAt(e.target.value)}
        error={error}
      />
      <Button type="submit" variant="filled" disabled={busy} fullWidth>
        {busy ? 'Speichere…' : 'Speichern'}
      </Button>
    </form>
  );
}

function RegisterEditor({ meter, onChanged }: { meter: PhysicalMeterRead; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<RegisterDraft>({
    label: '',
    unit: 'kWh',
    accepts_deliveries: false,
    initial_value: '',
    max_value: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        label: draft.label,
        unit: draft.unit,
        accepts_deliveries: draft.accepts_deliveries,
      };
      if (draft.initial_value.trim()) body['initial_value'] = parseDe(draft.initial_value);
      if (draft.max_value.trim()) body['max_value'] = parseDe(draft.max_value);
      await api.post(`/physical-meters/${meter.id}/registers`, body);
      setDraft({
        label: '',
        unit: 'kWh',
        accepts_deliveries: false,
        initial_value: '',
        max_value: '',
      });
      setAdding(false);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof RangeError) setError(err.message);
      else setError('Hinzufügen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, label: string) {
    if (!window.confirm(`Register "${label}" wirklich löschen?`)) return;
    try {
      await api.delete(`/registers/${id}`);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) window.alert(err.problem.detail ?? err.problem.title);
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t-hairline border-separator pt-3">
      <div className="text-caption-bold uppercase text-tertiary">Register verwalten</div>
      <ul className="space-y-1.5">
        {meter.registers.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2 rounded-card border-hairline border-border bg-fill px-3 py-2"
          >
            <span className="flex-1 text-body-sm text-label">
              {r.label} <span className="text-tertiary">({r.unit})</span>
              {r.accepts_deliveries ? (
                <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-caption text-primary-deep">
                  Lieferungen
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => void remove(r.id, r.label)}
              aria-label="Register löschen"
              className="hover:bg-danger/10 flex h-7 w-7 items-center justify-center rounded-full text-danger transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="space-y-2 rounded-card border-hairline border-border bg-fill p-3">
          <TextField
            label="Label"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            required
          />
          <Select
            label="Einheit"
            value={draft.unit}
            onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value as HeatingUnit }))}
          >
            {HEATING_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
          <ToggleRow
            label="Nachfüllbar (Lieferungen)"
            checked={draft.accepts_deliveries}
            onChange={(v) => setDraft((d) => ({ ...d, accepts_deliveries: v }))}
          />
          <TextField
            label="Anfangsstand (optional)"
            inputMode="decimal"
            value={draft.initial_value}
            onChange={(e) => setDraft((d) => ({ ...d, initial_value: e.target.value }))}
            numeric
          />
          {error ? (
            <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-2 text-caption text-danger">
              {error}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="filled"
              size="sm"
              fullWidth
              onClick={() => void add()}
              disabled={busy || !draft.label.trim()}
            >
              {busy ? 'Speichere…' : 'Register hinzufügen'}
            </Button>
            <Button type="button" variant="bordered" size="sm" onClick={() => setAdding(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="bordered"
          size="sm"
          leftIcon={<Plus size={14} />}
          onClick={() => setAdding(true)}
        >
          Register hinzufügen
        </Button>
      )}
    </div>
  );
}

function CreateForm({
  locations,
  onCreated,
}: {
  locations: LocationRead[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MeterType | null>(null);

  function close() {
    setOpen(false);
    setType(null);
  }

  return (
    <Section header="Neue Messstelle">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cx(
            'hover:bg-fill/40 flex w-full items-center gap-2 px-5 py-3.5 text-left text-body font-semibold text-primary-deep transition-colors',
          )}
        >
          <Plus size={16} strokeWidth={2.5} />
          Messstelle anlegen
        </button>
      ) : type === null ? (
        <div className="space-y-2 p-5">
          <div className="text-caption-bold uppercase text-tertiary">Welcher Messstellen-Typ?</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(['electricity', 'water', 'heating'] as MeterType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className="flex items-center gap-3 rounded-card border-hairline border-border bg-surface-high px-4 py-3 text-left transition-colors hover:bg-fill"
              >
                <TypeBadge type={t} size="md" />
                <span className="text-body font-semibold text-label">{TYPE_LABELS[t]}</span>
              </button>
            ))}
          </div>
          <div className="pt-2">
            <Button type="button" variant="bordered" onClick={close}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <CreateFormFields
          type={type}
          locations={locations}
          onBack={() => setType(null)}
          onCreated={() => {
            close();
            onCreated();
          }}
        />
      )}
    </Section>
  );
}

function CreateFormFields({
  type,
  locations,
  onBack,
  onCreated,
}: {
  type: MeterType;
  locations: LocationRead[];
  onBack: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState<number | null>(null);
  const [serial, setSerial] = useState('');
  const [installedAt, setInstalledAt] = useState(new Date().toISOString().slice(0, 10));

  // Strom
  const [bidi, setBidi] = useState(false);
  const [dual, setDual] = useState(false);
  const [transformerFactor, setTransformerFactor] = useState('');

  // Heizung
  const [heatingSource, setHeatingSource] = useState<HeatingSource>('oil');
  const [registers, setRegisters] = useState<RegisterDraft[]>(HEATING_PRESETS.oil);
  const [tankCapacity, setTankCapacity] = useState('');

  function applyPreset(src: HeatingSource) {
    setHeatingSource(src);
    setRegisters(HEATING_PRESETS[src].map((r) => ({ ...r })));
  }

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name,
        type,
        location_id: locationId,
        is_bidirectional: bidi,
        has_dual_tariff: dual,
        serial_number: serial,
        installed_at: installedAt,
        initial_values: {},
      };
      if (type === 'electricity' && transformerFactor.trim()) {
        const parsed = Number(transformerFactor.trim());
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new RangeError('Wandlerfaktor muss eine positive Ganzzahl sein.');
        }
        body['transformer_factor'] = parsed;
      }
      if (type === 'heating') {
        body['heating_source'] = heatingSource;
        if (tankCapacity.trim()) body['tank_capacity'] = parseDe(tankCapacity);
        body['registers'] = registers.map((r) => {
          const out: Record<string, unknown> = {
            label: r.label,
            unit: r.unit,
            accepts_deliveries: r.accepts_deliveries,
          };
          if (r.initial_value.trim()) out['initial_value'] = parseDe(r.initial_value);
          if (r.max_value.trim()) out['max_value'] = parseDe(r.max_value);
          return out;
        });
      }
      await api.post('/measuring-points', body);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof RangeError) setError(err.message);
      else setError('Konnte Messstelle nicht anlegen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 p-5">
      <div className="flex items-center gap-2 text-caption text-tertiary">
        <button type="button" onClick={onBack} className="text-primary-deep hover:underline">
          ← Typ ändern
        </button>
        <span>·</span>
        <TypeBadge type={type} size="sm" />
        <span className="font-semibold text-label">{TYPE_LABELS[type]}</span>
      </div>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
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
      <TextField
        label="Seriennummer"
        value={serial}
        onChange={(e) => setSerial(e.target.value)}
        required
      />
      <TextField
        label="Eingebaut am"
        type="date"
        value={installedAt}
        onChange={(e) => setInstalledAt(e.target.value)}
        required
      />

      {type === 'electricity' ? (
        <>
          <ToggleRow label="Bidirektional (Einspeisung)" checked={bidi} onChange={setBidi} />
          <ToggleRow label="Doppeltarif (HT/NT)" checked={dual} onChange={setDual} />
          <TextField
            label="Wandlerfaktor (optional)"
            inputMode="numeric"
            pattern="[0-9]*"
            value={transformerFactor}
            onChange={(e) => setTransformerFactor(e.target.value)}
            hint="leer = kein Wandler; Verbräuche werden mit dem Faktor multipliziert."
            numeric
          />
        </>
      ) : null}

      {type === 'heating' ? (
        <>
          <Select
            label="Energieträger"
            value={heatingSource}
            onChange={(e) => applyPreset(e.target.value as HeatingSource)}
          >
            {(Object.keys(HEATING_SOURCE_LABELS) as HeatingSource[]).map((s) => (
              <option key={s} value={s}>
                {HEATING_SOURCE_LABELS[s]}
              </option>
            ))}
          </Select>
          <TextField
            label="Tankvolumen / Vorratsmenge (optional)"
            inputMode="decimal"
            value={tankCapacity}
            onChange={(e) => setTankCapacity(e.target.value)}
            hint="für Prozent-Anzeige des Vorrats"
            numeric
          />
          <RegisterDraftList registers={registers} onChange={setRegisters} />
        </>
      ) : null}

      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger">
          {error}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" fullWidth disabled={busy}>
          {busy ? 'Speichere…' : 'Anlegen'}
        </Button>
        <Button type="button" variant="bordered" onClick={onBack}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function RegisterDraftList({
  registers,
  onChange,
}: {
  registers: RegisterDraft[];
  onChange: (rs: RegisterDraft[]) => void;
}) {
  function update(idx: number, patch: Partial<RegisterDraft>) {
    onChange(registers.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function remove(idx: number) {
    onChange(registers.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([
      ...registers,
      {
        label: '',
        unit: 'kWh',
        accepts_deliveries: false,
        initial_value: '',
        max_value: '',
      },
    ]);
  }
  return (
    <div className="space-y-2">
      <div className="text-caption-bold uppercase text-tertiary">Register</div>
      {registers.map((r, idx) => (
        <div key={idx} className="space-y-2 rounded-card border-hairline border-border bg-fill p-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <TextField
                label="Label"
                value={r.label}
                onChange={(e) => update(idx, { label: e.target.value })}
                required
              />
              <Select
                label="Einheit"
                value={r.unit}
                onChange={(e) => update(idx, { unit: e.target.value as HeatingUnit })}
              >
                {HEATING_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
              <ToggleRow
                label="Nachfüllbar (Lieferungen)"
                checked={r.accepts_deliveries}
                onChange={(v) => update(idx, { accepts_deliveries: v })}
              />
              <TextField
                label="Anfangsstand (optional)"
                inputMode="decimal"
                value={r.initial_value}
                onChange={(e) => update(idx, { initial_value: e.target.value })}
                numeric
              />
            </div>
            <button
              type="button"
              onClick={() => remove(idx)}
              aria-label="Register entfernen"
              className="hover:bg-danger/10 mt-1 flex h-7 w-7 items-center justify-center rounded-full text-danger transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="bordered"
        size="sm"
        leftIcon={<Plus size={14} />}
        onClick={add}
      >
        Register hinzufügen
      </Button>
    </div>
  );
}

function ReplaceMeterForm({
  mp,
  onClose,
  onReplaced,
}: {
  mp: MeasuringPointRead;
  onClose: () => void;
  onReplaced: () => void;
}) {
  const active = mp.physical_meters.find((m) => m.removed_at === null);
  const obis = active?.registers.filter((r) => r.is_active).map((r) => r.obis_code) ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const [removedAt, setRemovedAt] = useState(today);
  const [installedAt, setInstalledAt] = useState(today);
  const [serial, setSerial] = useState('');
  const [final, setFinal] = useState<Record<string, string>>(() =>
    Object.fromEntries(obis.map((c) => [c, ''])),
  );
  const [initial, setInitial] = useState<Record<string, string>>(() =>
    Object.fromEntries(obis.map((c) => [c, '0'])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const finalParsed: Record<string, string> = {};
      const initialParsed: Record<string, string> = {};
      for (const code of obis) {
        finalParsed[code] = parseDe(final[code] ?? '');
        initialParsed[code] = parseDe(initial[code] ?? '0');
      }
      await api.post(`/measuring-points/${mp.id}/replace-meter`, {
        final_readings: finalParsed,
        removed_at: removedAt,
        new_serial_number: serial,
        installed_at: installedAt,
        initial_readings: initialParsed,
      });
      onReplaced();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof RangeError) setError(err.message);
      else setError('Tausch fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <TextField
        label="Ausgebaut am"
        type="date"
        value={removedAt}
        onChange={(e) => setRemovedAt(e.target.value)}
      />
      <TextField
        label="Eingebaut am"
        type="date"
        value={installedAt}
        onChange={(e) => setInstalledAt(e.target.value)}
      />
      <TextField
        label="Neue Seriennummer"
        value={serial}
        onChange={(e) => setSerial(e.target.value)}
        required
      />
      <div>
        <div className="mb-2 text-caption-bold uppercase text-tertiary">Endstände (alt)</div>
        <div className="space-y-2">
          {obis.map((code) => (
            <TextField
              key={`f-${code}`}
              label={code}
              inputMode="decimal"
              value={final[code] ?? ''}
              onChange={(e) => setFinal((s) => ({ ...s, [code]: e.target.value }))}
              required
              numeric
            />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-caption-bold uppercase text-tertiary">Anfangsstände (neu)</div>
        <div className="space-y-2">
          {obis.map((code) => (
            <TextField
              key={`i-${code}`}
              label={code}
              inputMode="decimal"
              value={initial[code] ?? ''}
              onChange={(e) => setInitial((s) => ({ ...s, [code]: e.target.value }))}
              numeric
            />
          ))}
        </div>
      </div>
      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger">
          {error}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Tausche…' : 'Tausch durchführen'}
        </Button>
        <Button type="button" variant="bordered" onClick={onClose}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
