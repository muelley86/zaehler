/**
 * LocationMap — Wrapper um react-leaflet für die Standort-Visualisierung.
 *
 * Zwei Modi:
 *   - **Read**  (default): Marker fix, Map-Pan/Zoom-Controls deaktiviert.
 *   - **Edit** (`interactive`): Marker draggable + Click setzt Marker neu.
 *     `onChange` liefert die aktuellen Koordinaten beim Drag-End oder Click.
 *
 * Drei Tile-Layer schaltbar oben rechts:
 *   - **Karte**    — OpenStreetMap (Standard, Straßenkarte mit Labels)
 *   - **Satellit** — Esri World Imagery (Luftbild ohne Labels)
 *   - **Hybrid**   — Esri Imagery + Esri Reference (Labels über Luftbild)
 *
 * Alle drei Quellen sind kostenfrei nutzbar; Attribution wird vom TileLayer
 * automatisch eingeblendet (OSM ODbL, Esri-Lizenzbedingungen).
 *
 * Vite-Marker-Icon-Fix: Leaflets Default-Icons referenzieren PNGs mit
 * relativen URLs, die durch Vites Bundling brechen. Wir importieren die
 * drei Asset-URLs explizit und überschreiben einmalig die Default-Icon-
 * Optionen.
 */

import { useEffect, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { cx } from '@/components/ui/cx';

let defaultIconFixed = false;
function ensureDefaultIcon(): void {
  if (defaultIconFixed) return;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl,
    iconUrl,
    shadowUrl,
  });
  defaultIconFixed = true;
}

type LayerId = 'osm' | 'satellite' | 'hybrid';

const ESRI_IMAGERY_ATTR =
  '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN, and the GIS User Community';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ESRI_IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_REFERENCE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

interface Props {
  latitude: number;
  longitude: number;
  /** Höhe in Pixeln. Default 220. */
  height?: number;
  /** Edit-Mode — Marker draggable, Click setzt neu, onChange wird gerufen. */
  interactive?: boolean;
  onChange?: ((lat: number, lng: number) => void) | undefined;
  /** Initialer Zoom. Default 16 (Read), 13 (Edit, mehr Übersicht). */
  zoom?: number;
}

export function LocationMap({
  latitude,
  longitude,
  height = 220,
  interactive = false,
  onChange,
  zoom,
}: Props) {
  ensureDefaultIcon();
  const initialZoom = zoom ?? (interactive ? 13 : 16);
  const [layer, setLayer] = useState<LayerId>('osm');

  return (
    <div
      style={{ height }}
      className="relative overflow-hidden rounded-card border-hairline border-border"
    >
      <MapContainer
        center={[latitude, longitude]}
        zoom={initialZoom}
        scrollWheelZoom={interactive}
        dragging={interactive}
        zoomControl={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        keyboard={interactive}
        style={{ height: '100%', width: '100%' }}
      >
        {layer === 'osm' ? (
          <TileLayer url={OSM_URL} attribution={OSM_ATTR} maxZoom={19} />
        ) : (
          <TileLayer url={ESRI_IMAGERY_URL} attribution={ESRI_IMAGERY_ATTR} maxZoom={19} />
        )}
        {layer === 'hybrid' ? <TileLayer url={ESRI_REFERENCE_URL} maxZoom={19} /> : null}
        <DraggableMarker
          latitude={latitude}
          longitude={longitude}
          interactive={interactive}
          onChange={onChange}
        />
        {interactive ? <ClickToPlace onChange={onChange} /> : null}
        <RecenterOnChange latitude={latitude} longitude={longitude} />
      </MapContainer>
      <LayerSwitcher value={layer} onChange={setLayer} />
    </div>
  );
}

function LayerSwitcher({ value, onChange }: { value: LayerId; onChange: (l: LayerId) => void }) {
  const options: { id: LayerId; label: string }[] = [
    { id: 'osm', label: 'Karte' },
    { id: 'satellite', label: 'Satellit' },
    { id: 'hybrid', label: 'Hybrid' },
  ];
  return (
    <div
      className="absolute right-2 top-2 z-[1000] flex gap-0.5 rounded-pill border-hairline border-border bg-surface-high p-0.5 shadow-sm"
      role="radiogroup"
      aria-label="Karten-Stil"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            'rounded-pill px-2.5 py-1 text-caption font-semibold transition-colors',
            value === o.id
              ? 'bg-primary-soft text-primary-deep'
              : 'text-secondary hover:bg-fill hover:text-label',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DraggableMarker({
  latitude,
  longitude,
  interactive,
  onChange,
}: {
  latitude: number;
  longitude: number;
  interactive: boolean;
  onChange?: ((lat: number, lng: number) => void) | undefined;
}) {
  return (
    <Marker
      position={[latitude, longitude]}
      draggable={interactive}
      eventHandlers={
        interactive && onChange
          ? {
              dragend(e) {
                const m = e.target as L.Marker;
                const { lat, lng } = m.getLatLng();
                onChange(lat, lng);
              },
            }
          : {}
      }
    />
  );
}

function ClickToPlace({
  onChange,
}: {
  onChange?: ((lat: number, lng: number) => void) | undefined;
}) {
  useMapEvents({
    click(e) {
      onChange?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function RecenterOnChange({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom(), { animate: false });
  }, [latitude, longitude, map]);
  return null;
}
