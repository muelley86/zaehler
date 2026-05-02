import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

import {
  Button,
  Card,
  LargeTitle,
  Section,
  Select,
  Sheet,
  Switch,
  TextField,
} from '@/components/ui';
import { DeliveriesSheet } from './DeliveriesSheet';
import { ApiError, api } from '@/lib/api';
import { parseDe } from '@/lib/format';
import type {
  LocationRead,
  MeasuringPointRead,
  MeterType,
  PhysicalMeterRead,
  RegisterRead,
} from '@/lib/types';

const TYPE_LABELS: Record<MeterType, string> = {
  electricity: 'Strom',
  gas: 'Gas',
  water: 'Wasser',
  oil: 'Ölheizung',
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
    <div className="space-y-5 pb-4">
      <LargeTitle title="Messstellen" />

      {error ? (
        <div className="mx-4 rounded-ios-lg bg-ios-red/15 p-3 text-ios-red">{error}</div>
      ) : null}

      <div className="space-y-5 px-4">
        <CreateForm locations={locations} onCreated={refresh} />

        <div className="space-y-3">
          {(points ?? []).map((mp) => (
            <MPCard key={mp.id} mp={mp} locations={locations} onChanged={refresh} />
          ))}
        </div>
      </div>
    </div>
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="truncate text-ios-headline">{mp.name}</div>
          <div className="text-ios-footnote text-ios-tertiary">
            {TYPE_LABELS[mp.type]}
            {mp.location_name ? ` · ${mp.location_name}` : ''}
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} className="text-ios-tertiary" />
        ) : (
          <ChevronDown size={18} className="text-ios-tertiary" />
        )}
      </button>

      {open ? (
        <div className="border-t border-ios-separator/60 p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="bordered"
              size="sm"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? 'Schließen' : 'Bearbeiten'}
            </Button>
            <Button
              variant="plain"
              size="sm"
              leftIcon={<Trash2 size={14} />}
              onClick={() => void deleteMp()}
              disabled={busy}
              className="text-ios-red hover:bg-ios-red/10"
            >
              Löschen
            </Button>
          </div>
          {deleteError ? (
            <div className="rounded-ios-lg bg-ios-red/15 p-3 text-ios-footnote text-ios-red">
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
      if (mp.type === 'oil') {
        if (tankCapacity.trim() === '') {
          body['clear_tank_capacity'] = true;
        } else {
          body['tank_capacity'] = parseDe(tankCapacity);
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
      <TextField
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
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
          <div className="text-ios-caption text-ios-tertiary">
            Hinweis: Register werden nicht automatisch angepasst — beim nächsten
            Zählerwechsel wirken sich die Flags auf den neuen Zähler aus.
          </div>
        </>
      ) : null}
      {mp.type === 'oil' ? (
        <TextField
          label="Tankvolumen (Liter)"
          inputMode="decimal"
          value={tankCapacity}
          onChange={(e) => setTankCapacity(e.target.value)}
          hint="leer = nicht gesetzt; wird für Prozent-Anzeige genutzt"
        />
      ) : null}
      {error ? (
        <div className="rounded-ios-lg bg-ios-red/15 p-3 text-ios-footnote text-ios-red">
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
    <div className="flex items-center justify-between rounded-ios bg-ios-elevated px-3 py-2.5">
      <span className="text-ios-body">{label}</span>
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
    <div className="rounded-ios-lg border border-ios-separator/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-ios-headline">SN {meter.serial_number}</div>
        <div className="text-ios-footnote text-ios-tertiary">
          {meter.installed_at} – {meter.removed_at ?? 'aktiv'}
        </div>
      </div>
      <ul className="mt-2 space-y-1 text-ios-footnote">
        {meter.registers.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <code className="rounded bg-ios-fill/15 px-1.5 py-0.5 text-ios-caption">
              {r.obis_code}
            </code>
            <span>
              {r.label} <span className="text-ios-tertiary">({r.unit})</span>
            </span>
            {!r.is_active ? (
              <span className="rounded-full bg-ios-fill/15 px-2 text-ios-caption text-ios-secondary">
                inaktiv
              </span>
            ) : null}
            {r.accepts_deliveries ? (
              <button
                type="button"
                onClick={() => setDeliveriesFor(r)}
                className="ml-auto rounded-full bg-ios-blue/15 px-2 py-0.5 text-ios-caption text-ios-blue"
              >
                Befüllungen
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-1.5">
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
        <MeterEditForm
          meter={meter}
          onSaved={() => {
            setEdit(false);
            onChanged();
          }}
        />
      ) : null}

      <Sheet open={replace} onClose={() => setReplace(false)} title="Zähler tauschen">
        <ReplaceMeterForm
          mp={mp}
          onClose={() => setReplace(false)}
          onReplaced={onChanged}
        />
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

function MeterEditForm({
  meter,
  onSaved,
}: {
  meter: PhysicalMeterRead;
  onSaved: () => void;
}) {
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

function CreateForm({
  locations,
  onCreated,
}: {
  locations: LocationRead[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<MeterType>('electricity');
  const [locationId, setLocationId] = useState<number | null>(null);
  const [bidi, setBidi] = useState(false);
  const [dual, setDual] = useState(false);
  const [serial, setSerial] = useState('');
  const [installedAt, setInstalledAt] = useState(new Date().toISOString().slice(0, 10));
  const [oilHours, setOilHours] = useState('0');
  const [oilTank, setOilTank] = useState('');
  const [tankCapacity, setTankCapacity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const initialValues: Record<string, string> = {};
      if (type === 'oil') {
        initialValues['oil.hours'] = parseDe(oilHours || '0');
        if (oilTank.trim()) {
          initialValues['oil.tank'] = parseDe(oilTank);
        }
      }
      const body: Record<string, unknown> = {
        name,
        type,
        location_id: locationId,
        is_bidirectional: bidi,
        has_dual_tariff: dual,
        serial_number: serial,
        installed_at: installedAt,
        initial_values: initialValues,
      };
      if (type === 'oil' && tankCapacity.trim()) {
        body['tank_capacity'] = parseDe(tankCapacity);
      }
      await api.post('/measuring-points', body);
      setName('');
      setSerial('');
      setOilHours('0');
      setOilTank('');
      setTankCapacity('');
      setOpen(false);
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
    <Section header="Neue Messstelle">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center px-4 py-3 text-left text-ios-blue"
        >
          + Messstelle anlegen
        </button>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 p-4">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Select
            label="Typ"
            value={type}
            onChange={(e) => setType(e.target.value as MeterType)}
          >
            <option value="electricity">Strom</option>
            <option value="gas">Gas</option>
            <option value="water">Wasser</option>
            <option value="oil">Ölheizung</option>
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
            </>
          ) : null}
          {type === 'oil' ? (
            <>
              <TextField
                label="Anfangs-Betriebsstunden"
                inputMode="decimal"
                value={oilHours}
                onChange={(e) => setOilHours(e.target.value)}
                hint="leer = 0"
              />
              <TextField
                label="Anfangs-Tankstand (Liter)"
                inputMode="decimal"
                value={oilTank}
                onChange={(e) => setOilTank(e.target.value)}
                hint="leer = nicht erfassen"
              />
              <TextField
                label="Tankvolumen (Liter)"
                inputMode="decimal"
                value={tankCapacity}
                onChange={(e) => setTankCapacity(e.target.value)}
                hint="für Prozent-Anzeige; optional"
              />
            </>
          ) : null}
          {error ? (
            <div className="rounded-ios-lg bg-ios-red/15 p-3 text-ios-footnote text-ios-red">
              {error}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" variant="filled" fullWidth disabled={busy}>
              {busy ? 'Speichere…' : 'Anlegen'}
            </Button>
            <Button type="button" variant="bordered" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}
    </Section>
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
        <div className="mb-2 text-ios-footnote text-ios-secondary">Endstände (alt)</div>
        <div className="space-y-2">
          {obis.map((code) => (
            <TextField
              key={`f-${code}`}
              label={code}
              inputMode="decimal"
              value={final[code] ?? ''}
              onChange={(e) =>
                setFinal((s) => ({ ...s, [code]: e.target.value }))
              }
              required
            />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-ios-footnote text-ios-secondary">Anfangsstände (neu)</div>
        <div className="space-y-2">
          {obis.map((code) => (
            <TextField
              key={`i-${code}`}
              label={code}
              inputMode="decimal"
              value={initial[code] ?? ''}
              onChange={(e) =>
                setInitial((s) => ({ ...s, [code]: e.target.value }))
              }
            />
          ))}
        </div>
      </div>
      {error ? (
        <div className="rounded-ios-lg bg-ios-red/15 p-3 text-ios-footnote text-ios-red">
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
