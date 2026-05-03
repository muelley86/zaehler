/**
 * LocationMap — Wrapper um react-leaflet für die Standort-Visualisierung.
 *
 * Zwei Modi:
 *   - **Read**  (default): Marker fix, Map-Pan/Zoom-Controls deaktiviert.
 *   - **Edit** (`interactive`): Marker draggable + Click setzt Marker neu.
 *     `onChange` liefert die aktuellen Koordinaten beim Drag-End oder Click.
 *
 * Tile-Quelle: OpenStreetMap (kostenfrei, fair-use). Attribution-Pflicht
 * laut ODbL — wird vom TileLayer automatisch eingeblendet.
 *
 * Vite-Marker-Icon-Fix: Leaflets Default-Icons referenzieren PNGs mit
 * relativen URLs, die durch Vites Bundling brechen. Wir importieren die
 * drei Asset-URLs explizit und überschreiben einmalig die Default-Icon-
 * Optionen.
 */

import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

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

  return (
    <div style={{ height }} className="overflow-hidden rounded-card border-hairline border-border">
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
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        <DraggableMarker
          latitude={latitude}
          longitude={longitude}
          interactive={interactive}
          onChange={onChange}
        />
        {interactive ? <ClickToPlace onChange={onChange} /> : null}
        <RecenterOnChange latitude={latitude} longitude={longitude} />
      </MapContainer>
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
