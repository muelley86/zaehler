import { ApiError } from '@/lib/api';
import type { BillingCircleRead } from '@/lib/types';

export interface CircleFormState {
  code: string;
  name: string;
  rechnungsleger: string;
  abnahmestelle: string;
  marktlokation: string;
  note: string;
}

export function circleFormState(c?: BillingCircleRead): CircleFormState {
  return {
    code: c?.code ?? '',
    name: c?.name ?? '',
    rechnungsleger: c?.rechnungsleger ?? '',
    abnahmestelle: c?.abnahmestelle ?? '',
    marktlokation: c?.marktlokation ?? '',
    note: c?.note ?? '',
  };
}

export function circleBody(s: CircleFormState): Record<string, unknown> {
  return {
    code: s.code.trim(),
    name: s.name.trim(),
    rechnungsleger: s.rechnungsleger.trim(),
    abnahmestelle: s.abnahmestelle.trim(),
    marktlokation: s.marktlokation.trim() || null,
    note: s.note.trim() || null,
  };
}

/** Letzter Tag des Vormonats als ISO-Datum — Standard-Stichtag der Monatsabrechnung. */
export function lastDayOfPreviousMonth(today: Date = new Date()): string {
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 0));
  return d.toISOString().slice(0, 10);
}

export function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : fallback;
}
