/**
 * Diagramm-Einstellungen als kompaktes Popover: Aggregations-Granularität und
 * Diagrammtyp. Beide Gruppen haben ein „Automatisch"-Pill, das die gemerkte
 * Wahl wieder löscht (danach folgt der Wert dem Zeitraum bzw. der
 * Granularität — siehe `useChartPrefs`).
 *
 * Ersetzt die frühere „Ansicht"-Section auf dem Dashboard: die Controls sind
 * selten benutzt und kosten oben auf der Seite nur Platz.
 */

import type { ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { Dropdown, Pill } from '@/components/ui';
import type { ChartType, Granularity } from './chartUtils';
import type { ChartPrefs } from './useChartPrefs';

const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: 'Tag',
  week: 'Woche',
  month: 'Monat',
  year: 'Jahr',
};

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  line: 'Linie',
  bar: 'Balken',
  area: 'Fläche',
};

const GRANULARITY_ORDER: Granularity[] = ['day', 'week', 'month', 'year'];
const CHART_TYPE_ORDER: ChartType[] = ['line', 'bar', 'area'];

function OptionGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-caption-bold uppercase text-tertiary">{label}</div>
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
        {children}
      </div>
    </div>
  );
}

export function ChartSettingsMenu({ prefs }: { prefs: ChartPrefs }) {
  return (
    <Dropdown
      variant="pill"
      align="right"
      hideChevron
      label={
        <>
          <SlidersHorizontal size={14} aria-hidden />
          <span className="sr-only">Diagramm-Einstellungen</span>
        </>
      }
    >
      <div className="space-y-4 p-4">
        <OptionGroup label="Aggregation">
          <Pill
            size="sm"
            active={prefs.granularityMode === 'auto'}
            onClick={() => prefs.setGranularity(null)}
          >
            Automatisch ({GRANULARITY_LABELS[prefs.autoGranularity]})
          </Pill>
          {GRANULARITY_ORDER.map((g) => (
            <Pill
              key={g}
              size="sm"
              active={prefs.granularity === g}
              onClick={() => prefs.setGranularity(g)}
            >
              {GRANULARITY_LABELS[g]}
            </Pill>
          ))}
        </OptionGroup>
        <OptionGroup label="Diagramm">
          <Pill
            size="sm"
            active={prefs.chartTypeMode === 'auto'}
            onClick={() => prefs.setChartType(null)}
          >
            Automatisch ({CHART_TYPE_LABELS[prefs.autoChartType]})
          </Pill>
          {CHART_TYPE_ORDER.map((t) => (
            <Pill
              key={t}
              size="sm"
              active={prefs.chartType === t}
              onClick={() => prefs.setChartType(t)}
            >
              {CHART_TYPE_LABELS[t]}
            </Pill>
          ))}
        </OptionGroup>
      </div>
    </Dropdown>
  );
}
