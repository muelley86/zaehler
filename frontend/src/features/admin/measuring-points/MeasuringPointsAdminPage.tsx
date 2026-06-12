/**
 * Übersicht aller Messstellen (Admin-Liste).
 *
 * Zeigt eine kompakte Card pro MP — TypeBadge, Name, Sublabel
 * (Energieträger + Standort) — und einen kleinen Löschen-Knopf rechts.
 * Klick auf die Card navigiert zur Detail-Page (`/admin/messstellen/:id`),
 * wo alle Edit-Funktionen leben (Stammdaten, physische Zähler,
 * Zählerwechsel, Heizungs-Register, Heizöl-Lieferungen).
 *
 * Anlegen läuft weiterhin über den `CreateForm`-Wizard oben — er ist hier
 * der einzige nicht-Lese-Workflow.
 */

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  Button,
  Card,
  LargeTitle,
  MultiSelectDropdown,
  Section,
  Select,
  Switch,
  TextField,
  TypeBadge,
} from '@/components/ui';
import type { DropdownOption } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { parseDe } from '@/lib/format';
import { HEATING_SOURCE_LABELS, TYPE_LABELS, describeMeterType } from '@/lib/meterLabels';
import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import { setCodec, useStickyState } from '@/lib/useStickyState';
import type {
  HeatingSource,
  HeatingUnit,
  LocationRead,
  MeasuringPointRead,
  MeterType,
  OwnerRead,
  SupplierRead,
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

// Session-Memory der Filter („Filter merken") — Muster wie Dashboard/Readings.
const FILTER_NS = 'filters.adminMeasuringPoints.';
const isMeterType = (x: unknown): x is MeterType =>
  typeof x === 'string' && Object.prototype.hasOwnProperty.call(TYPE_LABELS, x);
const TYPE_CODEC = setCodec<MeterType>(isMeterType);
// Id-Filter mit „ohne …"-Option: null = Messstellen ohne Zuordnung.
const isIdMember = (x: unknown): x is number | null => x === null || typeof x === 'number';
const ID_CODEC = setCodec<number | null>(isIdMember);

export function MeasuringPointsAdminPage() {
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [locations, setLocations] = useState<LocationRead[]>([]);
  const [owners, setOwners] = useState<OwnerRead[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // „Filter merken": Filter je Seite in sessionStorage gespiegelt; sonst
  // normales useState (unverändertes Verhalten).
  const { rememberFilters } = useFilterPrefs();
  const [typeFilter, setTypeFilter] = useStickyState<Set<MeterType>>(
    FILTER_NS + 'type',
    new Set(),
    rememberFilters,
    TYPE_CODEC,
  );
  const [ownerFilter, setOwnerFilter] = useStickyState<Set<number | null>>(
    FILTER_NS + 'owner',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );
  const [supplierFilter, setSupplierFilter] = useStickyState<Set<number | null>>(
    FILTER_NS + 'supplier',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );
  const [mainLocationFilter, setMainLocationFilter] = useStickyState<Set<number | null>>(
    FILTER_NS + 'mainLocation',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );

  useEffect(() => {
    Promise.all([
      api.get<MeasuringPointRead[]>('/measuring-points'),
      api.get<LocationRead[]>('/locations'),
      api.get<OwnerRead[]>('/owners'),
      api.get<SupplierRead[]>('/suppliers'),
    ])
      .then(([mps, locs, owns, supps]) => {
        setPoints(mps);
        setLocations(locs);
        setOwners(owns);
        setSuppliers(supps);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  // Filter-Optionen aus der MP-Liste selbst ableiten (Dashboard-Muster):
  // nur tatsächlich verwendete Werte anbieten, jeweils + „ohne …"-Option.
  const ownerOptions = useMemo(() => {
    const map = new Map<number, string>();
    points?.forEach((mp) => {
      if (mp.current_owner_id !== null && !map.has(mp.current_owner_id)) {
        map.set(mp.current_owner_id, mp.current_owner_name ?? `#${mp.current_owner_id}`);
      }
    });
    return Array.from(map.entries());
  }, [points]);

  const supplierOptions = useMemo(() => {
    const map = new Map<number, string>();
    points?.forEach((mp) => {
      if (mp.current_supplier_id !== null && !map.has(mp.current_supplier_id)) {
        map.set(mp.current_supplier_id, mp.current_supplier_name ?? `#${mp.current_supplier_id}`);
      }
    });
    return Array.from(map.entries());
  }, [points]);

  const mainLocationOptions = useMemo(() => {
    const map = new Map<number, string>();
    points?.forEach((mp) => {
      if (mp.main_location_id !== null && !map.has(mp.main_location_id)) {
        map.set(mp.main_location_id, mp.main_location_name ?? `#${mp.main_location_id}`);
      }
    });
    return Array.from(map.entries());
  }, [points]);

  const filtered = useMemo(
    () =>
      (points ?? []).filter(
        (mp) =>
          (typeFilter.size === 0 || typeFilter.has(mp.type)) &&
          (ownerFilter.size === 0 || ownerFilter.has(mp.current_owner_id)) &&
          (supplierFilter.size === 0 || supplierFilter.has(mp.current_supplier_id)) &&
          (mainLocationFilter.size === 0 || mainLocationFilter.has(mp.main_location_id)),
      ),
    [points, typeFilter, ownerFilter, supplierFilter, mainLocationFilter],
  );

  const hasActiveFilters =
    typeFilter.size > 0 ||
    ownerFilter.size > 0 ||
    supplierFilter.size > 0 ||
    mainLocationFilter.size > 0;

  function resetFilters() {
    setTypeFilter(new Set());
    setOwnerFilter(new Set());
    setSupplierFilter(new Set());
    setMainLocationFilter(new Set());
  }

  return (
    <>
      <LargeTitle title="Messstellen" />
      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      ) : null}

      <CreateForm locations={locations} owners={owners} suppliers={suppliers} onCreated={refresh} />

      {points && points.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelectDropdown
            label="Typ"
            options={(Object.keys(TYPE_LABELS) as MeterType[]).map((t) => ({
              value: t,
              label: TYPE_LABELS[t],
            }))}
            selected={typeFilter}
            onChange={setTypeFilter}
          />
          {ownerOptions.length > 0 ? (
            <MultiSelectDropdown
              label="Eigentümer"
              options={[
                ...ownerOptions.map(
                  ([id, name]): DropdownOption<number | null> => ({ value: id, label: name }),
                ),
                { value: null, label: 'ohne Eigentümer' } satisfies DropdownOption<number | null>,
              ]}
              selected={ownerFilter}
              onChange={setOwnerFilter}
            />
          ) : null}
          {supplierOptions.length > 0 ? (
            <MultiSelectDropdown
              label="Lieferant"
              options={[
                ...supplierOptions.map(
                  ([id, name]): DropdownOption<number | null> => ({ value: id, label: name }),
                ),
                { value: null, label: 'ohne Lieferant' } satisfies DropdownOption<number | null>,
              ]}
              selected={supplierFilter}
              onChange={setSupplierFilter}
            />
          ) : null}
          {mainLocationOptions.length > 0 ? (
            <MultiSelectDropdown
              label="Hauptstandort"
              options={[
                ...mainLocationOptions.map(
                  ([id, name]): DropdownOption<number | null> => ({ value: id, label: name }),
                ),
                {
                  value: null,
                  label: 'ohne Hauptstandort',
                } satisfies DropdownOption<number | null>,
              ]}
              selected={mainLocationFilter}
              onChange={setMainLocationFilter}
            />
          ) : null}
          {hasActiveFilters ? (
            <Button variant="plain" size="sm" onClick={resetFilters}>
              Filter zurücksetzen
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        {filtered.map((mp) => (
          <MPCard key={mp.id} mp={mp} onChanged={refresh} />
        ))}
        {points && points.length > 0 && filtered.length === 0 ? (
          <div className="text-tertiary">Keine Messstellen für diese Filter.</div>
        ) : null}
      </div>
    </>
  );
}

/**
 * Kompakte Card pro Messstelle. Die ganze Card ist klickbar und navigiert
 * zur Detail-Page; rechts steht ein kleiner Löschen-Knopf, der
 * absichtlich auf der Übersicht und nicht auf der Detail-Page lebt
 * (Sicherheits-Aktion mit Confirmation).
 *
 * Damit der Löschen-Klick nicht in den Card-Link bubbelt, halten wir den
 * Klick mit ``e.stopPropagation()`` an der Knopf-Ebene zurück.
 */
function MPCard({ mp, onChanged }: { mp: MeasuringPointRead; onChanged: () => void }) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function deleteMp(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
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
      <Link
        to={`/admin/messstellen/${mp.id}`}
        className="hover:bg-fill/40 flex items-center gap-2 px-5 py-4 transition-colors"
        aria-label={`Messstelle ${mp.name} öffnen`}
      >
        <TypeBadge type={mp.type} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-headline tracking-tight text-label">{mp.name}</div>
          <div className="text-caption text-tertiary">
            {describeMeterType(mp.type, mp.heating_source)}
            {mp.location_name ? ` · ${mp.location_name}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => void deleteMp(e)}
          disabled={busy}
          aria-label={`Messstelle ${mp.name} löschen`}
          title="Löschen"
          className="hover:bg-danger/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-tertiary transition-colors hover:text-danger disabled:opacity-50"
        >
          <Trash2 size={14} />
        </button>
      </Link>
      {deleteError ? (
        <div className="border-danger/40 bg-danger/10 mx-5 mb-4 rounded-card border-hairline p-3 text-caption text-danger">
          {deleteError}
        </div>
      ) : null}
    </Card>
  );
}

function CreateForm({
  locations,
  owners,
  suppliers,
  onCreated,
}: {
  locations: LocationRead[];
  owners: OwnerRead[];
  suppliers: SupplierRead[];
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
          owners={owners}
          suppliers={suppliers}
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
  owners,
  suppliers,
  onBack,
  onCreated,
}: {
  type: MeterType;
  locations: LocationRead[];
  owners: OwnerRead[];
  suppliers: SupplierRead[];
  onBack: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState<number | null>(null);
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [serial, setSerial] = useState('');
  const [installedAt, setInstalledAt] = useState(new Date().toISOString().slice(0, 10));

  // Strom
  const [bidi, setBidi] = useState(false);
  const [dual, setDual] = useState(false);
  const [transformerFactor, setTransformerFactor] = useState('');

  // Vertragsnummer + Marktlokation (siehe Typ-Gating beim Submit).
  const [contractNumber, setContractNumber] = useState('');
  const [marketLocation, setMarketLocation] = useState('');

  // Einbauort (alle Typen)
  const [installationLocation, setInstallationLocation] = useState('');

  // Kostenstelle (alle Typen, optional)
  const [kostenstelle, setKostenstelle] = useState('');

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
      // Vertragsnummer fuer Strom + Wasser; Marktlokation nur Strom.
      if ((type === 'electricity' || type === 'water') && contractNumber.trim()) {
        body['contract_number'] = contractNumber.trim();
      }
      if (type === 'electricity' && marketLocation.trim()) {
        body['market_location'] = marketLocation.trim();
      }
      if (ownerId !== null) {
        body['owner_id'] = ownerId;
        // valid_from = installed_at (= Default beim Erstanlegen).
        body['owner_valid_from'] = installedAt;
      }
      if (supplierId !== null) {
        body['supplier_id'] = supplierId;
        body['supplier_valid_from'] = installedAt;
      }
      if (installationLocation.trim()) {
        body['installation_location'] = installationLocation.trim();
      }
      if (kostenstelle.trim()) {
        const parsed = Number(kostenstelle.trim());
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 99999) {
          throw new RangeError('Kostenstelle muss eine Ganzzahl zwischen 0 und 99999 sein.');
        }
        body['kostenstelle'] = parsed;
      }
      if (type === 'heating') {
        body['heating_source'] = heatingSource;
        // Fernwärme: kein Tankvolumen (Feld ist ausgeblendet) — ggf. veraltet
        // eingetippten Wert nicht mitschicken.
        if (heatingSource !== 'district_heat' && tankCapacity.trim()) {
          body['tank_capacity'] = parseDe(tankCapacity);
        }
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
      <Select
        label="Eigentümer (optional)"
        value={ownerId ?? ''}
        onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— kein Eigentümer —</option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
      <Select
        label="Lieferant (optional)"
        value={supplierId ?? ''}
        onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— kein Lieferant —</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <TextField
        label="Einbauort (optional)"
        value={installationLocation}
        onChange={(e) => setInstallationLocation(e.target.value)}
        hint="z. B. 1. Stock, Wohnung 4b oder Heizungsraum links."
      />
      <TextField
        label="Kostenstelle (optional)"
        inputMode="numeric"
        value={kostenstelle}
        onChange={(e) => setKostenstelle(e.target.value.replace(/\D/g, '').slice(0, 5))}
        hint="5-stellige Zahl (0–99999); leer = nicht gesetzt"
      />
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
          <TextField
            label="Vertragsnummer (optional)"
            value={contractNumber}
            onChange={(e) => setContractNumber(e.target.value)}
            hint="Kundennummer beim Versorger — hilft beim Rechnungs-Abgleich."
          />
          <TextField
            label="Marktlokation / MaLo-ID (optional)"
            value={marketLocation}
            onChange={(e) => setMarketLocation(e.target.value)}
            hint="11-stellige MaLo aus der Stromrechnung."
            inputMode="numeric"
            pattern="\d{11}"
            maxLength={11}
          />
        </>
      ) : null}

      {type === 'water' ? (
        <TextField
          label="Vertragsnummer (optional)"
          value={contractNumber}
          onChange={(e) => setContractNumber(e.target.value)}
          hint="Kundennummer beim Wasserversorger."
        />
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
          {/* Fernwärme hat keinen Vorratstank und kein Nachfüllen -> beides ausblenden. */}
          {heatingSource !== 'district_heat' ? (
            <TextField
              label="Tankvolumen / Vorratsmenge (optional)"
              inputMode="decimal"
              value={tankCapacity}
              onChange={(e) => setTankCapacity(e.target.value)}
              hint="für Prozent-Anzeige des Vorrats"
              numeric
            />
          ) : null}
          <RegisterDraftList
            registers={registers}
            onChange={setRegisters}
            allowDeliveries={heatingSource !== 'district_heat'}
          />
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

function RegisterDraftList({
  registers,
  onChange,
  allowDeliveries = true,
}: {
  registers: RegisterDraft[];
  onChange: (rs: RegisterDraft[]) => void;
  allowDeliveries?: boolean;
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
              {allowDeliveries ? (
                <ToggleRow
                  label="Nachfüllbar (Lieferungen)"
                  checked={r.accepts_deliveries}
                  onChange={(v) => update(idx, { accepts_deliveries: v })}
                />
              ) : null}
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
