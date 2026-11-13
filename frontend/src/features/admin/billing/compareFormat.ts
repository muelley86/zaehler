/**
 * Anzeige-Helfer für den Vergleich frei gewählter Abrechnungsläufe: Beschriftung der Kennzahlen,
 * Werte und Abweichungen je Einheit, und die gemeinsame Zeilenform der drei Vergleichstabellen.
 */
import { formatDe } from '@/lib/format';
import type {
  BillingCompareMetric,
  BillingCompareRow,
  BillingCompareRun,
  BillingCompareUnit,
  BillingCompareValue,
} from '@/lib/types';

import { eur, eurDiff, FELD_LABEL, kwhDiff, mitProzent, monatKurz, prozentDiff } from './runFormat';

export const KENNZAHL_LABEL: Record<string, string> = {
  preis: 'Preis',
  bezugsmenge: 'Bezugsmenge',
  zaehlersumme: 'Zählersumme',
  gesamtkosten: 'Gesamtkosten',
  weiterberechnet: 'Weiterberechnet',
  differenz_eur: 'Differenz',
  differenz_prozent: 'Differenz in %',
  differenz_kwh: 'Differenz kWh',
  differenz_kwh_prozent: 'Differenz kWh in %',
};

export const EINHEIT_LABEL: Record<BillingCompareUnit, string> = {
  eur: '€',
  kwh: 'kWh',
  eur_kwh: '€/kWh',
  prozent: '%',
};

const KWH_STELLEN = 3;
const PREIS_STELLEN = 4;

/** Eine Zeile einer Vergleichstabelle — Kennzahl, Empfänger oder Position. */
export interface CompareTableRow {
  /** Eindeutig über alle drei Tabellen (Auswahl fürs Diagramm). */
  key: string;
  label: string;
  intern: boolean;
  hinweis: string | null;
  einheit: BillingCompareUnit;
  werte: BillingCompareValue[];
}

export function laufLabel(lauf: BillingCompareRun): string {
  return `${monatKurz(lauf.monat)} · V${lauf.version}`;
}

export function formatWert(wert: string | null, einheit: BillingCompareUnit): string {
  if (wert === null) return '—';
  switch (einheit) {
    case 'eur':
      return eur(wert);
    case 'kwh':
      return `${formatDe(wert, { maximumFractionDigits: KWH_STELLEN })} kWh`;
    case 'eur_kwh':
      return `${formatDe(wert)} €/kWh`;
    case 'prozent':
      return prozentDiff(wert);
  }
}

function formatDeltaAbsolut(delta: string, einheit: BillingCompareUnit): string {
  switch (einheit) {
    case 'eur':
      return eurDiff(delta);
    case 'kwh':
      return kwhDiff(delta);
    case 'eur_kwh':
      return `${formatDe(delta, { maximumFractionDigits: PREIS_STELLEN, signDisplay: 'exceptZero' })} €/kWh`;
    case 'prozent':
      // Abweichung zweier Prozentwerte sind Prozentpunkte, keine Prozent.
      return `${formatDe(delta, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' })} %-Punkte`;
  }
}

/** Abweichung zum Vorlauf, z. B. "-35,00 € (-28,00 %)"; ohne Vorwert `null`. */
export function formatDelta(wert: BillingCompareValue, einheit: BillingCompareUnit): string | null {
  if (wert.delta === null) return null;
  return mitProzent(formatDeltaAbsolut(wert.delta, einheit), wert.delta_prozent);
}

export function kennzahlZeilen(kennzahlen: BillingCompareMetric[]): CompareTableRow[] {
  return kennzahlen.map((k) => ({
    key: `kennzahl:${k.key}`,
    label: KENNZAHL_LABEL[k.key] ?? k.key,
    intern: false,
    hinweis: null,
    einheit: k.einheit,
    werte: k.werte,
  }));
}

/** Empfänger- bzw. Positionszeilen in der gewählten Einheit (Euro oder kWh). */
export function betragsZeilen(
  zeilen: BillingCompareRow[],
  art: 'empfaenger' | 'position',
  einheit: 'eur' | 'kwh',
): CompareTableRow[] {
  return zeilen.map((z) => ({
    key: `${art}:${z.name}`,
    label: z.name || '(ohne Empfänger)',
    intern: z.internal_allocation,
    hinweis:
      z.merkmale_geaendert.length > 0
        ? `geändert: ${z.merkmale_geaendert.map((f) => FELD_LABEL[f] ?? f).join(', ')}`
        : null,
    einheit,
    werte: einheit === 'eur' ? z.eur : z.kwh,
  }));
}
