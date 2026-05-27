/**
 * Read-only Karten-Sheet für einen Standort: zeigt einen Pin, Mono-
 * Anzeige der Koordinaten und Buttons zum Öffnen in externen Karten-Diensten.
 *
 * Tap auf die Koordinaten-Zeile in der LocationCard öffnet dieses Sheet —
 * der User bleibt in der App. Wer routen oder teilen will, wählt einen
 * Anbieter (OpenStreetMap / Google Maps / Apple Maps) und springt in
 * den externen Tab oder die native App.
 */

import { ExternalLink } from 'lucide-react';

import { Sheet } from '@/components/ui';
import { LocationMap } from '@/components/LocationMap';

interface Props {
  open: boolean;
  onClose: () => void;
  latitude: number;
  longitude: number;
  name?: string;
}

export interface MapProvider {
  id: 'osm' | 'google' | 'apple';
  label: string;
  url: (lat: number, lon: number, name?: string) => string;
}

/**
 * Externe Karten-Dienste, die zu einem Lat/Lon-Paar einen Link anbieten.
 * Wird sowohl von {@link LocationMapSheet} als auch von der Foto-Lightbox
 * verwendet — gleiche Buttons-Reihenfolge, gleiches Linkformat.
 */
export const MAP_PROVIDERS: MapProvider[] = [
  {
    id: 'osm',
    label: 'OpenStreetMap',
    url: (lat, lon) =>
      `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`,
  },
  {
    id: 'google',
    label: 'Google Maps',
    url: (lat, lon) => `https://www.google.com/maps?q=${lat},${lon}`,
  },
  {
    id: 'apple',
    label: 'Apple Maps',
    url: (lat, lon, name) => {
      const params = new URLSearchParams({ ll: `${lat},${lon}` });
      if (name) params.set('q', name);
      return `https://maps.apple.com/?${params.toString()}`;
    },
  },
];

// Backwards-compat-Alias fuer die lokalen Verwendungen in dieser Datei.
const PROVIDERS = MAP_PROVIDERS;

export function LocationMapSheet({ open, onClose, latitude, longitude, name }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={name ?? 'Standort'}>
      <div className="space-y-3">
        <LocationMap latitude={latitude} longitude={longitude} height={320} />
        <div className="num text-caption text-tertiary">
          {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </div>
        <div>
          <div className="mb-1.5 text-caption-bold uppercase text-tertiary">
            In Kartendienst öffnen
          </div>
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((p) => (
              <a
                key={p.id}
                href={p.url(latitude, longitude, name)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-pill border-hairline border-border bg-fill px-3 py-1.5 text-caption font-semibold text-primary-deep transition-colors hover:bg-fill-strong"
              >
                {p.label}
                <ExternalLink size={12} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
