/**
 * Lade-Skeletons für die Dashboard-Seite: Filterleiste, KPI-Kacheln und eine
 * Liste (z. B. Hinweise/Top-Verbraucher). Stil wie die übrigen Skeletons
 * (`animate-pulse`, `bg-fill`, `rounded-card`).
 */

import { Section } from '@/components/ui';

const KPI_TILE_COUNT = 4;
const LIST_ROW_COUNT = 3;

function FilterBarSkeleton() {
  return (
    <div
      aria-hidden
      className="animate-pulse rounded-card border-hairline border-border bg-fill"
      style={{ height: 44 }}
    />
  );
}

function KpiSkeleton() {
  return (
    <ul aria-hidden className="grid grid-cols-2 gap-px bg-separator md:grid-cols-4">
      {Array.from({ length: KPI_TILE_COUNT }, (_, i) => (
        <li key={i} className="animate-pulse bg-surface" style={{ height: 88 }} />
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <Section>
      <ul aria-hidden className="divide-y divide-separator">
        {Array.from({ length: LIST_ROW_COUNT }, (_, i) => (
          <li key={i} className="animate-pulse p-4">
            <div className="h-4 w-2/3 rounded-pill bg-fill" />
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <FilterBarSkeleton />
      <KpiSkeleton />
      <ListSkeleton />
      <span role="status" aria-live="polite" className="sr-only">
        Daten werden geladen
      </span>
    </div>
  );
}
