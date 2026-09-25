import { formatDe, parseDe } from '@/lib/format';
import type { BillingRunStatus } from '@/lib/types';

export const RUN_STATUS_LABEL: Record<BillingRunStatus, string> = {
  entwurf: 'Entwurf',
  festgeschrieben: 'Festgeschrieben',
  ersetzt: 'Ersetzt',
};

export const RUN_STATUS_CLASS: Record<BillingRunStatus, string> = {
  entwurf: 'bg-fill text-secondary',
  festgeschrieben: 'bg-success/10 text-success',
  ersetzt: 'bg-fill text-tertiary line-through',
};

export function eur(v: string | null | undefined): string {
  return v === null || v === undefined
    ? '—'
    : `${formatDe(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Differenz mit Vorzeichen: "+2.101,32 €", "−3,00 €", "0,00 €". */
export function eurDiff(v: string | null | undefined): string {
  return v === null || v === undefined
    ? '—'
    : `${formatDe(v, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' })} €`;
}

export function num(v: string | null | undefined): string {
  return v === null || v === undefined ? '' : formatDe(v);
}

/** "5" -> "0.05" ohne Gleitkomma-Fehler (Backend erwartet den Anteil); wirft wie ``parseDe``. */
export function prozentZuAnteil(prozent: string): string {
  const [ganz = '0', bruch = ''] = parseDe(prozent).replace('-', '').split('.');
  const ziffern = ganz + bruch;
  const pos = ganz.length - 2;
  const text =
    pos <= 0 ? `0.${'0'.repeat(-pos)}${ziffern}` : `${ziffern.slice(0, pos)}.${ziffern.slice(pos)}`;
  return text.replace(/^0+(?=\d)/, '');
}

/** "0.05" -> "5" (Anzeige) ohne Gleitkomma-Fehler. */
export function anteilZuProzent(anteil: string): string {
  const negativ = anteil.startsWith('-');
  const [ganz = '0', bruch = ''] = anteil.replace('-', '').split('.');
  const ziffern = `${ganz}${bruch.padEnd(2, '0')}`;
  const komma = ganz.length + 2;
  const text = `${ziffern.slice(0, komma)}.${ziffern.slice(komma)}`.replace(/^0+(?=\d)/, '');
  return `${negativ ? '-' : ''}${formatDe(text, { maximumFractionDigits: 6 })}`;
}

/** Zeitraum der Monatsübersicht um `schritt` Monate verschieben (Format JJJJ-MM). */
export function monateVerschieben(von: string, bis: string, schritt: number): [string, string] {
  const rechne = (m: string) => {
    const [jahr = 0, mon = 1] = m.split('-').map(Number);
    const gesamt = jahr * 12 + (mon - 1) + schritt;
    const neuerMonat = String((gesamt % 12) + 1).padStart(2, '0');
    return `${String(Math.floor(gesamt / 12)).padStart(4, '0')}-${neuerMonat}`;
  };
  return [rechne(von), rechne(bis)];
}
