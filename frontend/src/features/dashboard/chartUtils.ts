/**
 * Reine Helfer für die Dashboard-Charts: Diagrammtyp/Granularität-Defaults
 * und localStorage-Persistenz der globalen View-Controls.
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

function parseUtc(dateIso: string): Date {
  const parts = dateIso.slice(0, 10).split('-');
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
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

/**
 * Default-Diagrammtyp abhängig von der Granularität: Tag/Woche sind ein
 * fortlaufender Zeitverlauf → Linie; Monat/Jahr sind diskrete, vergleichbare
 * Perioden → Balken.
 */
export function defaultChartType(granularity: Granularity): ChartType {
  return granularity === 'day' || granularity === 'week' ? 'line' : 'bar';
}

/** Gespeicherter Diagrammtyp oder `null`, wenn der Nutzer noch nichts gewählt hat. */
export function loadChartType(): ChartType | null {
  try {
    const raw = window.localStorage.getItem(CHART_TYPE_KEY);
    return isChartType(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveChartType(value: ChartType): void {
  try {
    window.localStorage.setItem(CHART_TYPE_KEY, value);
  } catch {
    /* QuotaExceeded / SecurityError ignorieren — non-fatal UX-State */
  }
}

/** Löscht die gemerkte Wahl — z. B. wenn der Nutzer sie explizit zurücksetzt. */
export function clearChartType(): void {
  try {
    window.localStorage.removeItem(CHART_TYPE_KEY);
  } catch {
    /* non-fatal */
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

/** Löscht die gemerkte Wahl — z. B. wenn der Nutzer sie explizit zurücksetzt. */
export function clearGranularity(): void {
  try {
    window.localStorage.removeItem(GRANULARITY_KEY);
  } catch {
    /* non-fatal */
  }
}
