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
import { PageGlows } from '@/components/PageGlows';
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
import { cx } from '@/components/ui/cx';

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
    <PageContainer>
      <LargeTitle title="Messstellen" />
      {error ? (
        <div className="rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-danger">
          {error}
        </div>
      ) : null}

      <CreateForm locations={locations} onCreated={refresh} />

      <div className="space-y-3">
        {(points ?? []).map((mp) => (
          <MPCard key={mp.id} mp={mp} locations={locations} onChanged={refresh} />
        ))}
      </div>
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
              {TYPE_LABELS[mp.type]}
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
          to={`/messstellen/${mp.id}`}
          className="rounded-pill border-hairline border-border bg-fill p-2 text-tertiary transition-colors hover:bg-fill-strong hover:text-label"
          aria-label="Detail-Ansicht öffnen"
          title="Detail-Ansicht"
        >
          <ExternalLink size={14} />
        </Link>
      </div>

      {open ? (
        <div
          id={`mp-${mp.id}-body`}
          className="space-y-3 border-t-hairline border-separator p-5"
        >
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
              className="text-danger hover:bg-danger/10"
            >
              Löschen
            </Button>
          </div>
          {deleteError ? (
            <div className="rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-caption text-danger">
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
          <div className="text-caption text-tertiary">
            Hinweis: Register werden nicht automatisch angepasst — beim nächsten Zählerwechsel
            wirken sich die Flags auf den neuen Zähler aus.
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
          numeric
        />
      ) : null}
      {error ? (
        <div className="rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-caption text-danger">
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
    <div className="rounded-card border-hairline border-border bg-fill/60 p-4">
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
        <MeterEditForm
          meter={meter}
          onSaved={() => {
            setEdit(false);
            onChanged();
          }}
        />
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
          className={cx(
            'flex w-full items-center gap-2 px-5 py-3.5 text-left text-body font-semibold text-primary-deep transition-colors hover:bg-fill/40',
          )}
        >
          <Plus size={16} strokeWidth={2.5} />
          Messstelle anlegen
        </button>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 p-5">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Select label="Typ" value={type} onChange={(e) => setType(e.target.value as MeterType)}>
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
                numeric
              />
              <TextField
                label="Anfangs-Tankstand (Liter)"
                inputMode="decimal"
                value={oilTank}
                onChange={(e) => setOilTank(e.target.value)}
                hint="leer = nicht erfassen"
                numeric
              />
              <TextField
                label="Tankvolumen (Liter)"
                inputMode="decimal"
                value={tankCapacity}
                onChange={(e) => setTankCapacity(e.target.value)}
                hint="für Prozent-Anzeige; optional"
                numeric
              />
            </>
          ) : null}
          {error ? (
            <div className="rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-caption text-danger">
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
        <div className="rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-caption text-danger">
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
