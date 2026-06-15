import { useParams } from 'react-router-dom';

import { Section } from '@/components/ui';
import { LocationMap } from '@/components/LocationMap';
import type { LocationRead } from '@/lib/types';

import { MasterDataDetailPage, formatAddress } from '../_shared/MasterDataDetailPage';

/** Koordinaten als „lat, lng" (6 Nachkommastellen) oder `null`, wenn nicht gesetzt. */
function formatCoordinates(loc: LocationRead): string | null {
  if (loc.latitude === null || loc.longitude === null) return null;
  return `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
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
            <div className="p-5 pt-0">
              <LocationMap latitude={loc.latitude} longitude={loc.longitude} height={220} />
            </div>
          </Section>
        ) : null
      }
    />
  );
}
