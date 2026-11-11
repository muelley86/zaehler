import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

import { Select, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import type { LocationRead, MainLocationRead } from '@/lib/types';

import { LocationCreateForm } from './LocationsAdminPage';

/**
 * Standort-Auswahl mit „Neuer Standort": fehlt der Standort noch, lässt er sich
 * in einem Sheet anlegen, ohne das umgebende Formular (Messstelle anlegen /
 * bearbeiten) zu verlassen. Der neue Standort ist danach sofort ausgewählt.
 */
export function LocationSelectField({
  locations,
  value,
  onChange,
}: {
  locations: LocationRead[];
  value: number | null;
  onChange: (locationId: number | null) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Hier angelegte Standorte, die die ``locations`` des Aufrufers noch nicht kennen.
  const [createdLocations, setCreatedLocations] = useState<LocationRead[]>([]);
  const [mainLocations, setMainLocations] = useState<MainLocationRead[]>([]);

  useEffect(() => {
    if (!sheetOpen) return;
    let active = true;
    api
      .get<MainLocationRead[]>('/main-locations')
      .then((loaded) => {
        if (active) setMainLocations(loaded);
      })
      .catch(() => {
        /* nicht kritisch — Hauptstandort ist optional, Auswahl bleibt leer */
      });
    return () => {
      active = false;
    };
  }, [sheetOpen]);

  const options = useMemo(() => {
    const knownIds = new Set(locations.map((loc) => loc.id));
    return [...locations, ...createdLocations.filter((loc) => !knownIds.has(loc.id))];
  }, [locations, createdLocations]);

  function handleCreated(created: LocationRead) {
    setCreatedLocations((prev) => [...prev, created]);
    onChange(created.id);
    setSheetOpen(false);
  }

  return (
    <div>
      <Select
        label="Standort"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— kein Standort —</option>
        {options.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </Select>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="mt-1.5 inline-flex min-h-9 items-center gap-1 px-1 text-body-sm font-semibold text-primary"
      >
        <Plus size={16} aria-hidden />
        Neuer Standort
      </button>
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Neuer Standort">
        {/* React-Events bubbeln durch Portale entlang des Komponentenbaums:
            ohne Stopp würde das Absenden hier auch das umgebende
            Messstellen-Formular abschicken. */}
        <div onSubmit={(e) => e.stopPropagation()}>
          <LocationCreateForm mainLocations={mainLocations} onCreated={handleCreated} />
        </div>
      </Sheet>
    </div>
  );
}
