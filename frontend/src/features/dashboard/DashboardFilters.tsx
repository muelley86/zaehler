/**
 * Filterleiste des Dashboards in zwei Darstellungen, per JS umgeschaltet
 * (`useIsDesktop`) statt per `hidden md:flex`: Die Dropdowns rendern ihr Panel
 * in ein Portal — stünden beide Varianten gleichzeitig im DOM, gäbe es jedes
 * Steuerelement doppelt (mehrdeutige Queries, doppelte Fokus-Ziele).
 *
 * - Desktop: alle Dropdowns inline in einer Section.
 * - Mobile: eine schmale Toolbar mit „Filter"-Button (Zähler-Badge) und
 *   Chips der aktiven Auswahl; die Dropdowns selbst liegen im Sheet.
 */

import { useState } from 'react';
import { Filter, X } from 'lucide-react';

import { Button, MultiSelectDropdown, Section, Sheet } from '@/components/ui';
import type { DropdownOption } from '@/components/ui';
import { useIsDesktop } from '@/lib/useMediaQuery';
import type { MeterType } from '@/lib/types';
import {
  removeChip,
  type DashboardFilters as Filters,
  type FilterChip,
  type FilterOptions,
} from './dashboardSelectors';

const RESET_LABEL = 'Filter zurücksetzen';

/**
 * `collectIdOptions` hängt immer eine „ohne …"-Option an; ein Dropdown ohne
 * echte Werte hätte also genau einen (sinnlosen) Eintrag.
 */
function hasRealOptions(options: DropdownOption<number | null>[]): boolean {
  return options.some((o) => o.value !== null);
}

export interface DashboardFiltersProps {
  filters: Filters;
  options: FilterOptions;
  /** Es gibt überhaupt verrechnete Messstellen — sonst entfällt das Dropdown. */
  virtualAvailable: boolean;
  activeCount: number;
  chips: FilterChip[];
  onChange: (next: Filters) => void;
  onReset: () => void;
}

/** Die sechs Filter-Dropdowns — identisch auf Desktop (inline) und Mobile (im Sheet). */
function FilterDropdowns({
  filters,
  options,
  virtualAvailable,
  onChange,
}: Pick<DashboardFiltersProps, 'filters' | 'options' | 'virtualAvailable' | 'onChange'>) {
  return (
    <>
      {hasRealOptions(options.mainLocations) ? (
        <MultiSelectDropdown
          label="Hauptstandorte"
          options={options.mainLocations}
          selected={filters.mainLocation}
          onChange={(next) => onChange({ ...filters, mainLocation: next })}
        />
      ) : null}
      {hasRealOptions(options.owners) ? (
        <MultiSelectDropdown
          label="Eigentümer"
          options={options.owners}
          selected={filters.owner}
          onChange={(next) => onChange({ ...filters, owner: next })}
        />
      ) : null}
      <MultiSelectDropdown
        label="Zählerstandorte"
        options={options.locations}
        selected={filters.location}
        onChange={(next) => onChange({ ...filters, location: next })}
      />
      <MultiSelectDropdown<MeterType>
        label="Zählerart"
        options={options.types}
        selected={filters.type}
        onChange={(next) => onChange({ ...filters, type: next })}
      />
      <MultiSelectDropdown
        label="Messstellen"
        options={options.measuringPoints}
        selected={filters.measuringPoint}
        onChange={(next) => onChange({ ...filters, measuringPoint: next })}
      />
      {virtualAvailable ? (
        <MultiSelectDropdown
          label="Verrechnete Messstellen"
          options={options.virtual}
          selected={filters.virtual}
          onChange={(next) => onChange({ ...filters, virtual: next })}
        />
      ) : null}
    </>
  );
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button type="button" onClick={onReset} className="text-caption font-semibold text-primary">
      {RESET_LABEL}
    </button>
  );
}

function ChipRow({
  chips,
  filters,
  onChange,
}: Pick<DashboardFiltersProps, 'chips' | 'filters' | 'onChange'>) {
  if (chips.length === 0) return null;
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-label={`${chip.label} entfernen`}
          onClick={() => onChange(removeChip(filters, chip))}
          className="flex shrink-0 items-center gap-1 rounded-pill border-hairline border-primary bg-primary-soft px-2.5 py-1 text-caption font-medium text-primary-deep"
        >
          {chip.label}
          <X size={12} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function DashboardFilters(props: DashboardFiltersProps) {
  const { filters, options, virtualAvailable, activeCount, chips, onChange, onReset } = props;
  const isDesktop = useIsDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);

  const dropdowns = (
    <FilterDropdowns
      filters={filters}
      options={options}
      virtualAvailable={virtualAvailable}
      onChange={onChange}
    />
  );

  if (isDesktop) {
    return (
      <Section>
        <div className="flex flex-wrap items-center gap-2 p-4">
          {dropdowns}
          {activeCount > 0 ? <ResetButton onReset={onReset} /> : null}
        </div>
      </Section>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="bordered"
          size="sm"
          leftIcon={<Filter size={14} aria-hidden />}
          aria-label={activeCount > 0 ? `Filter (${activeCount} aktiv)` : 'Filter'}
          onClick={() => setSheetOpen(true)}
        >
          Filter
          {activeCount > 0 ? (
            <span className="num inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-white">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </div>
      <ChipRow chips={chips} filters={filters} onChange={onChange} />
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filter">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">{dropdowns}</div>
          {activeCount > 0 ? <ResetButton onReset={onReset} /> : null}
          <Button variant="filled" fullWidth onClick={() => setSheetOpen(false)}>
            Fertig
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
