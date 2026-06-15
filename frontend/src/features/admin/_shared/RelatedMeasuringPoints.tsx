import { useEffect, useState } from 'react';

import { Button, MultiSelectDropdown, Section } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { MeasuringPointWithStateRead } from '@/lib/types';

import { MeasuringPointSummaryCard } from './MeasuringPointSummaryCard';
import {
  useMeasuringPointFilters,
  type MpFilterControl,
  type MpFilterDimension,
} from './useMeasuringPointFilters';

export type MasterDataResource =
  | 'owners'
  | 'suppliers'
  | 'mieters'
  | 'locations'
  | 'main-locations';

// Die zur Detailseite gehörende Dimension wird im Filter ausgeblendet — auf der
// Hauptstandort-Seite kein Hauptstandort-Filter, auf der Eigentümer-Seite kein
// Eigentümer-Filter usw. Zählerstandort blendet nichts aus (keine eigene Dimension).
const EXCLUDE_BY_RESOURCE: Record<MasterDataResource, MpFilterDimension | null> = {
  owners: 'owner',
  suppliers: 'supplier',
  mieters: 'mieter',
  'main-locations': 'mainLocation',
  locations: null,
};

function FilterDropdown<T extends string | number | null>({ ctrl }: { ctrl: MpFilterControl<T> }) {
  if (!ctrl.show) return null;
  return (
    <MultiSelectDropdown
      label={ctrl.label}
      options={ctrl.options}
      selected={ctrl.selected}
      onChange={ctrl.onChange}
    />
  );
}

/**
 * Lädt und zeigt die aktuell einem Stammdatensatz zugeordneten Messstellen
 * (mit aktuellem Stand). Datenquelle der Detailseiten — ein Request je Seite
 * über den serverseitig gebündelten Endpoint.
 */
export function RelatedMeasuringPoints({
  resource,
  id,
}: {
  resource: MasterDataResource;
  id: number;
}) {
  const [items, setItems] = useState<MeasuringPointWithStateRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setItems(null);
    setError(null);
    api
      .get<MeasuringPointWithStateRead[]>(`/${resource}/${id}/measuring-points`)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
        else setError('Messstellen konnten nicht geladen werden.');
      });
    return () => {
      active = false;
    };
  }, [resource, id]);

  const filters = useMeasuringPointFilters(items, EXCLUDE_BY_RESOURCE[resource]);

  return (
    <Section header="Zugeordnete Messstellen">
      {error ? (
        <div className="p-5 text-danger">{error}</div>
      ) : items === null ? (
        <div className="p-5 text-tertiary">Lädt…</div>
      ) : items.length === 0 ? (
        <div className="p-5 text-tertiary">Keine Messstellen zugeordnet.</div>
      ) : (
        <div className="space-y-3 p-5">
          {filters.hasVisibleFilters ? (
            <div className="flex flex-wrap items-center gap-2">
              <FilterDropdown ctrl={filters.type} />
              <FilterDropdown ctrl={filters.owner} />
              <FilterDropdown ctrl={filters.supplier} />
              <FilterDropdown ctrl={filters.mieter} />
              <FilterDropdown ctrl={filters.mainLocation} />
              {filters.hasActiveFilters ? (
                <Button variant="plain" size="sm" onClick={filters.reset}>
                  Filter zurücksetzen
                </Button>
              ) : null}
            </div>
          ) : null}
          {filters.filtered.length === 0 ? (
            <div className="text-tertiary">Keine Treffer.</div>
          ) : (
            <div className="space-y-2">
              {filters.filtered.map((item) => (
                <MeasuringPointSummaryCard key={item.measuring_point.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
