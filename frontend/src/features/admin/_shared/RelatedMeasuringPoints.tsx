import { useEffect, useState } from 'react';

import { Section } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { MeasuringPointWithStateRead } from '@/lib/types';

import { MeasuringPointSummaryCard } from './MeasuringPointSummaryCard';

export type MasterDataResource = 'owners' | 'suppliers' | 'mieters';

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

  return (
    <Section header="Zugeordnete Messstellen">
      {error ? (
        <div className="p-5 text-danger">{error}</div>
      ) : items === null ? (
        <div className="p-5 text-tertiary">Lädt…</div>
      ) : items.length === 0 ? (
        <div className="p-5 text-tertiary">Keine Messstellen zugeordnet.</div>
      ) : (
        <div className="space-y-2 p-5">
          {items.map((item) => (
            <MeasuringPointSummaryCard key={item.measuring_point.id} item={item} />
          ))}
        </div>
      )}
    </Section>
  );
}
