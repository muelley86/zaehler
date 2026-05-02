/**
 * Deutsche Zahlen- und Datums-Formatierung.
 *
 * Backend liefert Werte als ASCII-Strings ("1234.567"); Anzeige im Frontend
 * über `formatDe`/`formatDateTimeDe`/... — Eingaben (mit Komma als
 * Dezimaltrenner) werden über `parseDe` wieder in ASCII-konforme
 * Decimal-Strings normalisiert, bevor sie ans Backend gehen.
 */

const integerFmt = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const decimalFmt = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatDe(value: string | number, options?: Intl.NumberFormatOptions): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return String(value);
  if (options) return new Intl.NumberFormat('de-DE', options).format(num);
  return decimalFmt.format(num);
}

export function formatDeInt(value: string | number): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return String(value);
  return integerFmt.format(num);
}

/**
 * Akzeptiert deutsche Eingaben ("1.234,56", "12,3", "12.3", "12") und liefert
 * eine Backend-taugliche Decimal-String-Darstellung mit `.` als Trenner.
 * Wirft RangeError bei ungültiger Eingabe.
 */
export function parseDe(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') throw new RangeError('Leere Eingabe');
  // Tausender-Punkte entfernen, Komma → Punkt.
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new RangeError(`Keine gültige Zahl: ${input}`);
  }
  return normalized;
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatDateDe(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : dateFmt.format(d);
}

export function formatDateTimeDe(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : dateTimeFmt.format(d);
}

/** Aktueller Zeitpunkt für `<input type="datetime-local">`-Default. */
export function nowForInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Wandelt ISO-DateTime-String aus Backend in datetime-local-Form für `<input>`. */
export function toInputDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
