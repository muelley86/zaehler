/**
 * Read-only Karten-Sheet für einen Standort: zeigt einen Pin, Mono-
 * Anzeige der Koordinaten und einen "In OpenStreetMap öffnen"-Link.
 *
 * Tap auf die Koordinaten-Zeile in der LocationCard öffnet dieses Sheet —
 * der User bleibt in der App. Wer routen oder teilen will, klickt den
 * OSM-Link für den externen Tab.
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

export function LocationMapSheet({ open, onClose, latitude, longitude, name }: Props) {
  const osmUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
  return (
    <Sheet open={open} onClose={onClose} title={name ?? 'Standort'}>
      <div className="space-y-3">
        <LocationMap latitude={latitude} longitude={longitude} height={320} />
        <div className="flex items-center justify-between gap-3 text-caption">
          <span className="num text-tertiary">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </span>
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-primary-deep hover:text-primary"
          >
            In OpenStreetMap öffnen
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </Sheet>
  );
}
