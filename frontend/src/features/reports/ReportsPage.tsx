/**
 * Auswertungen — messstellen-übergreifende Verbrauchs-Summen.
 *
 * Gruppiert nach einer Dimension (Kostenstelle/Eigentümer/Standort/
 * Hauptstandort/Zählerart) über einen Zeitraum, optional je Bucket oder gesamt,
 * mit Perioden-Vergleich und CSV-Export. Gespeicherte Konfigurationen sind
 * geteilt: alle laden/ausführen, nur Admin speichert/löscht. Sichtbar für alle
 * angemeldeten Nutzer; Erfasser sehen nur ihre Messstellen (partial-Hinweis).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Save, Trash2 } from 'lucide-react';

import { useAuth } from '@/features/auth/auth-context';
import {
  Button,
  EmptyState,
  LargeTitle,
  MultiSelectDropdown,
  Pill,
  Section,
  Select,
  Switch,
} from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError, api } from '@/lib/api';
import { formatDe } from '@/lib/format';
import { TYPE_LABELS } from '@/lib/meterLabels';
import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import { enumCodec, setCodec, stringCodec, useStickyState } from '@/lib/useStickyState';
import type {
  MeasuringPointRead,
  MeterType,
  ReportAggregateResponse,
  ReportConfigRead,
  ReportDimension,
  ReportGranularity,
  ReportPeriodKind,
  ReportRow,
} from '@/lib/types';
import {
  DIMENSION_LABELS,
  GRANULARITY_LABELS,
  PERIOD_KIND_LABELS,
  buildAggregateQuery,
  diffRows,
  directionSuffix,
  groupsWithEinspeisung,
  resolvePeriod,
} from './reportUtils';
import type { ComparisonRow } from './reportUtils';

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

function csvField(value: string): string {
  // Schutz gegen CSV-Formel-Injection in Excel/Calc: Werte, die mit ``=``,
  // ``+``, ``-`` oder ``@`` beginnen, werden mit einem Apostroph prefixed.
  let safe = value;
  if (/^[=+\-@]/.test(safe)) {
    safe = `'${safe}`;
  }
  if (/[;"\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
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

  const [compare, setCompare] = useState(false);
  const [compareFrom, setCompareFrom] = useState('');
  const [compareTo, setCompareTo] = useState('');

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

  const [result, setResult] = useState<ReportAggregateResponse | null>(null);
  const [resultB, setResultB] = useState<ReportAggregateResponse | null>(null);
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
    ],
  );

  const queryB = useMemo(
    () =>
      compare
        ? buildAggregateQuery({
            dimension,
            granularity: 'total',
            from: compareFrom || null,
            to: compareTo || null,
            mainLocationIds: [...mainLocationFilter],
            locationIds: [...locationFilter],
            ownerIds: [...ownerFilter],
            kostenstellen: [...kostenstelleFilter],
            meterTypes: [...typeFilter],
          })
        : null,
    [
      compare,
      dimension,
      compareFrom,
      compareTo,
      mainLocationFilter,
      locationFilter,
      ownerFilter,
      kostenstelleFilter,
      typeFilter,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    const aPromise = api.get<ReportAggregateResponse>(`/reports/aggregate?${queryA}`);
    const bPromise = queryB
      ? api.get<ReportAggregateResponse>(`/reports/aggregate?${queryB}`)
      : Promise.resolve(null);
    Promise.all([aPromise, bPromise])
      .then(([a, b]) => {
        if (cancelled) return;
        setResult(a);
        setResultB(b);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
    return () => {
      cancelled = true;
    };
  }, [queryA, queryB]);

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

  const comparison = useMemo(
    () => (compare && result && resultB ? diffRows(result.rows, resultB.rows) : null),
    [compare, result, resultB],
  );

  const showPeriodCol = !compare && granularity !== 'total';
  const csvHref = `/api/v1/reports/aggregate.csv?${queryA}`;

  const exportComparisonCsv = useCallback(() => {
    if (!comparison) return;
    const rows: string[][] = [
      ['Gruppe', 'Zählerart', 'Richtung', 'Einheit', 'Aktuell', 'Vergleich', 'Differenz'],
    ];
    for (const r of comparison) {
      rows.push([
        r.group_label,
        TYPE_LABELS[r.meter_type],
        r.direction === 'einspeisung' ? 'Einspeisung' : 'Bezug',
        r.unit,
        // Komma-Dezimal für deutsches Excel.
        String(r.a).replace('.', ','),
        String(r.b).replace('.', ','),
        String(r.delta).replace('.', ','),
      ]);
    }
    downloadCsv('auswertung-vergleich.csv', rows);
  }, [comparison]);

  const exportCsv = useCallback(() => {
    if (compare) {
      exportComparisonCsv();
      return;
    }
    // Server liefert Content-Disposition: attachment -> Klick lädt herunter,
    // ohne die Seite zu verlassen.
    const a = document.createElement('a');
    a.href = csvHref;
    a.click();
  }, [compare, exportComparisonCsv, csvHref]);

  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 space-y-5 p-4 pb-12 md:p-7">
        <LargeTitle title="Auswertungen" />

        {error ? (
          <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
            {error}
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
                    className="ml-2 rounded-lg border-hairline border-border bg-fill px-2 py-1 text-label"
                  />
                </label>
                <label className="text-caption text-tertiary">
                  Bis
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="ml-2 rounded-lg border-hairline border-border bg-fill px-2 py-1 text-label"
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
              <div className="flex flex-wrap gap-3">
                <label className="text-caption text-tertiary">
                  Vergleich von
                  <input
                    type="date"
                    value={compareFrom}
                    onChange={(e) => setCompareFrom(e.target.value)}
                    className="ml-2 rounded-lg border-hairline border-border bg-fill px-2 py-1 text-label"
                  />
                </label>
                <label className="text-caption text-tertiary">
                  bis
                  <input
                    type="date"
                    value={compareTo}
                    onChange={(e) => setCompareTo(e.target.value)}
                    className="ml-2 rounded-lg border-hairline border-border bg-fill px-2 py-1 text-label"
                  />
                </label>
              </div>
            ) : null}
          </div>
        </Section>

        <Section header="Filter">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex w-full items-center justify-between p-3 text-body-sm text-secondary"
          >
            <span>Messstellen eingrenzen</span>
            <span className="text-tertiary">{filtersOpen ? '▲' : '▼'}</span>
          </button>
          {filtersOpen ? (
            <div className="space-y-3 border-t border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
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
              {typeFilter.size ||
              kostenstelleFilter.size ||
              ownerFilter.size ||
              mainLocationFilter.size ||
              locationFilter.size ? (
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter(new Set());
                    setKostenstelleFilter(new Set());
                    setOwnerFilter(new Set());
                    setMainLocationFilter(new Set());
                    setLocationFilter(new Set());
                  }}
                  className="text-caption font-semibold text-primary"
                >
                  Filter zurücksetzen
                </button>
              ) : null}
            </div>
          ) : null}
        </Section>

        {result?.partial ? (
          <div className="border-warning/40 bg-warning/10 rounded-card border-hairline p-3 text-body-sm text-secondary">
            Als Erfasser werden nur Messstellen mit Zugriff einbezogen — die Summen können
            unvollständig sein.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="bordered"
            size="sm"
            leftIcon={<Download size={16} />}
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

        {comparison ? (
          <ComparisonTable rows={comparison} groupHeader={DIMENSION_LABELS[dimension]} />
        ) : (
          <ResultTable
            rows={result?.rows ?? []}
            showPeriod={showPeriodCol}
            groupHeader={DIMENSION_LABELS[dimension]}
          />
        )}

        {configs.length > 0 ? (
          <Section header="Gespeicherte Auswertungen">
            <ul className="divide-y divide-border">
              {configs.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => loadConfig(c)}
                    className="flex-1 text-left text-body-sm text-label"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-caption text-tertiary">
                      {DIMENSION_LABELS[c.dimension]} · {GRANULARITY_LABELS[c.granularity]} ·{' '}
                      {PERIOD_KIND_LABELS[c.period_kind]}
                    </span>
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      aria-label={`„${c.name}" löschen`}
                      onClick={() => deleteConfig(c)}
                      className="text-tertiary hover:text-danger"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function ResultTable({
  rows,
  showPeriod,
  groupHeader,
}: {
  rows: ReportRow[];
  showPeriod: boolean;
  groupHeader: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={32} />}
        title="Keine Daten"
        description="Für die gewählte Konfiguration gibt es keine Verbrauchswerte."
      />
    );
  }
  const bidiGroups = groupsWithEinspeisung(rows);
  return (
    <Section>
      <table className="w-full text-body-sm">
        <thead className="text-caption-bold uppercase text-tertiary">
          <tr className="border-b border-border">
            <th className="p-2 text-left">{groupHeader}</th>
            <th className="p-2 text-left">Zählerart</th>
            {showPeriod ? <th className="p-2 text-left">Periode</th> : null}
            <th className="p-2 text-right">Verbrauch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const suffix = directionSuffix(r, bidiGroups);
            return (
              <tr
                key={`${r.group_key}-${r.meter_type}-${r.unit}-${r.direction}-${r.period_end ?? ''}`}
                className="border-border/50 border-b"
              >
                <td className="p-2 text-label">
                  {r.group_label}
                  {suffix ? <span className="text-secondary"> · {suffix}</span> : null}
                </td>
                <td className="p-2 text-secondary">{TYPE_LABELS[r.meter_type]}</td>
                {showPeriod ? <td className="p-2 text-secondary">{r.period_end ?? ''}</td> : null}
                <td className="p-2 text-right tabular-nums text-label">
                  {formatDe(r.consumption)} {r.unit}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

function ComparisonTable({ rows, groupHeader }: { rows: ComparisonRow[]; groupHeader: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={32} />}
        title="Keine Daten"
        description="Für den Vergleich gibt es keine Verbrauchswerte."
      />
    );
  }
  const bidiGroups = groupsWithEinspeisung(rows);
  return (
    <Section>
      <table className="w-full text-body-sm">
        <thead className="text-caption-bold uppercase text-tertiary">
          <tr className="border-b border-border">
            <th className="p-2 text-left">{groupHeader}</th>
            <th className="p-2 text-left">Art</th>
            <th className="p-2 text-right">Aktuell</th>
            <th className="p-2 text-right">Vergleich</th>
            <th className="p-2 text-right">Δ</th>
            <th className="p-2 text-right">Δ %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const suffix = directionSuffix(r, bidiGroups);
            return (
              <tr key={r.key} className="border-border/50 border-b">
                <td className="p-2 text-label">
                  {r.group_label}
                  {suffix ? <span className="text-secondary"> · {suffix}</span> : null}
                </td>
                <td className="p-2 text-secondary">
                  {TYPE_LABELS[r.meter_type]} ({r.unit})
                </td>
                <td className="p-2 text-right tabular-nums">{formatDe(r.a)}</td>
                <td className="p-2 text-right tabular-nums">{formatDe(r.b)}</td>
                <td className="p-2 text-right tabular-nums">{formatDe(r.delta)}</td>
                <td className="p-2 text-right tabular-nums text-secondary">
                  {r.pct === null ? '—' : `${formatDe(r.pct, { maximumFractionDigits: 1 })} %`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}
