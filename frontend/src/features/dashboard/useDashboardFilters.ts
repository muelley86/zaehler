/**
 * Die sechs kategorialen Dashboard-Filter als EIN Hook: je ein
 * `useStickyState` (Session-Memory, gated über „Filter merken" aus
 * `useFilterPrefs`), gleiche Keys/Codecs wie zuvor in `DashboardPage.tsx`.
 */

import { useCallback, useMemo } from 'react';

import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import { setCodec, useStickyState } from '@/lib/useStickyState';
import type { MeterType } from '@/lib/types';
import { TYPE_LABELS } from '@/lib/meterLabels';
import { countActiveFilters, emptyFilters, type DashboardFilters } from './dashboardSelectors';

const FILTER_NS = 'filters.dashboard.';
const isIdMember = (x: unknown): x is number | null => x === null || typeof x === 'number';
const isMeterType = (x: unknown): x is MeterType =>
  typeof x === 'string' && Object.prototype.hasOwnProperty.call(TYPE_LABELS, x);
const ID_CODEC = setCodec<number | null>(isIdMember);
const TYPE_CODEC = setCodec<MeterType>(isMeterType);

export interface DashboardFiltersState {
  filters: DashboardFilters;
  setFilters(next: DashboardFilters): void;
  reset(): void;
  activeCount: number;
}

export function useDashboardFilters(): DashboardFiltersState {
  const { rememberFilters } = useFilterPrefs();

  const [mainLocation, setMainLocation] = useStickyState<Set<number | null>>(
    FILTER_NS + 'mainLocation',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );
  const [owner, setOwner] = useStickyState<Set<number | null>>(
    FILTER_NS + 'owner',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );
  const [location, setLocation] = useStickyState<Set<number | null>>(
    FILTER_NS + 'location',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );
  const [type, setType] = useStickyState<Set<MeterType>>(
    FILTER_NS + 'type',
    new Set(),
    rememberFilters,
    TYPE_CODEC,
  );
  const [measuringPoint, setMeasuringPoint] = useStickyState<Set<number | null>>(
    FILTER_NS + 'measuringPoint',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );
  const [virtual, setVirtual] = useStickyState<Set<number | null>>(
    FILTER_NS + 'virtual',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );

  // Memoisiert auf die sechs Sets: `DashboardFilters` ist Prop/Dep für
  // nachgelagerte `useMemo`s (z. B. `selectFilteredItems`) — ohne stabile
  // Identität würde jeder Render dort neu rechnen.
  const filters: DashboardFilters = useMemo(
    () => ({ mainLocation, owner, location, type, measuringPoint, virtual }),
    [mainLocation, owner, location, type, measuringPoint, virtual],
  );

  const setFilters = useCallback(
    (next: DashboardFilters) => {
      setMainLocation(next.mainLocation);
      setOwner(next.owner);
      setLocation(next.location);
      setType(next.type);
      setMeasuringPoint(next.measuringPoint);
      setVirtual(next.virtual);
    },
    [setMainLocation, setOwner, setLocation, setType, setMeasuringPoint, setVirtual],
  );

  const reset = useCallback(() => setFilters(emptyFilters()), [setFilters]);

  return { filters, setFilters, reset, activeCount: countActiveFilters(filters) };
}
