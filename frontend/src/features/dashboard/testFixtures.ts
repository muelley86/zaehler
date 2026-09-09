/**
 * Test-Fixtures für die Dashboard-Fachlogik (Selektoren, Chart-Helfer). Baut
 * `DashboardResponse`-Fragmente mit sinnvollen Defaults, damit Tests nur die
 * für den jeweiligen Fall relevanten Felder angeben müssen.
 */

import type {
  ConsumptionPoint,
  DashboardGranularity,
  DashboardMeasuringPoint,
  DashboardResponse,
  DashboardVirtualMeasuringPoint,
} from '@/lib/types';

/** Ein Verbrauchspunkt (period_start = period_end, Tests bucket'n nicht selbst). */
export function cp(
  periodEnd: string,
  consumption: string,
  unit: string,
  obis = 'r',
): ConsumptionPoint {
  return {
    period_start: periodEnd,
    period_end: periodEnd,
    register_id: 0,
    obis_code: obis,
    consumption,
    unit,
  };
}

/** Reale Messstelle mit Defaults für alle Felder — Overrides ersetzen einzelne. */
export function dashboardItem(
  overrides: Partial<DashboardMeasuringPoint> = {},
): DashboardMeasuringPoint {
  return {
    id: 1,
    name: 'Messstelle',
    type: 'electricity',
    heating_source: null,
    main_location_id: null,
    main_location_name: null,
    location_id: null,
    location_name: null,
    current_owner_id: null,
    current_owner_name: null,
    kostenstelle: null,
    installation_location: null,
    registers: [],
    last_reading_at: null,
    consumption: [],
    totals: [],
    ...overrides,
  };
}

/** Verrechnete Messstelle mit Defaults für alle Felder — Overrides ersetzen einzelne. */
export function virtualItem(
  overrides: Partial<DashboardVirtualMeasuringPoint> = {},
): DashboardVirtualMeasuringPoint {
  return {
    id: 1,
    name: 'Verrechnete Messstelle',
    type: 'electricity',
    location_id: null,
    location_name: null,
    main_location_id: null,
    main_location_name: null,
    consumption: [],
    totals: [],
    ...overrides,
  };
}

interface DashboardResponseInput {
  items?: DashboardMeasuringPoint[];
  virtual_items?: DashboardVirtualMeasuringPoint[];
  from_date?: string | null;
  to_date?: string | null;
  previous_from_date?: string | null;
  previous_to_date?: string | null;
  granularity?: DashboardGranularity | null;
  partial?: boolean;
}

/**
 * Volle `/dashboard`-Antwort mit Default-Zeitraum (laufender + Vormonat,
 * gespiegelt an der App-Konvention). `virtual_items` bleibt weg, wenn nicht
 * angegeben (optionales Feld, `exactOptionalPropertyTypes`).
 */
export function dashboardResponse(input: DashboardResponseInput = {}): DashboardResponse {
  const {
    items = [],
    virtual_items,
    from_date = '2026-08-01',
    to_date = '2026-09-30',
    previous_from_date = '2026-06-01',
    previous_to_date = '2026-07-31',
    granularity = 'month',
    partial = false,
  } = input;
  return {
    items,
    ...(virtual_items !== undefined ? { virtual_items } : {}),
    from_date,
    to_date,
    previous_from_date,
    previous_to_date,
    granularity,
    partial,
  };
}
