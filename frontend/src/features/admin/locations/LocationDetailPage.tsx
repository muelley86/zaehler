import { ExternalLink } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { Section } from '@/components/ui';
import { LocationMap } from '@/components/LocationMap';
import { MAP_PROVIDERS } from '@/components/LocationMapSheet';
import type { LocationRead } from '@/lib/types';

import { MasterDataDetailPage, formatAddress } from '../_shared/MasterDataDetailPage';

/** Koordinaten als „lat, lng" (6 Nachkommastellen) oder `null`, wenn nicht gesetzt. */
function formatCoordinates(loc: LocationRead): string | null {
  if (loc.latitude === null || loc.longitude === null) return null;
  return `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
}

/** Google-Maps-Deeplink über den geteilten MAP_PROVIDERS-Eintrag (mit Fallback). */
function googleMapsUrl(lat: number, lon: number): string {
  return (
    MAP_PROVIDERS.find((p) => p.id === 'google')?.url(lat, lon) ??
    `https://www.google.com/maps?q=${lat},${lon}`
  );
}

export function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <MasterDataDetailPage<LocationRead>
      resource="locations"
      id={Number(id)}
      backTo="/admin/standorte"
      backLabel="Zählerstandorte"
      fallbackTitle="Zählerstandort"
      getTitle={(loc) => loc.name}
      getRows={(loc) => [
        { label: 'Hauptstandort', value: loc.main_location_name },
        { label: 'Adresse', value: formatAddress(loc) },
        { label: 'Koordinaten', value: formatCoordinates(loc) },
        { label: 'Notiz', value: loc.note },
      ]}
      afterRows={(loc) =>
        loc.latitude !== null && loc.longitude !== null ? (
          <Section header="Karte">
            <div className="space-y-2 p-5 pt-0">
              <LocationMap
                latitude={loc.latitude}
                longitude={loc.longitude}
                height={220}
                zoomable
              />
              <a
                href={googleMapsUrl(loc.latitude, loc.longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-pill border-hairline border-border bg-fill px-3 py-1.5 text-caption font-semibold text-primary-deep transition-colors hover:bg-fill-strong"
              >
                In Google Maps öffnen
                <ExternalLink size={12} />
              </a>
            </div>
          </Section>
        ) : null
      }
    />
  );
}
