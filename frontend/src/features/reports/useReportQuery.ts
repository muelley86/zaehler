/**
 * Explizites Auswerten: Die Seite hält die *anstehende* Query (aus den
 * aktuellen Filtern) getrennt vom *ausgeführten* Lauf. Nur `execute()` lädt —
 * kein Effekt auf Filteränderungen. `stale` meldet, dass die Filter seit dem
 * letzten Lauf verändert wurden. Ein neuer Lauf bricht den vorherigen ab.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, api } from '@/lib/api';
import type { ReportAggregateResponse, ReportDimension, ReportGranularity } from '@/lib/types';

/** Alles, was ein Lauf braucht — Query-Strings plus die Anzeige-Parameter dazu. */
export interface ReportRunInput {
  queryA: string;
  /** `null` = kein Perioden-Vergleich. */
  queryB: string | null;
  /** Für den Tabellen-Header des AUSGEFÜHRTEN Laufs (nicht der Live-Filter). */
  dimension: ReportDimension;
  /** Effektive Auflösung (Vergleich → immer `total`). */
  granularity: ReportGranularity;
}

export interface ReportRun {
  input: ReportRunInput;
  result: ReportAggregateResponse;
  resultB: ReportAggregateResponse | null;
}

export interface ReportQueryState {
  /** `null` = noch nie ausgewertet → Platzhalter statt Tabelle. */
  run: ReportRun | null;
  loading: boolean;
  error: string | null;
  /** Anstehende Query weicht vom letzten Lauf ab → „erneut auswerten". */
  stale: boolean;
  execute: () => void;
}

function sameInput(a: ReportRunInput, b: ReportRunInput): boolean {
  return a.queryA === b.queryA && a.queryB === b.queryB;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.problem.detail ?? err.problem.title;
  return 'Auswertung konnte nicht geladen werden.';
}

export function useReportQuery(pending: ReportRunInput): ReportQueryState {
  const [run, setRun] = useState<ReportRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Latest-Ref: `execute` behält eine stabile Identität und liest trotzdem
  // immer die aktuellen Filter.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const execute = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const input = pendingRef.current;
    setLoading(true);
    setError(null);

    const a = api.get<ReportAggregateResponse>(
      `/reports/aggregate?${input.queryA}`,
      controller.signal,
    );
    const b = input.queryB
      ? api.get<ReportAggregateResponse>(`/reports/aggregate?${input.queryB}`, controller.signal)
      : Promise.resolve(null);
    Promise.all([a, b])
      .then(([result, resultB]) => {
        if (controller.signal.aborted) return;
        setRun({ input, result, resultB });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setError(errorMessage(err));
      });
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const stale = run !== null && !sameInput(run.input, pending);
  return { run, loading, error, stale, execute };
}
