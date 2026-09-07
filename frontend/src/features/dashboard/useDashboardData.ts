/**
 * Daten-Hook für den gebündelten `/dashboard`-Load: Modul-weiter LRU-Cache
 * (Insertion-Order als Reihenfolge, `CACHE_MAX_ENTRIES` Einträge) macht einen
 * Zeitraum-/Granularitäts-Wechsel, zu dem schon einmal geladen wurde, sofort
 * sichtbar (kein Skeleton), während im Hintergrund neu geladen wird.
 *
 * AbortController: ein Key-Wechsel während eines offenen Requests bricht ihn
 * ab — nur die jüngste Antwort schreibt State/Cache.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, api } from '@/lib/api';
import type { DashboardResponse } from '@/lib/types';
import type { Granularity } from './chartUtils';

interface CacheEntry {
  data: DashboardResponse;
  servedAt: Date | null;
  fetchedAt: number;
}

// Modul-Ebene (nicht per Hook-Instanz) — überlebt Remounts der Seite.
// `Map`-Insertion-Order dient als LRU-Reihenfolge: ein Re-Set löscht den
// alten Eintrag zuerst, damit er ans Ende (= "zuletzt benutzt") rückt.
const cache = new Map<string, CacheEntry>();
const CACHE_MAX_ENTRIES = 12;

export function dashboardCacheKey(from: string, to: string, g: Granularity): string {
  return `${from}|${to}|${g}`;
}

export function clearDashboardCache(): void {
  cache.clear();
}

function setCacheEntry(key: string, entry: CacheEntry): void {
  cache.delete(key);
  cache.set(key, entry);
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.problem.detail ?? err.problem.title;
  return 'Konnte Daten nicht laden.';
}

function normalize(data: DashboardResponse): DashboardResponse {
  return { ...data, virtual_items: data.virtual_items ?? [] };
}

export interface DashboardData {
  data: DashboardResponse | null;
  servedAt: Date | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  retry: () => void;
}

export function useDashboardData(
  from: string,
  to: string,
  granularity: Granularity,
): DashboardData {
  const key = dashboardCacheKey(from, to, granularity);
  const [data, setData] = useState<DashboardResponse | null>(() => cache.get(key)?.data ?? null);
  const [servedAt, setServedAt] = useState<Date | null>(() => cache.get(key)?.servedAt ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // "Latest ref" — der Fehler-Zweig im Effekt braucht den AKTUELLEN
  // Daten-Stand (nicht den zum Effekt-Start erfassten), um zu entscheiden,
  // ob ein Fehler angezeigt oder verworfen wird.
  const dataRef = useRef(data);
  dataRef.current = data;

  const retry = useCallback(() => setRetryTick((t) => t + 1), []);

  useEffect(() => {
    const hit = cache.get(key);
    if (hit) {
      // Cache-Hit: sofort anzeigen, im Hintergrund trotzdem neu laden.
      setData(hit.data);
      setServedAt(hit.servedAt);
    }
    // Cache-Miss: vorhandene Daten (von einem anderen Key) stehen lassen.
    setRefreshing(true);
    setError(null);

    const controller = new AbortController();
    const params = new URLSearchParams({ granularity });
    if (from) params.set('from_at', from);
    if (to) params.set('to_at', to);

    api
      .getWithMeta<DashboardResponse>(`/dashboard?${params}`, controller.signal)
      .then(({ data: responseData, servedAt: responseServedAt }) => {
        if (controller.signal.aborted) return;
        const normalized = normalize(responseData);
        setCacheEntry(key, { data: normalized, servedAt: responseServedAt, fetchedAt: Date.now() });
        setData(normalized);
        setServedAt(responseServedAt);
        setRefreshing(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setRefreshing(false);
        if (dataRef.current === null) setError(errorMessage(err));
      });

    return () => controller.abort();
  }, [key, from, to, granularity, retryTick]);

  const loading = data === null && error === null;
  return { data, servedAt, loading, refreshing, error, retry };
}
