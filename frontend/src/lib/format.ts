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

// Explizite Optionen statt `dateStyle: 'short'`: letzteres liefert in `de-DE`
// auf modernen V8-Engines ein 2-stelliges Jahr ("06.05.26"). Wir wollen
// durchgängig DD.MM.YYYY, also vier Stellen.
const dateFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dateTimeSecFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
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

/** Wie {@link formatDateTimeDe}, aber inkl. Sekunden — für CSV-Exports. */
export function formatDateTimeSecDe(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : dateTimeSecFmt.format(d);
}

/**
 * Formatiert reine ISO-Datums- oder ISO-DateTime-Strings für Chart-Achsen
 * und -Tooltips als DD.MM.YYYY. Akzeptiert `2026-05-06`, `2026-05-06T14:30`
 * und Date-Objekte. Bei reinen `YYYY-MM-DD`-Strings wird die Zeitzone
 * umgangen, damit z. B. `2026-05-06` nicht in MEZ als `05.05.2026` (UTC-1)
 * herauskommt.
 */
export function formatDateTickDe(value: string | number | Date): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : dateFmt.format(value);
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : dateFmt.format(d);
  }
  if (!value) return '';
  // Pure ISO-Date ohne Zeit: tageweise Anzeige, aber als lokale Komponenten
  // parsen — sonst verschiebt UTC-Interpretation den Tag.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, y, m, day] = dateOnly;
    return `${day}.${m}.${y}`;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : dateFmt.format(d);
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
