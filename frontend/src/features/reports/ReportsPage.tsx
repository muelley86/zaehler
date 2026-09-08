/**
 * Auswertungen — messstellen-übergreifende Verbrauchs-Summen.
 *
 * Gruppiert nach einer Dimension (Kostenstelle/Eigentümer/Standort/
 * Hauptstandort/Zählerart/Messstelle) über einen Zeitraum, optional je Bucket
 * oder gesamt, mit Perioden-Vergleich, CSV-Export und optionalem Diagramm.
 *
 * Die Seite lädt NICHT automatisch: Filter (oder eine gespeicherte Auswertung)
 * setzen, dann „Auswerten" — erst dann wird `/reports/aggregate` abgefragt
 * (`useReportQuery`). Gespeicherte Konfigurationen stehen ganz oben und sind
 * geteilt: alle laden, nur Admin speichert/löscht. Sichtbar für alle
 * angemeldeten Nutzer; Erfasser sehen nur ihre Messstellen (partial-Hinweis).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Play, RotateCcw, Save } from 'lucide-react';

import { useAuth } from '@/features/auth/auth-context';
import {
  Button,
  LargeTitle,
  MultiSelectDropdown,
  Pill,
  Section,
  Select,
  Switch,
} from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError, api } from '@/lib/api';
import { csvField } from '@/lib/csv';
import { TYPE_LABELS } from '@/lib/meterLabels';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import { enumCodec, setCodec, stringCodec, useStickyState } from '@/lib/useStickyState';
import type {
  MeasuringPointRead,
  MeterType,
  ReportConfigRead,
  ReportDimension,
  ReportGranularity,
  ReportPeriodKind,
} from '@/lib/types';
import { ComparePeriodFields, DATE_INPUT_CLASS } from './ComparePeriodFields';
import { ReportResults } from './ReportResults';
import { SavedReportsSection } from './SavedReportsSection';
import {
  DIMENSION_LABELS,
  GRANULARITY_LABELS,
  PERIOD_KIND_LABELS,
  buildAggregateQuery,
  comparisonCsvRows,
  diffRows,
  periodLabel,
  resolveComparePeriod,
  resolvePeriod,
  runBlocker,
} from './reportUtils';
import type { CompareKind, ComparisonPeriods } from './reportUtils';
import { useReportQuery } from './useReportQuery';
import type { ReportRunInput } from './useReportQuery';

const DIMENSIONS: ReportDimension[] = [
  'measuring_point',
  'kostenstelle',
  'owner',
  'location',
  'main_location',
  'meter_type',
];
const GRANULARITIES: ReportGranularity[] = ['total', 'day', 'week', 'month', 'year'];
const PERIOD_KINDS: ReportPeriodKind[] = [
  'current_year',
  'last_12_months',
  'current_month',
  'last_month',
  'all',
  'shared_range',
  'fixed',
];

// Session-Memory der Auswertungs-Filter („Filter merken"). Reports bleibt
// ausserhalb des geteilten Datumsbereichs — die Periode wird hier per-Seite
// gemerkt. Codecs als Modul-Consts → stabile Referenzen.
const FILTER_NS = 'filters.reports.';
const isNumber = (x: unknown): x is number => typeof x === 'number';
const isMeterType = (x: unknown): x is MeterType =>
  typeof x === 'string' && Object.prototype.hasOwnProperty.call(TYPE_LABELS, x);
const NUM_CODEC = setCodec<number>(isNumber);
const TYPE_CODEC = setCodec<MeterType>(isMeterType);
const DIMENSION_CODEC = enumCodec<ReportDimension>((x): x is ReportDimension =>
  DIMENSIONS.some((d) => d === x),
);
const GRANULARITY_CODEC = enumCodec<ReportGranularity>((x): x is ReportGranularity =>
  GRANULARITIES.some((g) => g === x),
);
const PERIOD_KIND_CODEC = enumCodec<ReportPeriodKind>((x): x is ReportPeriodKind =>
  PERIOD_KINDS.some((p) => p === x),
);

// Standardwerte der Seite — Referenz für „Filter zurücksetzen".
const DEFAULT_DIMENSION: ReportDimension = 'measuring_point';
const DEFAULT_GRANULARITY: ReportGranularity = 'total';
const DEFAULT_PERIOD_KIND: ReportPeriodKind = 'shared_range';
const DEFAULT_COMPARE_KIND: CompareKind = 'previous_year';

interface NumOption {
  id: number;
  label: string;
}

function numOptions(
  points: MeasuringPointRead[],
  pick: (p: MeasuringPointRead) => [number | null, string | null],
): NumOption[] {
  const map = new Map<number, string>();
  for (const p of points) {
    const [id, label] = pick(p);
    if (id != null) map.set(id, label ?? String(id));
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function downloadCsv(filename: string, rows: string[][]): void {
  // Semikolon-Delimiter + UTF-8-BOM für deutsches Excel (sonst Umlaut-Müll).
  const body = rows.map((r) => r.map(csvField).join(';')).join('\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const isDesktop = useIsDesktop();

  const [points, setPoints] = useState<MeasuringPointRead[]>([]);
  const [error, setError] = useState<string | null>(null);

  // „Filter merken": Reports merkt seine Arbeits-Filter je Seite (sessionStorage).
  // Der Zeitraum folgt per Default dem globalen Datumsbereich aus der Navigation
  // („Aktueller Zeitraum") — konsistent mit dem Dashboard, damit importierte
  // Historien nicht stumm aus einem abweichenden Seiten-Default fallen. Andere
  // periodKinds bleiben als bewusste Abwahl wählbar (seiteneigen gemerkt).
  const { rememberFilters, dateRange } = useFilterPrefs();
  const [dimension, setDimension] = useStickyState<ReportDimension>(
    FILTER_NS + 'dimension',
    'measuring_point',
    rememberFilters,
    DIMENSION_CODEC,
  );
  const [granularity, setGranularity] = useStickyState<ReportGranularity>(
    FILTER_NS + 'granularity',
    'total',
    rememberFilters,
    GRANULARITY_CODEC,
  );
  const [periodKind, setPeriodKind] = useStickyState<ReportPeriodKind>(
    FILTER_NS + 'periodKind',
    'shared_range',
    rememberFilters,
    PERIOD_KIND_CODEC,
  );
  const [customFrom, setCustomFrom] = useStickyState<string>(
    FILTER_NS + 'customFrom',
    '',
    rememberFilters,
    stringCodec,
  );
  const [customTo, setCustomTo] = useStickyState<string>(
    FILTER_NS + 'customTo',
    '',
    rememberFilters,
    stringCodec,
  );

  // Periode 2 des Vergleichs: Vorjahr (Default) | Vorperiode | frei (von/bis).
  const [compare, setCompare] = useState(false);
  const [compareKind, setCompareKind] = useState<CompareKind>(DEFAULT_COMPARE_KIND);
  const [compareFrom, setCompareFrom] = useState('');
  const [compareTo, setCompareTo] = useState('');

  const [measuringPointFilter, setMeasuringPointFilter] = useStickyState<Set<number>>(
    FILTER_NS + 'measuringPoint',
    new Set(),
    rememberFilters,
    NUM_CODEC,
  );
  const [mainLocationFilter, setMainLocationFilter] = useStickyState<Set<number>>(
    FILTER_NS + 'mainLocation',
    new Set(),
    rememberFilters,
    NUM_CODEC,
  );
  const [locationFilter, setLocationFilter] = useStickyState<Set<number>>(
    FILTER_NS + 'location',
    new Set(),
    rememberFilters,
    NUM_CODEC,
  );
  const [ownerFilter, setOwnerFilter] = useStickyState<Set<number>>(
    FILTER_NS + 'owner',
    new Set(),
    rememberFilters,
    NUM_CODEC,
  );
  const [kostenstelleFilter, setKostenstelleFilter] = useStickyState<Set<number>>(
    FILTER_NS + 'kostenstelle',
    new Set(),
    rememberFilters,
    NUM_CODEC,
  );
  const [typeFilter, setTypeFilter] = useStickyState<Set<MeterType>>(
    FILTER_NS + 'type',
    new Set(),
    rememberFilters,
    TYPE_CODEC,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [configs, setConfigs] = useState<ReportConfigRead[]>([]);

  const loadConfigs = useCallback(() => {
    api
      .get<ReportConfigRead[]>('/report-configs')
      .then(setConfigs)
      .catch(() => {
        /* Konfig-Liste ist optional — Fehler nicht hart anzeigen */
      });
  }, []);

  useEffect(() => {
    api
      .get<MeasuringPointRead[]>('/measuring-points')
      .then(setPoints)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
    loadConfigs();
  }, [loadConfigs]);

  const period = useMemo(() => {
    if (periodKind === 'fixed') return { from: customFrom || null, to: customTo || null };
    // „Aktueller Zeitraum" folgt dem globalen Datumsbereich aus der Navigation.
    if (periodKind === 'shared_range') {
      return { from: dateRange.from || null, to: dateRange.to || null };
    }
    return resolvePeriod(periodKind, new Date());
  }, [periodKind, customFrom, customTo, dateRange.from, dateRange.to]);

  // Periode 2 leitet sich aus Periode 1 ab (Vorjahr/Vorperiode) oder ist frei.
  const comparePeriod = useMemo(
    () => resolveComparePeriod(compareKind, period, compareFrom, compareTo),
    [compareKind, period, compareFrom, compareTo],
  );

  // Im Vergleichsmodus werden beide Perioden als Gesamt-Summe gegenübergestellt.
  const effGranularity: ReportGranularity = compare ? 'total' : granularity;

  const queryA = useMemo(
    () =>
      buildAggregateQuery({
        dimension,
        granularity: effGranularity,
        from: period.from,
        to: period.to,
        mainLocationIds: [...mainLocationFilter],
        locationIds: [...locationFilter],
        ownerIds: [...ownerFilter],
        kostenstellen: [...kostenstelleFilter],
        meterTypes: [...typeFilter],
        measuringPointIds: [...measuringPointFilter],
      }),
    [
      dimension,
      effGranularity,
      period,
      mainLocationFilter,
      locationFilter,
      ownerFilter,
      kostenstelleFilter,
      typeFilter,
      measuringPointFilter,
    ],
  );

  const queryB = useMemo(
    () =>
      compare
        ? buildAggregateQuery({
            dimension,
            granularity: 'total',
            from: comparePeriod.from,
            to: comparePeriod.to,
            mainLocationIds: [...mainLocationFilter],
            locationIds: [...locationFilter],
            ownerIds: [...ownerFilter],
            kostenstellen: [...kostenstelleFilter],
            meterTypes: [...typeFilter],
            measuringPointIds: [...measuringPointFilter],
          })
        : null,
    [
      compare,
      dimension,
      comparePeriod,
      mainLocationFilter,
      locationFilter,
      ownerFilter,
      kostenstelleFilter,
      typeFilter,
      measuringPointFilter,
    ],
  );

  // Anstehende Query aus den Live-Filtern — ausgeführt wird sie erst per Button.
  const pending = useMemo<ReportRunInput>(
    () => ({ queryA, queryB, dimension, granularity: effGranularity }),
    [queryA, queryB, dimension, effGranularity],
  );
  const { run, loading, error: runError, stale, execute } = useReportQuery(pending);
  const blocker = runBlocker({
    periodKind,
    customFrom,
    customTo,
    periodFrom: period.from,
    periodTo: period.to,
    compare,
    compareKind,
    compareFrom,
    compareTo,
  });

  const mainLocationOptions = useMemo(
    () => numOptions(points, (p) => [p.main_location_id, p.main_location_name]),
    [points],
  );
  const locationOptions = useMemo(
    () => numOptions(points, (p) => [p.location_id, p.location_name]),
    [points],
  );
  const ownerOptions = useMemo(
    () => numOptions(points, (p) => [p.current_owner_id, p.current_owner_name]),
    [points],
  );
  const measuringPointOptions = useMemo(
    () =>
      numOptions(points, (p) => [
        p.id,
        p.location_name ? `${p.name} · ${p.location_name}` : p.name,
      ]),
    [points],
  );
  const kostenstelleOptions = useMemo(
    () =>
      numOptions(points, (p) => [
        p.kostenstelle,
        p.kostenstelle != null ? String(p.kostenstelle) : null,
      ]),
    [points],
  );
  const typeOptions = useMemo(() => {
    const present = new Set(points.map((p) => p.type));
    return (['electricity', 'water', 'heating'] as MeterType[]).filter((t) => present.has(t));
  }, [points]);

  // Übernimmt nur die Filter — der Lauf bleibt beim Nutzer („Auswerten").
  const loadConfig = useCallback(
    (c: ReportConfigRead) => {
      setDimension(c.dimension);
      setGranularity(c.granularity);
      setPeriodKind(c.period_kind);
      setCustomFrom(c.from_date ?? '');
      setCustomTo(c.to_date ?? '');
      setCompare(false);
      const nums = (xs: (number | null)[]): Set<number> =>
        new Set(xs.filter((x): x is number => x != null));
      setMainLocationFilter(nums(c.filters.main_location_ids));
      setLocationFilter(nums(c.filters.location_ids));
      setOwnerFilter(nums(c.filters.owner_ids));
      setKostenstelleFilter(nums(c.filters.kostenstellen));
      setTypeFilter(new Set(c.filters.meter_types));
      // Alt-Configs kennen den Messstellen-Filter noch nicht.
      setMeasuringPointFilter(new Set(c.filters.measuring_point_ids ?? []));
      // Die useStickyState-Setter sind stabile useState-Dispatcher; eslint kennt
      // nur die eingebaute useState-Stabilität, daher hier explizit gelistet.
    },
    [
      setDimension,
      setGranularity,
      setPeriodKind,
      setCustomFrom,
      setCustomTo,
      setMainLocationFilter,
      setLocationFilter,
      setOwnerFilter,
      setKostenstelleFilter,
      setTypeFilter,
      setMeasuringPointFilter,
    ],
  );

  const saveConfig = useCallback(() => {
    const name = window.prompt('Name der Auswertung');
    if (!name) return;
    api
      .post<ReportConfigRead>('/report-configs', {
        name,
        dimension,
        granularity,
        period_kind: periodKind,
        from_date: periodKind === 'fixed' ? customFrom || null : null,
        to_date: periodKind === 'fixed' ? customTo || null : null,
        filters: {
          main_location_ids: [...mainLocationFilter],
          location_ids: [...locationFilter],
          owner_ids: [...ownerFilter],
          kostenstellen: [...kostenstelleFilter],
          meter_types: [...typeFilter],
          measuring_point_ids: [...measuringPointFilter],
        },
      })
      .then(() => loadConfigs())
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, [
    dimension,
    granularity,
    periodKind,
    customFrom,
    customTo,
    mainLocationFilter,
    locationFilter,
    ownerFilter,
    kostenstelleFilter,
    typeFilter,
    measuringPointFilter,
    loadConfigs,
  ]);

  const deleteConfig = useCallback(
    (c: ReportConfigRead) => {
      if (!window.confirm(`Auswertung „${c.name}" löschen?`)) return;
      api
        .delete<void>(`/report-configs/${c.id}`)
        .then(() => loadConfigs())
        .catch((err: unknown) => {
          if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
        });
    },
    [loadConfigs],
  );

  // Alles Angezeigte leitet sich aus dem AUSGEFÜHRTEN Lauf ab, nie aus den
  // Live-Filtern — sonst würde die Tabelle etwas anderes beschreiben als die
  // Zahlen darin.
  const comparison = useMemo(
    () => (run?.resultB ? diffRows(run.result.rows, run.resultB.rows) : null),
    [run],
  );
  // Spaltenköpfe des Vergleichs: die Zeiträume, die das Backend für den
  // ausgeführten Lauf zurückmeldet (A = Hauptzeitraum, B = Vergleich).
  const comparisonPeriods = useMemo<ComparisonPeriods | null>(
    () =>
      run?.resultB
        ? {
            a: periodLabel(run.result.from_date, run.result.to_date),
            b: periodLabel(run.resultB.from_date, run.resultB.to_date),
          }
        : null,
    [run],
  );
  const showPeriodCol = run !== null && run.resultB === null && run.input.granularity !== 'total';
  const groupHeader = run ? DIMENSION_LABELS[run.input.dimension] : '';
  const csvHref = run ? `/api/v1/reports/aggregate.csv?${run.input.queryA}` : null;

  const exportComparisonCsv = useCallback(() => {
    if (!comparison || !comparisonPeriods) return;
    downloadCsv('auswertung-vergleich.csv', comparisonCsvRows(comparison, comparisonPeriods));
  }, [comparison, comparisonPeriods]);

  const exportCsv = useCallback(() => {
    if (comparison) {
      exportComparisonCsv();
      return;
    }
    if (!csvHref) return;
    // Server liefert Content-Disposition: attachment -> Klick lädt herunter,
    // ohne die Seite zu verlassen.
    const a = document.createElement('a');
    a.href = csvHref;
    a.click();
  }, [comparison, exportComparisonCsv, csvHref]);

  // Badge am zugeklappten Filter-Panel: zeigt, wie viele Filter aktiv sind
  // (gleiche Pille wie im Dashboard).
  const activeFilterCount =
    measuringPointFilter.size +
    mainLocationFilter.size +
    locationFilter.size +
    ownerFilter.size +
    kostenstelleFilter.size +
    typeFilter.size;

  // „Filter zurücksetzen" stellt die GANZE Seite auf Standard — nicht nur die
  // kategorialen Filter. Ein ausgeführter Lauf bleibt stehen (Stale-Hinweis).
  const isDefaultFilters =
    dimension === DEFAULT_DIMENSION &&
    granularity === DEFAULT_GRANULARITY &&
    periodKind === DEFAULT_PERIOD_KIND &&
    customFrom === '' &&
    customTo === '' &&
    !compare &&
    compareKind === DEFAULT_COMPARE_KIND &&
    compareFrom === '' &&
    compareTo === '' &&
    activeFilterCount === 0;

  const resetFilters = () => {
    setDimension(DEFAULT_DIMENSION);
    setGranularity(DEFAULT_GRANULARITY);
    setPeriodKind(DEFAULT_PERIOD_KIND);
    setCustomFrom('');
    setCustomTo('');
    setCompare(false);
    setCompareKind(DEFAULT_COMPARE_KIND);
    setCompareFrom('');
    setCompareTo('');
    setMeasuringPointFilter(new Set());
    setTypeFilter(new Set());
    setKostenstelleFilter(new Set());
    setOwnerFilter(new Set());
    setMainLocationFilter(new Set());
    setLocationFilter(new Set());
  };

  const shownError = error ?? runError;

  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 space-y-5 p-4 pb-12 md:p-7">
        <LargeTitle title="Auswertungen" />

        <SavedReportsSection
          configs={configs}
          isAdmin={isAdmin}
          onLoad={loadConfig}
          onDelete={deleteConfig}
        />

        {shownError ? (
          <div className="rounded-card border-hairline border-danger/40 bg-danger/10 p-3 text-danger">
            {shownError}
          </div>
        ) : null}

        <Section header="Gruppierung">
          <div className="flex flex-wrap gap-2 p-3">
            {DIMENSIONS.map((d) => (
              <Pill key={d} active={dimension === d} onClick={() => setDimension(d)}>
                {DIMENSION_LABELS[d]}
              </Pill>
            ))}
          </div>
        </Section>

        <Section header="Zeitraum & Auflösung">
          <div className="space-y-3 p-3">
            <Select
              label="Zeitraum"
              value={periodKind}
              onChange={(e) => setPeriodKind(e.target.value as ReportPeriodKind)}
            >
              {PERIOD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PERIOD_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
            {periodKind === 'fixed' ? (
              <div className="flex flex-wrap gap-3">
                <label className="text-caption text-tertiary">
                  Von
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className={DATE_INPUT_CLASS}
                  />
                </label>
                <label className="text-caption text-tertiary">
                  Bis
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className={DATE_INPUT_CLASS}
                  />
                </label>
              </div>
            ) : null}

            {!compare ? (
              <div className="flex flex-wrap gap-2">
                {GRANULARITIES.map((g) => (
                  <Pill
                    key={g}
                    size="sm"
                    active={granularity === g}
                    onClick={() => setGranularity(g)}
                  >
                    {GRANULARITY_LABELS[g]}
                  </Pill>
                ))}
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              <span className="text-body-sm text-secondary">Zwei Perioden vergleichen</span>
              <Switch checked={compare} onChange={setCompare} ariaLabel="Vergleich" />
            </div>
            {compare ? (
              <ComparePeriodFields
                period={period}
                comparePeriod={comparePeriod}
                compareKind={compareKind}
                onKindChange={setCompareKind}
                compareFrom={compareFrom}
                compareTo={compareTo}
                onFromChange={setCompareFrom}
                onToChange={setCompareTo}
              />
            ) : null}
          </div>
        </Section>

        <Section header="Filter">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="reports-filter-panel"
            className="flex w-full items-center justify-between p-3 text-body-sm text-secondary"
          >
            <span className="flex items-center gap-2">
              <span>Messstellen eingrenzen</span>
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary-deep">
                  {activeFilterCount} aktiv
                </span>
              ) : null}
            </span>
            <span className="text-tertiary">{filtersOpen ? '▲' : '▼'}</span>
          </button>
          {filtersOpen ? (
            <div id="reports-filter-panel" className="space-y-3 border-t border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                {measuringPointOptions.length > 0 ? (
                  <MultiSelectDropdown
                    label="Messstellen"
                    options={measuringPointOptions.map((o) => ({ value: o.id, label: o.label }))}
                    selected={measuringPointFilter}
                    onChange={setMeasuringPointFilter}
                  />
                ) : null}
                {typeOptions.length > 0 ? (
                  <MultiSelectDropdown
                    label="Zählerart"
                    options={typeOptions.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
                    selected={typeFilter}
                    onChange={setTypeFilter}
                  />
                ) : null}
                {kostenstelleOptions.length > 0 ? (
                  <MultiSelectDropdown
                    label="Kostenstelle"
                    options={kostenstelleOptions.map((o) => ({ value: o.id, label: o.label }))}
                    selected={kostenstelleFilter}
                    onChange={setKostenstelleFilter}
                  />
                ) : null}
                {ownerOptions.length > 0 ? (
                  <MultiSelectDropdown
                    label="Eigentümer"
                    options={ownerOptions.map((o) => ({ value: o.id, label: o.label }))}
                    selected={ownerFilter}
                    onChange={setOwnerFilter}
                  />
                ) : null}
                {mainLocationOptions.length > 0 ? (
                  <MultiSelectDropdown
                    label="Hauptstandort"
                    options={mainLocationOptions.map((o) => ({ value: o.id, label: o.label }))}
                    selected={mainLocationFilter}
                    onChange={setMainLocationFilter}
                  />
                ) : null}
                {locationOptions.length > 0 ? (
                  <MultiSelectDropdown
                    label="Standort"
                    options={locationOptions.map((o) => ({ value: o.id, label: o.label }))}
                    selected={locationFilter}
                    onChange={setLocationFilter}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </Section>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="filled"
              size="sm"
              leftIcon={
                loading ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                  <Play size={16} />
                )
              }
              disabled={loading || blocker !== null}
              onClick={execute}
            >
              Auswerten
            </Button>
            <Button
              variant="bordered"
              size="sm"
              leftIcon={<RotateCcw size={16} />}
              disabled={isDefaultFilters}
              onClick={resetFilters}
            >
              Filter zurücksetzen
            </Button>
            {blocker ? (
              <span role="status" className="text-caption text-warning">
                {blocker}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="bordered"
              size="sm"
              leftIcon={<Download size={16} />}
              disabled={run === null}
              onClick={exportCsv}
            >
              CSV
            </Button>
            {isAdmin ? (
              <Button variant="tinted" size="sm" leftIcon={<Save size={16} />} onClick={saveConfig}>
                Speichern
              </Button>
            ) : null}
          </div>
        </div>

        {run?.result.partial ? (
          <div className="rounded-card border-hairline border-warning/40 bg-warning/10 p-3 text-body-sm text-secondary">
            Als Erfasser werden nur Messstellen mit Zugriff einbezogen — die Summen können
            unvollständig sein.
          </div>
        ) : null}

        <ReportResults
          run={run}
          loading={loading}
          stale={stale}
          comparison={comparison}
          comparisonPeriods={comparisonPeriods}
          showPeriodCol={showPeriodCol}
          groupHeader={groupHeader}
          compact={!isDesktop}
        />
      </div>
    </div>
  );
}
