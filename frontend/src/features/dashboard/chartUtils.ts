/**
 * Reine Helfer für die Dashboard-Charts: Diagrammtyp/Granularität, Bucketing
 * (spiegelt die Backend-Aggregation in `services/consumption.py`) und
 * localStorage-Persistenz der globalen View-Controls.
 */

export type ChartType = 'line' | 'bar' | 'area';
export type Granularity = 'day' | 'week' | 'month' | 'year';

const CHART_TYPE_KEY = 'dashboard.chartType';
const GRANULARITY_KEY = 'dashboard.granularity';

function isChartType(v: string | null): v is ChartType {
  return v === 'line' || v === 'bar' || v === 'area';
}

function isGranularity(v: string | null): v is Granularity {
  return v === 'day' || v === 'week' || v === 'month' || v === 'year';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function parseUtc(dateIso: string): Date {
  const parts = dateIso.slice(0, 10).split('-');
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
}

/**
 * Enddatum (ISO `YYYY-MM-DD`) des Buckets, in den `dateIso` fällt — passend zur
 * Backend-Aggregation, damit Verbrauchs- und Stand-Serien dieselbe X-Achse teilen.
 * Woche = ISO-Woche (Montag bis Sonntag).
 */
export function bucketEndIso(dateIso: string, granularity: Granularity): string {
  const d = parseUtc(dateIso);
  if (granularity === 'day') return toIso(d);
  if (granularity === 'week') {
    const dow = (d.getUTCDay() + 6) % 7; // Montag=0 … Sonntag=6
    const sunday = new Date(d);
    sunday.setUTCDate(d.getUTCDate() - dow + 6);
    return toIso(sunday);
  }
  if (granularity === 'month') {
    return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  }
  return `${d.getUTCFullYear()}-12-31`;
}

/** Default-Granularität abhängig von der gewählten Zeitspanne. */
export function defaultGranularity(fromIso: string, toIso: string): Granularity {
  const a = fromIso.slice(0, 10);
  const b = toIso.slice(0, 10);
  if (!a || !b) return 'month';
  const from = parseUtc(a).getTime();
  const to = parseUtc(b).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 'month';
  const days = Math.round((to - from) / 86_400_000);
  if (days <= 45) return 'day';
  if (days <= 182) return 'week';
  if (days <= 1096) return 'month';
  return 'year';
}

export function loadChartType(): ChartType {
  try {
    const raw = window.localStorage.getItem(CHART_TYPE_KEY);
    return isChartType(raw) ? raw : 'line';
  } catch {
    return 'line';
  }
}

export function saveChartType(value: ChartType): void {
  try {
    window.localStorage.setItem(CHART_TYPE_KEY, value);
  } catch {
    /* QuotaExceeded / SecurityError ignorieren — non-fatal UX-State */
  }
}

/** Gespeicherte Granularität oder `null`, wenn der Nutzer noch nichts gewählt hat. */
export function loadGranularity(): Granularity | null {
  try {
    const raw = window.localStorage.getItem(GRANULARITY_KEY);
    return isGranularity(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveGranularity(value: Granularity): void {
  try {
    window.localStorage.setItem(GRANULARITY_KEY, value);
  } catch {
    /* non-fatal */
  }
}
