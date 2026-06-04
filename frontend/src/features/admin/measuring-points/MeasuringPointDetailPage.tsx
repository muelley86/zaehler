/**
 * Detail-Seite einer Messstelle. Zentraler Ort für die Stammdaten-Pflege.
 *
 * Layout (von oben nach unten):
 *  1. BackLink + Title (Name editierbar via Pencil-Icon)
 *  2. Stammdaten-Card (ganzer Edit-Modus via "Bearbeiten"-Knopf)
 *  3. Physische Zähler (alle Zähler, Edit pro Zähler, "Tauschen"-CTA)
 *  4. Verbrauchskurve (read-only Chart)
 *  5. Register (read-only; Heizung-Spezifika in Folge-Commit)
 *  6. QR-Codes + Zugriff (Cards aus separaten Modulen)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Droplet,
  Map as MapIcon,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Button,
  Card,
  EmptyState,
  LargeTitle,
  Section,
  Select,
  Sheet,
  Switch,
  TextField,
  TypeBadge,
} from '@/components/ui';
import { LocationMapSheet } from '@/components/LocationMapSheet';
import { useAuth } from '@/features/auth/auth-context';
import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import { ApiError, api } from '@/lib/api';
import { formatDateDe, formatDateTickDe, formatDateTimeDe, formatDe, parseDe } from '@/lib/format';
import { useChartTheme } from '@/lib/useChartTheme';
import type {
  ConsumptionPoint,
  HeatingUnit,
  LocationRead,
  MeasuringPointRead,
  OwnerAssignmentRead,
  OwnerRead,
  PhysicalMeterRead,
  RegisterRead,
  RegisterStateRead,
} from '@/lib/types';
import { HEATING_UNITS } from '@/lib/types';
import { describeMeterType } from '@/lib/meterLabels';
import { cx } from '@/components/ui/cx';
import { DeliveriesSheet } from './DeliveriesSheet';
import { MpAccessCard } from './MpAccessCard';
import { QrCodeCard } from './QrCodeCard';

// Konstante Chart-Margin als Modul-Const, damit Recharts keine neue
// Object-Referenz pro Render sieht.
const CHART_MARGIN = { top: 10, right: 16, bottom: 8, left: 8 } as const;

export function MeasuringPointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const mpId = id ? Number(id) : NaN;

  const [mp, setMp] = useState<MeasuringPointRead | null>(null);
  const [locations, setLocations] = useState<LocationRead[]>([]);
  const [location, setLocation] = useState<LocationRead | null>(null);
  const [consumption, setConsumption] = useState<ConsumptionPoint[]>([]);
  const [states, setStates] = useState<RegisterStateRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [tick, setTick] = useState(0);

  // Globaler Datumsbereich aus der Navigation — treibt die Verbrauchskurve
  // (wie das Dashboard). `from`/`to` als lokale Aliase für die Query.
  const { dateRange } = useFilterPrefs();
  const from = dateRange.from;
  const to = dateRange.to;

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!Number.isFinite(mpId)) {
      navigate('/admin/messstellen', { replace: true });
      return;
    }
    // Stammdaten + Locations + Register-State parallel — keine Cascade. Die
    // Verbrauchskurve hängt am Datumsbereich und lädt in einem eigenen Effekt;
    // Location wird anhand von mp.location_id nachgeladen.
    api
      .get<MeasuringPointRead>(`/measuring-points/${mpId}`)
      .then(setMp)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
        else setError('Konnte Messstelle nicht laden.');
      });
    api
      .get<LocationRead[]>('/locations')
      .then(setLocations)
      .catch(() => {
        /* nicht kritisch - der Edit-Modus zeigt dann eine leere Auswahl */
      });
    api
      .get<RegisterStateRead[]>(`/measuring-points/${mpId}/state`)
      .then(setStates)
      .catch(() => {
        /* nicht kritisch */
      });
  }, [mpId, navigate, tick]);

  // Verbrauchskurve: respektiert den globalen Datumsbereich (from_at/to_at) und
  // lädt bei jeder Datumsänderung neu. Ein `cancelled`-Flag verwirft veraltete
  // Antworten bei schnellem Umstellen (Jahr-Pfeile), ohne AbortSignal — wie die
  // übrigen Fetches dieser Seite.
  useEffect(() => {
    if (!Number.isFinite(mpId)) return;
    let cancelled = false;
    const p = new URLSearchParams();
    if (from) p.set('from_at', from);
    if (to) p.set('to_at', to);
    const qs = p.toString();
    api
      .get<ConsumptionPoint[]>(`/measuring-points/${mpId}/consumption${qs ? `?${qs}` : ''}`)
      .then((data) => {
        if (!cancelled) setConsumption(data);
      })
      .catch(() => {
        /* nicht kritisch */
      });
    return () => {
      cancelled = true;
    };
  }, [mpId, from, to, tick]);

  // Standort-Detail nur laden, wenn die MP einen hat. Optional, daher
  // schluckt der Catch leise.
  useEffect(() => {
    if (mp?.location_id == null) {
      setLocation(null);
      return;
    }
    api
      .get<LocationRead>(`/locations/${mp.location_id}`)
      .then(setLocation)
      .catch(() => {
        /* nicht kritisch - Standort-Detail optional */
      });
  }, [mp?.location_id]);

  if (error) {
    return (
      <>
        <BackLink />
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      </>
    );
  }
  if (!mp) {
    return (
      <>
        <BackLink />
        <div className="text-tertiary">Lade…</div>
      </>
    );
  }

  return (
    <>
      <BackLink />
      <MeasuringPointTitle mp={mp} onRenamed={(updated) => setMp(updated)} />

      <StammdatenCard
        mp={mp}
        locations={locations}
        location={location}
        onMapOpen={() => setMapOpen(true)}
        onUpdated={(updated) => setMp(updated)}
      />

      <PhysicalMetersCard mp={mp} onChanged={refresh} />

      <OwnerHistoryCard mp={mp} onChanged={refresh} />

      <ConsumptionChart consumption={consumption} mp={mp} />

      <RegisterTable mp={mp} states={states} onChanged={refresh} />

      <div className="grid gap-4 md:grid-cols-2">
        <QrCodeCard mp={mp} />
        <MpAccessCard mpId={mp.id} />
      </div>

      {location && location.latitude !== null && location.longitude !== null ? (
        <LocationMapSheet
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          latitude={location.latitude}
          longitude={location.longitude}
          name={location.name}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Title (mit Name-Edit via Pencil)
// ---------------------------------------------------------------------------

function MeasuringPointTitle({
  mp,
  onRenamed,
}: {
  mp: MeasuringPointRead;
  onRenamed: (updated: MeasuringPointRead) => void;
}) {
  const { me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(mp.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setName(mp.name);
    setError(null);
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
    setError(null);
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || trimmed === mp.name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.patch<MeasuringPointRead>(`/measuring-points/${mp.id}`, {
        name: trimmed,
      });
      onRenamed(updated);
      setEditing(false);
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-3">
      <TypeBadge type={mp.type} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="text-caption-bold uppercase text-tertiary">Messstelle</div>
        {editing ? (
          <form onSubmit={(e) => void save(e)} className="mt-1 space-y-2">
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              maxLength={120}
              error={error}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="filled" size="sm" disabled={busy}>
                {busy ? 'Speichere…' : 'Speichern'}
              </Button>
              <Button type="button" variant="bordered" size="sm" onClick={cancel} disabled={busy}>
                Abbrechen
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <LargeTitle title={mp.name} />
            {isAdmin ? (
              <button
                type="button"
                onClick={startEdit}
                className="rounded-full bg-fill p-2 text-tertiary transition-colors hover:bg-fill-strong hover:text-label"
                aria-label="Namen bearbeiten"
                title="Namen bearbeiten"
              >
                <Pencil size={14} />
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stammdaten (Card mit Bearbeiten-Knopf)
// ---------------------------------------------------------------------------

/**
 * Stammdaten der Messstelle. Default zeigt eine Read-Only-Kacheltafel,
 * der "Bearbeiten"-Knopf oben rechts schaltet die ganze Card in einen
 * Form-Modus (zentral pro Card, nicht pro Feld).
 *
 * Editierbare Felder: Standort, Doppeltarif, Bidirektional, Wandlerfaktor
 * (Strom), Tankvolumen (Heizung). Typ ist fundamental und bleibt
 * read-only — wer den Typ ändern will, legt eine neue Messstelle an.
 */
function StammdatenCard({
  mp,
  locations,
  location,
  onMapOpen,
  onUpdated,
}: {
  mp: MeasuringPointRead;
  locations: LocationRead[];
  location: LocationRead | null;
  onMapOpen: () => void;
  onUpdated: (updated: MeasuringPointRead) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="text-caption-bold uppercase text-tertiary">Stammdaten</div>
        {!editing ? (
          <Button
            type="button"
            variant="bordered"
            size="sm"
            leftIcon={<Pencil size={14} />}
            onClick={() => setEditing(true)}
          >
            Bearbeiten
          </Button>
        ) : null}
      </div>

      {editing ? (
        <StammdatenEditForm
          mp={mp}
          locations={locations}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            onUpdated(updated);
            setEditing(false);
          }}
        />
      ) : (
        <StammdatenReadView mp={mp} location={location} onMapOpen={onMapOpen} />
      )}
    </Card>
  );
}

function StammdatenReadView({
  mp,
  location,
  onMapOpen,
}: {
  mp: MeasuringPointRead;
  location: LocationRead | null;
  onMapOpen: () => void;
}) {
  const activeMeter = mp.physical_meters.find((m) => m.removed_at === null);
  return (
    <div className="mt-3 grid grid-cols-2 gap-4">
      <FieldRow k="Typ" v={describeMeterType(mp.type, mp.heating_source)} />
      <FieldRow
        k="Standort"
        v={
          mp.location_name ? (
            location && location.latitude !== null && location.longitude !== null ? (
              <button
                type="button"
                onClick={onMapOpen}
                className="hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-pill bg-primary-soft px-2 py-0.5 font-semibold text-primary-deep transition-colors"
              >
                <MapIcon size={14} />
                {mp.location_name}
              </button>
            ) : (
              <Link
                to="/admin/standorte"
                className="font-semibold text-primary-deep underline-offset-2 hover:underline"
              >
                {mp.location_name}
              </Link>
            )
          ) : (
            '—'
          )
        }
      />
      {mp.type === 'electricity' ? (
        <>
          <FieldRow k="Doppeltarif" v={mp.has_dual_tariff ? 'Ja' : 'Nein'} />
          <FieldRow k="Bidirektional" v={mp.is_bidirectional ? 'Ja' : 'Nein'} />
          <FieldRow
            k="Wandlerfaktor"
            v={mp.transformer_factor !== null ? `×${mp.transformer_factor}` : '—'}
          />
        </>
      ) : null}
      {(mp.type === 'electricity' || mp.type === 'water') && mp.contract_number ? (
        <FieldRow k="Vertragsnummer" v={mp.contract_number} />
      ) : null}
      {mp.type === 'electricity' && mp.market_location ? (
        <FieldRow k="Marktlokation" v={mp.market_location} />
      ) : null}
      {mp.installation_location ? <FieldRow k="Einbauort" v={mp.installation_location} /> : null}
      <FieldRow k="Aktueller Eigentümer" v={mp.current_owner_name ?? '—'} />
      {mp.kostenstelle !== null ? <FieldRow k="Kostenstelle" v={String(mp.kostenstelle)} /> : null}
      {location &&
      (location.address_street || location.address_postcode || location.address_city) ? (
        <FieldRow
          k="Adresse"
          v={[
            location.address_street,
            [location.address_postcode, location.address_city].filter(Boolean).join(' '),
          ]
            .filter((s) => s && s.trim())
            .join(', ')}
        />
      ) : null}
      {mp.type === 'heating' && mp.tank_capacity ? (
        <FieldRow
          k="Tankvolumen"
          v={
            <span className="num">
              {formatDe(mp.tank_capacity)} <span className="text-tertiary">L</span>
            </span>
          }
        />
      ) : null}
      <FieldRow k="Aktive Register" v={String(activeMeter?.registers.length ?? 0)} />
      <FieldRow k="Physische Zähler" v={String(mp.physical_meters.length)} />
    </div>
  );
}

function StammdatenEditForm({
  mp,
  locations,
  onCancel,
  onSaved,
}: {
  mp: MeasuringPointRead;
  locations: LocationRead[];
  onCancel: () => void;
  onSaved: (updated: MeasuringPointRead) => void;
}) {
  const [locationId, setLocationId] = useState<number | null>(mp.location_id);
  const [bidi, setBidi] = useState(mp.is_bidirectional);
  const [dual, setDual] = useState(mp.has_dual_tariff);
  const [tankCapacity, setTankCapacity] = useState(
    mp.tank_capacity ? String(mp.tank_capacity).replace('.', ',') : '',
  );
  const [transformerFactor, setTransformerFactor] = useState(
    mp.transformer_factor !== null ? String(mp.transformer_factor) : '',
  );
  const [contractNumber, setContractNumber] = useState(mp.contract_number ?? '');
  const [marketLocation, setMarketLocation] = useState(mp.market_location ?? '');
  const [installationLocation, setInstallationLocation] = useState(mp.installation_location ?? '');
  const [kostenstelle, setKostenstelle] = useState(
    mp.kostenstelle !== null ? String(mp.kostenstelle) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        location_id: locationId,
        clear_location: locationId === null,
        is_bidirectional: bidi,
        has_dual_tariff: dual,
      };
      // Fernwärme hat keinen Tank -> Feld ausgeblendet, also nicht senden.
      if (mp.type === 'heating' && mp.heating_source !== 'district_heat') {
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
      // Vertragsnummer: leer + vorher gesetzt → clear; sonst direkt schicken.
      // Backend ignoriert das Feld fuer Typen, die es nicht erlauben — aber
      // wir senden's ohnehin nur, wenn der Typ es zulaesst (electricity/water).
      if (mp.type === 'electricity' || mp.type === 'water') {
        const trimmed = contractNumber.trim();
        if (trimmed === '') {
          if (mp.contract_number !== null) body['clear_contract_number'] = true;
        } else if (trimmed !== mp.contract_number) {
          body['contract_number'] = trimmed;
        }
      }
      if (mp.type === 'electricity') {
        const trimmed = marketLocation.trim();
        if (trimmed === '') {
          if (mp.market_location !== null) body['clear_market_location'] = true;
        } else if (trimmed !== mp.market_location) {
          body['market_location'] = trimmed;
        }
      }
      // Einbauort fuer alle Typen, ``clear_*`` bei leerer Eingabe.
      {
        const trimmed = installationLocation.trim();
        if (trimmed === '') {
          if (mp.installation_location !== null) body['clear_installation_location'] = true;
        } else if (trimmed !== mp.installation_location) {
          body['installation_location'] = trimmed;
        }
      }
      // Kostenstelle (Ganzzahl 0-99999) fuer alle Typen, clear_* bei leerer Eingabe.
      {
        const trimmed = kostenstelle.trim();
        if (trimmed === '') {
          if (mp.kostenstelle !== null) body['clear_kostenstelle'] = true;
        } else {
          const parsed = Number(trimmed);
          if (!Number.isInteger(parsed) || parsed < 0 || parsed > 99999) {
            throw new RangeError('Kostenstelle muss eine Ganzzahl zwischen 0 und 99999 sein.');
          }
          if (parsed !== mp.kostenstelle) body['kostenstelle'] = parsed;
        }
      }
      const updated = await api.patch<MeasuringPointRead>(`/measuring-points/${mp.id}`, body);
      onSaved(updated);
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof RangeError) setError(err.message);
      else setError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-3 space-y-3">
      {/* Typ ist read-only — fundamental für die MP, Wechsel nicht supported. */}
      <div className="text-caption text-tertiary">
        Typ:{' '}
        <span className="font-semibold text-label">
          {describeMeterType(mp.type, mp.heating_source)}
        </span>
      </div>
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
          <TextField
            label="Vertragsnummer (optional)"
            value={contractNumber}
            onChange={(e) => setContractNumber(e.target.value)}
            hint="leer = nicht gesetzt"
          />
          <TextField
            label="Marktlokation / MaLo-ID (optional)"
            value={marketLocation}
            onChange={(e) => setMarketLocation(e.target.value)}
            hint="11-stellige Ziffernfolge; leer = nicht gesetzt"
            inputMode="numeric"
            pattern="\d{11}"
            maxLength={11}
          />
        </>
      ) : null}
      {mp.type === 'water' ? (
        <TextField
          label="Vertragsnummer (optional)"
          value={contractNumber}
          onChange={(e) => setContractNumber(e.target.value)}
          hint="leer = nicht gesetzt"
        />
      ) : null}
      {mp.type === 'heating' && mp.heating_source !== 'district_heat' ? (
        <TextField
          label="Tankvolumen / Vorratsmenge (optional)"
          inputMode="decimal"
          value={tankCapacity}
          onChange={(e) => setTankCapacity(e.target.value)}
          hint="leer = nicht gesetzt; wird für die Prozent-Anzeige des Vorrats genutzt"
          numeric
        />
      ) : null}
      <TextField
        label="Einbauort (optional)"
        value={installationLocation}
        onChange={(e) => setInstallationLocation(e.target.value)}
        hint="z. B. 1. Stock, Wohnung 4b — leer = nicht gesetzt"
      />
      <TextField
        label="Kostenstelle (optional)"
        inputMode="numeric"
        value={kostenstelle}
        onChange={(e) => setKostenstelle(e.target.value.replace(/\D/g, '').slice(0, 5))}
        hint="5-stellige Zahl (0–99999); leer = nicht gesetzt"
      />
      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger">
          {error}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Speichern'}
        </Button>
        <Button type="button" variant="bordered" onClick={onCancel} disabled={busy}>
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

// ---------------------------------------------------------------------------
// Physische Zähler (alle Zähler, Edit pro Zähler, Tauschen-Sheet)
// ---------------------------------------------------------------------------

/**
 * Card mit allen physischen Zählern dieser Messstelle.
 *
 * - Aktive Zähler oben (mit "aktiv"-Badge), ausgebaute darunter.
 * - Pro Zähler ein "Bearbeiten"-Knopf für Seriennummer/installed_at/removed_at.
 * - "Zähler tauschen"-CTA im Card-Header öffnet die ReplaceMeterForm im Sheet.
 *   Tausch-CTA nur sichtbar, wenn ein aktiver Zähler existiert (sonst gibt es
 *   nichts zu tauschen).
 */
function PhysicalMetersCard({ mp, onChanged }: { mp: MeasuringPointRead; onChanged: () => void }) {
  const [replaceOpen, setReplaceOpen] = useState(false);
  const sortedMeters = useMemo(() => {
    return [...mp.physical_meters].sort((a, b) => {
      // Aktive Zähler (removed_at === null) zuerst, dann nach installed_at desc.
      if (a.removed_at === null && b.removed_at !== null) return -1;
      if (a.removed_at !== null && b.removed_at === null) return 1;
      return b.installed_at.localeCompare(a.installed_at);
    });
  }, [mp.physical_meters]);
  const hasActive = sortedMeters.some((m) => m.removed_at === null);

  return (
    <Section
      header={
        <div className="flex items-center justify-between gap-2">
          <span>Physische Zähler</span>
          {hasActive ? (
            <Button
              type="button"
              variant="bordered"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => setReplaceOpen(true)}
            >
              Zähler tauschen
            </Button>
          ) : null}
        </div>
      }
    >
      {sortedMeters.length === 0 ? (
        <div className="p-5 text-caption text-tertiary">Keine physischen Zähler.</div>
      ) : (
        <ul className="divide-y divide-separator">
          {sortedMeters.map((meter) => (
            <li key={meter.id} className="px-5 py-4">
              <PhysicalMeterRow meter={meter} onChanged={onChanged} />
            </li>
          ))}
        </ul>
      )}

      <Sheet open={replaceOpen} onClose={() => setReplaceOpen(false)} title="Zähler tauschen">
        <ReplaceMeterForm
          mp={mp}
          onClose={() => setReplaceOpen(false)}
          onReplaced={() => {
            setReplaceOpen(false);
            onChanged();
          }}
        />
      </Sheet>
    </Section>
  );
}

function PhysicalMeterRow({
  meter,
  onChanged,
}: {
  meter: PhysicalMeterRead;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const isActive = meter.removed_at === null;

  if (editing) {
    return (
      <PhysicalMeterEditForm
        meter={meter}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="num text-headline tracking-tight text-label">
            SN {meter.serial_number}
          </span>
          {isActive ? (
            <span className="bg-success/15 rounded-full px-2 py-0.5 text-caption font-semibold text-success">
              aktiv
            </span>
          ) : (
            <span className="rounded-full bg-fill px-2 py-0.5 text-caption font-semibold text-tertiary">
              ausgebaut
            </span>
          )}
        </div>
        <div className="num mt-0.5 text-caption text-tertiary">
          {meter.installed_at} – {meter.removed_at ?? 'aktiv'}
          <span className="ml-2 text-quaternary">
            · {meter.registers.length} {meter.registers.length === 1 ? 'Register' : 'Register'}
          </span>
        </div>
      </div>
      <Button
        type="button"
        variant="plain"
        size="sm"
        leftIcon={<Pencil size={14} />}
        onClick={() => setEditing(true)}
      >
        Bearbeiten
      </Button>
    </div>
  );
}

function PhysicalMeterEditForm({
  meter,
  onCancel,
  onSaved,
}: {
  meter: PhysicalMeterRead;
  onCancel: () => void;
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
      else setError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
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
      />
      {error ? (
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger">
          {error}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" size="sm" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Speichern'}
        </Button>
        <Button
          type="button"
          variant="bordered"
          size="sm"
          onClick={onCancel}
          disabled={busy}
          leftIcon={<X size={14} />}
        >
          Abbrechen
        </Button>
      </div>
    </form>
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

// ---------------------------------------------------------------------------
// Helpers + read-only Inhalte (Title-BackLink, Verbrauchskurve, Register-Tabelle)
// ---------------------------------------------------------------------------

function BackLink() {
  return (
    <Link
      to="/admin/messstellen"
      className="inline-flex items-center gap-1 text-caption font-semibold text-primary-deep transition-colors hover:text-primary"
    >
      <ArrowLeft size={14} />
      Messstellen
    </Link>
  );
}

function FieldRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-caption text-tertiary">{k}</div>
      <div className="mt-0.5 text-body font-semibold text-label">{v}</div>
    </div>
  );
}

function ConsumptionChart({
  consumption,
  mp,
}: {
  consumption: ConsumptionPoint[];
  mp: MeasuringPointRead;
}) {
  const theme = useChartTheme();

  // Alle Hooks vor dem early return - Rules of Hooks.
  // Pro period_end ein Punkt mit allen OBIS-Codes daneben.
  const { series, obisCodes } = useMemo(() => {
    const merged = new Map<string, Record<string, number | string>>();
    for (const p of consumption) {
      const row = merged.get(p.period_end) ?? { date: p.period_end };
      row[p.obis_code] = Number(p.consumption);
      merged.set(p.period_end, row);
    }
    const sorted = Array.from(merged.values()).sort((a, b) =>
      String(a['date']).localeCompare(String(b['date'])),
    );
    const codes = Array.from(new Set(consumption.map((p) => p.obis_code)));
    return { series: sorted, obisCodes: codes };
  }, [consumption]);
  const unit = consumption[0]?.unit ?? '';

  const labelByObis = useMemo(() => {
    const m = new Map<string, string>();
    for (const meter of mp.physical_meters) {
      for (const r of meter.registers) {
        if (!m.has(r.obis_code)) m.set(r.obis_code, r.label);
      }
    }
    return m;
  }, [mp.physical_meters]);

  // Stabile Recharts-Props (siehe DashboardPage für Begründung).
  const tooltipContentStyle = useMemo(
    () => ({
      backgroundColor: theme.tooltipBg,
      border: `1px solid ${theme.tooltipBorder}`,
      borderRadius: 12,
      color: theme.label,
    }),
    [theme],
  );
  const tooltipLabelStyle = useMemo(() => ({ color: theme.label }), [theme.label]);
  const legendWrapperStyle = useMemo(() => ({ fontSize: 12, color: theme.label }), [theme.label]);
  const tooltipFormatter = useCallback(
    (value: number | string, name: string) => [
      `${formatDe(value as number)}${unit ? ' ' + unit : ''}`,
      labelByObis.get(String(name)) ?? String(name),
    ],
    [unit, labelByObis],
  );
  const legendFormatter = useCallback(
    (name: string) => labelByObis.get(String(name)) ?? String(name),
    [labelByObis],
  );

  if (consumption.length === 0) {
    return (
      <Section header="Verbrauchskurve">
        <div className="p-5 text-caption text-tertiary">
          Noch keine Verbrauchsdaten — mindestens zwei Erfassungen pro Register werden benötigt.
        </div>
      </Section>
    );
  }

  const total = consumption.reduce((acc, p) => acc + Number(p.consumption), 0);
  const avg = consumption.length > 0 ? total / consumption.length : 0;

  return (
    <Section header={`Verbrauchskurve · ${consumption.length} Punkte`}>
      <div className="p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <div className="num text-headline text-label">
              {formatDe(total)} <span className="text-tertiary">{unit} gesamt</span>
            </div>
            <div className="num text-caption text-tertiary">
              ⌀ {formatDe(avg)} {unit} pro Periode
            </div>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={CHART_MARGIN}>
              <defs>
                {obisCodes.map((code, idx) => (
                  <linearGradient
                    id={`mpd-grad-${code}`}
                    key={`grad-${code}-${idx}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={theme.palette[idx % theme.palette.length]}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="100%"
                      stopColor={theme.palette[idx % theme.palette.length]}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: theme.axis }}
                stroke={theme.axis}
                tickFormatter={formatDateTickDe}
              />
              <YAxis
                tick={{ fontSize: 11, fill: theme.axis }}
                stroke={theme.axis}
                tickFormatter={(v) => formatDe(v as number)}
              />
              <Tooltip
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle}
                formatter={tooltipFormatter}
                labelFormatter={formatDateTickDe}
              />
              <Legend formatter={legendFormatter} wrapperStyle={legendWrapperStyle} />
              {obisCodes.map((code, idx) => (
                <Area
                  key={code}
                  type="monotone"
                  dataKey={code}
                  name={code}
                  stroke={theme.palette[idx % theme.palette.length]}
                  fill={`url(#mpd-grad-${code})`}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}

/**
 * Read-only-Liste aller Register dieser Messstelle, plus zwei
 * Edit-Triggers:
 *
 * - Pro Register mit ``accepts_deliveries=true`` (Heizoel-Tank,
 *   Holzvorrat, ...) ein "Befüllungen"-Knopf, der das ``DeliveriesSheet``
 *   öffnet.
 * - Für Heizung: ein "Bearbeiten"-Knopf im Section-Header, der den
 *   ``HeatingRegisterEditor`` für den aktiven Zähler zeigt
 *   (Add/Remove Register).
 *
 * Edit-Modus ist nur für Heizung sinnvoll; Strom/Wasser haben fixe
 * OBIS-Register, die nicht verändert werden.
 */
function RegisterTable({
  mp,
  states,
  onChanged,
}: {
  mp: MeasuringPointRead;
  states: RegisterStateRead[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deliveriesFor, setDeliveriesFor] = useState<RegisterRead | null>(null);

  const activeMeter = useMemo(
    () => mp.physical_meters.find((m) => m.removed_at === null) ?? null,
    [mp.physical_meters],
  );
  const isHeating = mp.type === 'heating';
  const canEditRegisters = isHeating && activeMeter !== null;

  const stateByRegister = new Map(states.map((s) => [s.register_id, s]));
  const allRegisters = mp.physical_meters
    .flatMap((meter) =>
      meter.registers.map((r) => ({
        register: r,
        meterSerial: meter.serial_number,
        meterRemovedAt: meter.removed_at,
      })),
    )
    .sort((a, b) => a.register.obis_code.localeCompare(b.register.obis_code));

  return (
    <Section
      header={
        <div className="flex items-center justify-between gap-2">
          <span>Register</span>
          {canEditRegisters && !editing ? (
            <Button
              type="button"
              variant="bordered"
              size="sm"
              leftIcon={<Pencil size={14} />}
              onClick={() => setEditing(true)}
            >
              Bearbeiten
            </Button>
          ) : null}
        </div>
      }
    >
      {editing && activeMeter ? (
        <div className="p-5">
          <HeatingRegisterEditor
            meter={activeMeter}
            onClose={() => setEditing(false)}
            onChanged={onChanged}
            allowDeliveries={mp.heating_source !== 'district_heat'}
          />
        </div>
      ) : allRegisters.length === 0 ? (
        <EmptyState title="Keine Register" />
      ) : (
        <ul className="divide-y divide-separator">
          {allRegisters.map(({ register, meterSerial, meterRemovedAt }) => {
            const state = stateByRegister.get(register.id);
            // Vier Info-Zellen — identisch für klickbare wie Lieferungs-Zeilen.
            const cells = (
              <>
                <div>
                  <code className="num inline-block rounded-badge bg-primary-soft px-2 py-1 text-caption font-semibold text-primary-deep">
                    {register.obis_code}
                  </code>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-body font-semibold text-label">
                    {register.label}
                  </div>
                  <div className="num truncate text-caption text-tertiary">
                    SN {meterSerial}
                    {meterRemovedAt ? ` · entfernt ${meterRemovedAt}` : ''}
                    {!register.is_active ? ' · inaktiv' : ''}
                  </div>
                </div>
                <div>
                  {state?.current_value !== null && state?.current_value !== undefined ? (
                    <div className="num text-headline text-label">
                      {formatDe(state.current_value)}{' '}
                      <span className="text-caption text-tertiary">{register.unit}</span>
                    </div>
                  ) : (
                    <div className="text-caption text-tertiary">noch keine Erfassung</div>
                  )}
                </div>
                <div className="num text-caption text-tertiary">
                  {state?.last_reading_at ? formatDateTimeDe(state.last_reading_at) : '—'}
                </div>
              </>
            );
            const gridClass = cx(
              'grid grid-cols-1 gap-2 px-5 py-4',
              'md:grid-cols-[110px_1.4fr_1fr_1fr_auto] md:items-center md:gap-4',
            );
            // Lieferungs-Register (Tank/Vorrat): „Befüllungen"-Knopf, Zeile
            // selbst nicht verlinkt (keine geschachtelten Interaktiven).
            if (register.accepts_deliveries) {
              return (
                <li key={register.id} className={gridClass}>
                  {cells}
                  <Button
                    type="button"
                    variant="plain"
                    size="sm"
                    leftIcon={<Droplet size={14} />}
                    onClick={() => setDeliveriesFor(register)}
                  >
                    Befüllungen
                  </Button>
                </li>
              );
            }
            // Normale Register: ganze Zeile verlinkt auf die gefilterten
            // Erfassungen genau dieses Registers (Messstelle + OBIS-Code).
            return (
              <li key={register.id}>
                <Link
                  to={`/erfassungen?mp=${mp.id}&obis=${encodeURIComponent(register.obis_code)}`}
                  aria-label={`Messungen zu Register ${register.obis_code}`}
                  className={cx(gridClass, 'hover:bg-fill/40 transition-colors')}
                >
                  {cells}
                  <ChevronRight size={16} className="hidden text-tertiary md:block" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {deliveriesFor ? (
        <DeliveriesSheet
          open={true}
          onClose={() => setDeliveriesFor(null)}
          register={deliveriesFor}
        />
      ) : null}
    </Section>
  );
}

/**
 * Heizungs-Register-Editor für den aktiven Zähler. Listet alle Register
 * mit Lösch-Knopf und bietet ein "Register hinzufügen"-Formular.
 *
 * 1:1 von der alten ``MeasuringPointsAdminPage`` übernommen — Backend-
 * Endpoints (`POST /physical-meters/{id}/registers`,
 * `DELETE /registers/{id}`) sind unverändert.
 */
function HeatingRegisterEditor({
  meter,
  onClose,
  onChanged,
  allowDeliveries = true,
}: {
  meter: PhysicalMeterRead;
  onClose: () => void;
  onChanged: () => void;
  allowDeliveries?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    label: '',
    unit: 'kWh' as HeatingUnit,
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-caption-bold uppercase text-tertiary">
          Register am aktiven Zähler verwalten
        </div>
        <Button
          type="button"
          variant="plain"
          size="sm"
          leftIcon={<X size={14} />}
          onClick={onClose}
        >
          Schließen
        </Button>
      </div>
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
          {allowDeliveries ? (
            <ToggleRow
              label="Nachfüllbar (Lieferungen)"
              checked={draft.accepts_deliveries}
              onChange={(v) => setDraft((d) => ({ ...d, accepts_deliveries: v }))}
            />
          ) : null}
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

// ---------------------------------------------------------------------------
// Eigentuemer-Historie + Wechsel
// ---------------------------------------------------------------------------

/** Listet alle ``OwnerAssignment``-Perioden absteigend. Aktive Periode oben
 *  mit ``aktiv``-Badge. Button „Eigentümer wechseln" oeffnet ChangeOwnerSheet. */
function OwnerHistoryCard({ mp, onChanged }: { mp: MeasuringPointRead; onChanged: () => void }) {
  const [history, setHistory] = useState<OwnerAssignmentRead[]>([]);
  const [owners, setOwners] = useState<OwnerRead[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api
      .get<OwnerAssignmentRead[]>(`/measuring-points/${mp.id}/owners`)
      .then(setHistory)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
    api
      .get<OwnerRead[]>('/owners')
      .then(setOwners)
      .catch(() => {
        /* Dropdown bleibt leer */
      });
  }, [mp.id, tick]);

  return (
    <Section
      header={
        <div className="flex items-center justify-between gap-2">
          <span>Eigentümer-Historie</span>
          <Button
            variant="bordered"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={owners.length === 0}
          >
            Eigentümer wechseln
          </Button>
        </div>
      }
    >
      <div className="space-y-2 p-5">
        {error ? (
          <div className="text-caption text-danger">{error}</div>
        ) : history.length === 0 ? (
          <div className="text-caption text-tertiary">Noch keine Eigentümer-Zuordnung.</div>
        ) : (
          history.map((a) => {
            const active = a.valid_to === null;
            return (
              <div
                key={a.id}
                className="bg-fill/40 flex items-center justify-between rounded-pill border-hairline border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-body-sm font-semibold text-label">
                    {a.owner_name ?? <em className="text-tertiary">unbekannt</em>}
                  </div>
                  <div className="text-caption text-tertiary">
                    ab {formatDateDe(a.valid_from)}
                    {a.valid_to ? ` bis ${formatDateDe(a.valid_to)}` : ''}
                  </div>
                </div>
                {active ? (
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary-deep">
                    aktiv
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Eigentümer wechseln">
        <ChangeOwnerForm
          mpId={mp.id}
          owners={owners}
          onSaved={() => {
            setOpen(false);
            setTick((t) => t + 1);
            onChanged();
          }}
          onCancel={() => setOpen(false)}
        />
      </Sheet>
    </Section>
  );
}

function ChangeOwnerForm({
  mpId,
  owners,
  onSaved,
  onCancel,
}: {
  mpId: number;
  owners: OwnerRead[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [ownerId, setOwnerId] = useState<number | ''>('');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ownerId === '') {
      setError('Bitte einen Eigentümer wählen.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post(`/measuring-points/${mpId}/change-owner`, {
        owner_id: ownerId,
        valid_from: validFrom,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Wechsel fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
      <Select
        label="Neuer Eigentümer"
        value={ownerId}
        onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : '')}
        required
      >
        <option value="">— bitte wählen —</option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
      <TextField
        label="Wechsel zum"
        type="date"
        value={validFrom}
        onChange={(e) => setValidFrom(e.target.value)}
        required
      />
      {error ? <div className="text-caption text-danger">{error}</div> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Wechseln'}
        </Button>
        <Button type="button" variant="bordered" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
