/**
 * Globale View-Controls (Granularität + Diagrammtyp) für das Dashboard:
 * folgen dem Default (abgeleitet aus Zeitraum bzw. Granularität), solange
 * der Nutzer nichts explizit gewählt hat — danach bleibt die Wahl in
 * localStorage gemerkt (`dashboard.granularity`/`dashboard.chartType`,
 * unverändert aus `chartUtils.ts`).
 */

import { useCallback, useState } from 'react';

import {
  clearChartType,
  clearGranularity,
  defaultChartType,
  defaultGranularity,
  loadChartType,
  loadGranularity,
  saveChartType,
  saveGranularity,
  type ChartType,
  type Granularity,
} from './chartUtils';

export type PrefMode = 'auto' | 'manual';

export interface ChartPrefs {
  granularity: Granularity;
  granularityMode: PrefMode;
  chartType: ChartType;
  chartTypeMode: PrefMode;
  /** Der Wert, der im Auto-Modus gälte — auch bei manueller Wahl bekannt (UI-Beschriftung). */
  autoGranularity: Granularity;
  /** Der Wert, der im Auto-Modus gälte — abgeleitet aus der AKTUELLEN Granularität. */
  autoChartType: ChartType;
  /** `null` = „Automatisch" — löscht die gemerkte Wahl (`clearGranularity`). */
  setGranularity: (g: Granularity | null) => void;
  /** `null` = „Automatisch" — löscht die gemerkte Wahl (`clearChartType`). */
  setChartType: (t: ChartType | null) => void;
}

export function useChartPrefs(from: string, to: string): ChartPrefs {
  const [storedGranularity, setStoredGranularity] = useState<Granularity | null>(loadGranularity);
  const [storedChartType, setStoredChartType] = useState<ChartType | null>(loadChartType);

  const autoGranularity = defaultGranularity(from, to);
  const granularity = storedGranularity ?? autoGranularity;
  // Bewusst aus der EFFEKTIVEN Granularität abgeleitet: der Auto-Diagrammtyp
  // soll zu dem passen, was gerade im Chart steht.
  const autoChartType = defaultChartType(granularity);
  const chartType = storedChartType ?? autoChartType;

  const setGranularity = useCallback((g: Granularity | null) => {
    if (g === null) {
      clearGranularity();
      setStoredGranularity(null);
    } else {
      saveGranularity(g);
      setStoredGranularity(g);
    }
  }, []);

  const setChartType = useCallback((t: ChartType | null) => {
    if (t === null) {
      clearChartType();
      setStoredChartType(null);
    } else {
      saveChartType(t);
      setStoredChartType(t);
    }
  }, []);

  return {
    granularity,
    granularityMode: storedGranularity !== null ? 'manual' : 'auto',
    chartType,
    chartTypeMode: storedChartType !== null ? 'manual' : 'auto',
    autoGranularity,
    autoChartType,
    setGranularity,
    setChartType,
  };
}
