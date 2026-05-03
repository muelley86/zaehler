import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Crosshair, Map as MapIcon, MapPin, Pencil, Trash2 } from 'lucide-react';

import { Button, Card, EmptyState, LargeTitle, Section, Sheet, TextField } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { LocationMap } from '@/components/LocationMap';
import { LocationMapSheet } from '@/components/LocationMapSheet';
import { ApiError, api } from '@/lib/api';
import type { LocationRead, MeasuringPointRead } from '@/lib/types';

// Default-Karten-Zentrum (Kassel, Mitte Deutschland) wenn der User noch
// keine Koordinaten hat und auf "Auf Karte wählen" klickt.
const DEFAULT_LAT = 51.16;
const DEFAULT_LNG = 10.45;

export function LocationsAdminPage() {
  const [locations, setLocations] = useState<LocationRead[] | null>(null);
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<LocationRead | null>(null);
  const [mapTarget, setMapTarget] = useState<LocationRead | null>(null);

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
              onShowMap={() => setMapTarget(loc)}
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

      {mapTarget && mapTarget.latitude !== null && mapTarget.longitude !== null ? (
        <LocationMapSheet
          open
          onClose={() => setMapTarget(null)}
          latitude={mapTarget.latitude}
          longitude={mapTarget.longitude}
          name={mapTarget.name}
        />
      ) : null}
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
  onShowMap,
  onChanged,
}: {
  loc: LocationRead;
  mpCount: number;
  onEdit: () => void;
  onShowMap: () => void;
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

  const hasGeo = loc.latitude !== null && loc.longitude !== null;

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

      {hasGeo && loc.latitude !== null && loc.longitude !== null ? (
        <button
          type="button"
          onClick={onShowMap}
          className="mt-2 flex w-full items-center gap-2 rounded-pill border-hairline border-border bg-fill px-3 py-2 text-left text-caption transition-colors hover:bg-fill-strong"
          aria-label={`${loc.name} auf Karte zeigen`}
        >
          <MapIcon size={14} className="shrink-0 text-primary-deep" />
          <span className="num text-secondary">
            {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
          </span>
          <span className="ml-auto text-caption font-semibold text-primary-deep">Karte ↗</span>
        </button>
      ) : null}

      {error ? (
        <div className="border-danger/40 bg-danger/10 mt-3 rounded-pill border-hairline p-2 text-caption text-danger">
          {error}
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Geo-Picker — gemeinsame Komponente für Create und Edit
// ---------------------------------------------------------------------------

interface GeoPickerProps {
  latitude: string;
  longitude: string;
  onLatitudeChange: (v: string) => void;
  onLongitudeChange: (v: string) => void;
}

function GeoPicker({ latitude, longitude, onLatitudeChange, onLongitudeChange }: GeoPickerProps) {
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  function fetchGps() {
    setGpsError(null);
    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation-API in diesem Browser nicht verfügbar.');
      return;
    }
    if (!window.isSecureContext) {
      setGpsError('GPS nur über HTTPS oder localhost — bitte „Auf Karte wählen" nutzen.');
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLatitudeChange(pos.coords.latitude.toFixed(6));
        onLongitudeChange(pos.coords.longitude.toFixed(6));
        setGpsBusy(false);
      },
      (err) => {
        const detail =
          err.code === err.PERMISSION_DENIED
            ? 'Berechtigung verweigert.'
            : err.code === err.POSITION_UNAVAILABLE
              ? 'Position nicht verfügbar.'
              : err.code === err.TIMEOUT
                ? 'Zeitüberschreitung.'
                : err.message;
        setGpsError(`GPS-Fehler: ${detail}`);
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  const parsedLat = Number.parseFloat(latitude);
  const parsedLng = Number.parseFloat(longitude);
  const initialLat = Number.isFinite(parsedLat) ? parsedLat : DEFAULT_LAT;
  const initialLng = Number.isFinite(parsedLng) ? parsedLng : DEFAULT_LNG;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Latitude"
          numeric
          inputMode="decimal"
          placeholder="z. B. 48.137154"
          value={latitude}
          onChange={(e) => onLatitudeChange(e.target.value)}
        />
        <TextField
          label="Longitude"
          numeric
          inputMode="decimal"
          placeholder="z. B. 11.575492"
          value={longitude}
          onChange={(e) => onLongitudeChange(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="bordered"
          size="sm"
          leftIcon={<Crosshair size={14} />}
          onClick={fetchGps}
          disabled={gpsBusy}
          fullWidth
        >
          {gpsBusy ? 'GPS …' : 'Aktuelle Position'}
        </Button>
        <Button
          type="button"
          variant="bordered"
          size="sm"
          leftIcon={<MapIcon size={14} />}
          onClick={() => setPickerOpen(true)}
          fullWidth
        >
          Auf Karte wählen
        </Button>
      </div>
      {gpsError ? <div className="text-caption text-danger">{gpsError}</div> : null}

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Position wählen">
        <MapPicker
          initialLatitude={initialLat}
          initialLongitude={initialLng}
          onConfirm={(lat, lng) => {
            onLatitudeChange(lat.toFixed(6));
            onLongitudeChange(lng.toFixed(6));
            setPickerOpen(false);
          }}
          onCancel={() => setPickerOpen(false)}
        />
      </Sheet>
    </div>
  );
}

interface NominatimHit {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

function MapPicker({
  initialLatitude,
  initialLongitude,
  onConfirm,
  onCancel,
}: {
  initialLatitude: number;
  initialLongitude: number;
  onConfirm: (lat: number, lng: number) => void;
  onCancel: () => void;
}) {
  const [lat, setLat] = useState(initialLatitude);
  const [lng, setLng] = useState(initialLongitude);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<NominatimHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      const url =
        'https://nominatim.openstreetmap.org/search' +
        `?format=jsonv2&limit=5&addressdetails=0&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { 'Accept-Language': 'de' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as NominatimHit[];
      setHits(data);
      if (data.length === 0) setSearchError('Keine Treffer.');
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Suche fehlgeschlagen.');
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  function pickHit(hit: NominatimHit) {
    const la = Number.parseFloat(hit.lat);
    const ln = Number.parseFloat(hit.lon);
    if (Number.isFinite(la) && Number.isFinite(ln)) {
      setLat(la);
      setLng(ln);
      setHits([]);
      setQuery(hit.display_name.split(',')[0] ?? '');
    }
  }

  // Suchfeld → optional Trefferliste → Karte → Koord-Zeile → Buttons.
  // Höhen sind so dimensioniert, dass alles in 90vh-Sheet auf iPhone-SE
  // ohne Scrollen Platz findet.
  return (
    <div className="space-y-2">
      {/* KEIN <form> hier — wir sind innerhalb der Edit-/Create-Form, und
          nested forms sind HTML-invalide (Browser flacht sie ab → der Submit
          würde die äußere Form abschicken und das Sheet schließen). Stattdessen
          Suche per Button-Click + Enter-Listener am Eingabefeld. */}
      <div className="flex gap-2">
        <TextField
          type="text"
          placeholder="Adresse oder Ortsname suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void search();
            }
          }}
          className="flex-1"
        />
        <Button type="button" variant="bordered" disabled={searching} onClick={() => void search()}>
          {searching ? '…' : 'Suchen'}
        </Button>
      </div>

      {hits.length > 0 ? (
        <ul className="max-h-[140px] overflow-y-auto rounded-card border-hairline border-border bg-surface-solid">
          {hits.map((hit) => (
            <li key={hit.place_id} className="border-b-hairline border-separator last:border-b-0">
              <button
                type="button"
                onClick={() => pickHit(hit)}
                className="w-full px-3 py-2 text-left transition-colors hover:bg-fill"
              >
                <div className="truncate text-body-sm text-label">{hit.display_name}</div>
                <div className="num truncate text-caption text-tertiary">
                  {Number.parseFloat(hit.lat).toFixed(4)}, {Number.parseFloat(hit.lon).toFixed(4)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {searchError ? <div className="text-caption text-tertiary">{searchError}</div> : null}

      <LocationMap
        latitude={lat}
        longitude={lng}
        height={200}
        interactive
        onChange={(la, ln) => {
          setLat(la);
          setLng(ln);
        }}
      />

      <div className="num text-center text-caption text-tertiary">
        {lat.toFixed(6)}, {lng.toFixed(6)}
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="bordered" onClick={onCancel} fullWidth>
          Abbrechen
        </Button>
        <Button type="button" variant="filled" onClick={() => onConfirm(lat, lng)} fullWidth>
          Position übernehmen
        </Button>
      </div>

      <div className="text-center text-[10px] text-quaternary">
        Suche via{' '}
        <a
          href="https://nominatim.openstreetmap.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          OpenStreetMap Nominatim
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation-Helper
// ---------------------------------------------------------------------------

function parseGeo(
  latitudeStr: string,
  longitudeStr: string,
): { lat: number | null; lng: number | null; error: string | null } {
  const latTrim = latitudeStr.trim();
  const lngTrim = longitudeStr.trim();
  if (!latTrim && !lngTrim) return { lat: null, lng: null, error: null };
  if (!latTrim || !lngTrim) {
    return {
      lat: null,
      lng: null,
      error: 'Latitude und Longitude beide angeben oder beide leer lassen.',
    };
  }
  const lat = Number.parseFloat(latTrim.replace(',', '.'));
  const lng = Number.parseFloat(lngTrim.replace(',', '.'));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { lat: null, lng: null, error: 'Latitude muss zwischen -90 und 90 liegen.' };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { lat: null, lng: null, error: 'Longitude muss zwischen -180 und 180 liegen.' };
  }
  return { lat, lng, error: null };
}

// ---------------------------------------------------------------------------
// Edit-Form
// ---------------------------------------------------------------------------

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
  const [latitude, setLatitude] = useState(loc.latitude !== null ? String(loc.latitude) : '');
  const [longitude, setLongitude] = useState(loc.longitude !== null ? String(loc.longitude) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const geo = parseGeo(latitude, longitude);
    if (geo.error) {
      setError(geo.error);
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name, note: note || null };
      if (geo.lat === null && geo.lng === null) {
        // Nur senden wenn vorher Koordinaten gesetzt waren — Backend
        // unterscheidet PATCH-leer (= unverändert) von clear_coordinates.
        if (loc.latitude !== null || loc.longitude !== null) {
          body['clear_coordinates'] = true;
        }
      } else {
        body['latitude'] = geo.lat;
        body['longitude'] = geo.lng;
      }
      await api.patch(`/locations/${loc.id}`, body);
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
      <GeoPicker
        latitude={latitude}
        longitude={longitude}
        onLatitudeChange={setLatitude}
        onLongitudeChange={setLongitude}
      />
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

// ---------------------------------------------------------------------------
// Create-Form
// ---------------------------------------------------------------------------

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const geo = parseGeo(latitude, longitude);
    if (geo.error) {
      setError(geo.error);
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name, note: note || null };
      if (geo.lat !== null && geo.lng !== null) {
        body['latitude'] = geo.lat;
        body['longitude'] = geo.lng;
      }
      await api.post('/locations', body);
      setName('');
      setNote('');
      setLatitude('');
      setLongitude('');
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Anlegen fehlgeschlagen.');
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
        />
        <GeoPicker
          latitude={latitude}
          longitude={longitude}
          onLatitudeChange={setLatitude}
          onLongitudeChange={setLongitude}
        />
        {error ? <div className="text-caption text-danger">{error}</div> : null}
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Anlegen'}
        </Button>
      </form>
    </Section>
  );
}
