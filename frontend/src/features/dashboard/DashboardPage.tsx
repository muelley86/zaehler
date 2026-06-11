import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Filter, Loader2, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  Button,
  Card,
  EmptyState,
  LargeTitle,
  MultiSelectDropdown,
  Pill,
  Section,
} from '@/components/ui';
import type { DropdownOption } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError, api } from '@/lib/api';
import { formatDateDe, formatDe } from '@/lib/format';
import type {
  ConsumptionPoint,
  DashboardResponse,
  DashboardVirtualMeasuringPoint,
  LocationRead,
  MeasuringPointRead,
  MeterType,
} from '@/lib/types';
import { TYPE_LABELS, TYPE_ORDER } from '@/lib/meterLabels';
import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import { setCodec, useStickyState } from '@/lib/useStickyState';
import { ComparisonChart } from './ComparisonChart';
import { buildComparisonGroups } from './comparisonSeries';
import {
  defaultGranularity,
  loadChartType,
  loadGranularity,
  saveChartType,
  saveGranularity,
  type ChartType,
  type Granularity,
} from './chartUtils';

// Globale View-Control-Optionen (Label-Tupel) als Modul-Consts.
const GRANULARITY_OPTIONS: ReadonlyArray<[Granularity, string]> = [
  ['day', 'Tag'],
  ['week', 'Woche'],
  ['month', 'Monat'],
  ['year', 'Jahr'],
];
const CHART_TYPE_OPTIONS: ReadonlyArray<[ChartType, string]> = [
  ['line', 'Linie'],
  ['bar', 'Balken'],
  ['area', 'Fläche'],
];

// Über dieser Serienzahl wird ein nicht-blockierender Hinweis eingeblendet, die
// Auswahl (z. B. über den Messstellen-Filter) einzugrenzen — sehr viele Linien
// werden sonst unleserlich.
const MAX_SERIES_HINT = 25;

const FILTERS_EXPANDED_KEY = 'dashboard.filtersExpanded';

// Session-Memory der Dashboard-Filter („Filter merken"). Namespace + Codecs als
// Modul-Consts → stabile Referenzen. ID-Sets enthalten `null` (= „ohne …").
const FILTER_NS = 'filters.dashboard.';
const isIdMember = (x: unknown): x is number | null => x === null || typeof x === 'number';
const isMeterType = (x: unknown): x is MeterType =>
  typeof x === 'string' && Object.prototype.hasOwnProperty.call(TYPE_LABELS, x);
const ID_CODEC = setCodec<number | null>(isIdMember);
const TYPE_CODEC = setCodec<MeterType>(isMeterType);

function loadFiltersExpanded(): boolean {
  try {
    return window.localStorage.getItem(FILTERS_EXPANDED_KEY) === '1';
  } catch {
    return false;
  }
}

function saveFiltersExpanded(open: boolean): void {
  try {
    window.localStorage.setItem(FILTERS_EXPANDED_KEY, open ? '1' : '0');
  } catch {
    /* non-fatal */
  }
}

interface ConsumptionsByMP {
  [mpId: number]: ConsumptionPoint[];
}

export function DashboardPage() {
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [, setLocations] = useState<LocationRead[]>([]);
  const [consumptions, setConsumptions] = useState<ConsumptionsByMP>({});
  // Verrechnete Messstellen aus dem gebündelten Dashboard-Load (optional —
  // ältere Backend-Stände liefern das Feld nicht).
  const [virtualItems, setVirtualItems] = useState<DashboardVirtualMeasuringPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Wird `true`, sobald der gebündelte Dashboard-Load fertig ist. Bis dahin
  // zeigen wir Skeletons, damit beim Cutover möglichst wenig wandert (CLS).
  const [mpDataReady, setMpDataReady] = useState(false);
  // Läuft, solange der gebündelte Dashboard-Request offen ist — gibt sichtbares
  // Feedback beim Zeitraum-/Granularitäts-Wechsel, statt die alten Charts
  // kommentarlos stehen zu lassen, bis die Antwort da ist.
  const [refreshing, setRefreshing] = useState(false);

  // „Filter merken": wenn aktiv, werden die kategorialen Filter je Seite in
  // sessionStorage gespiegelt; sonst verhalten sie sich wie normales useState.
  const { rememberFilters, dateRange } = useFilterPrefs();
  const [locationFilter, setLocationFilter] = useStickyState<Set<number | null>>(
    FILTER_NS + 'location',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );
  const [mainLocationFilter, setMainLocationFilter] = useStickyState<Set<number | null>>(
    FILTER_NS + 'mainLocation',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );
  const [ownerFilter, setOwnerFilter] = useStickyState<Set<number | null>>(
    FILTER_NS + 'owner',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );
  const [typeFilter, setTypeFilter] = useStickyState<Set<MeterType>>(
    FILTER_NS + 'type',
    new Set(),
    rememberFilters,
    TYPE_CODEC,
  );
  // Messstellen-Filter: gezielt einzelne Messstellen für den Vergleich wählen.
  // Kaskadiert zu den anderen vier Filtern (die Optionen unten respektieren sie).
  const [measuringPointFilter, setMeasuringPointFilter] = useStickyState<Set<number | null>>(
    FILTER_NS + 'measuringPoint',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );
  // Eigener Filter für verrechnete Messstellen — getrennter ID-Namensraum,
  // darf nicht mit dem Messstellen-Set kollidieren. Leer = alle anzeigen.
  const [virtualFilter, setVirtualFilter] = useStickyState<Set<number | null>>(
    FILTER_NS + 'virtual',
    new Set(),
    rememberFilters,
    ID_CODEC,
  );
  // Der Datumsbereich kommt global aus dem FilterPrefsContext (Navigation);
  // `from`/`to` bleiben lokale Aliase, damit alle abhängigen Effekte/Helfer
  // (Granularitäts-Default, /dashboard-Load, CSV) unverändert weiterlaufen.
  const currentYear = new Date().getFullYear();
  const from = dateRange.from;
  const to = dateRange.to;

  // Globale View-Controls (gelten für alle Charts + CSV): Diagrammtyp und
  // Aggregations-Granularität, beide in localStorage gemerkt.
  const [chartType, setChartType] = useState<ChartType>(() => loadChartType());
  const [granularity, setGranularity] = useState<Granularity>(
    () => loadGranularity() ?? defaultGranularity(`${currentYear}-01-01`, `${currentYear}-12-31`),
  );
  // Solange der Nutzer die Granularität nicht selbst gewählt hat, folgt sie
  // automatisch dem Zeitraum.
  const granularityTouched = useRef(loadGranularity() !== null);

  const pickChartType = useCallback((t: ChartType) => {
    saveChartType(t);
    setChartType(t);
  }, []);
  const pickGranularity = useCallback((g: Granularity) => {
    granularityTouched.current = true;
    saveGranularity(g);
    setGranularity(g);
  }, []);

  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(() => loadFiltersExpanded());
  const toggleFilters = useCallback(() => {
    setFiltersExpanded((prev) => {
      const next = !prev;
      saveFiltersExpanded(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!granularityTouched.current) setGranularity(defaultGranularity(from, to));
  }, [from, to]);

  useEffect(() => {
    Promise.all([
      api.get<MeasuringPointRead[]>('/measuring-points'),
      api.get<LocationRead[]>('/locations'),
    ])
      .then(([mps, locs]) => {
        setPoints(mps);
        setLocations(locs);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
        else setError('Konnte Daten nicht laden.');
      });
  }, []);

  // Gebündelter Dashboard-Load: Verbrauch (+ Readings/Bestand, hier ungenutzt)
  // aller (zugänglichen) Messstellen in EINEM Request (`GET /dashboard`) statt
  // Fan-out je MP — sonst hunderte Roundtrips, die auf schwacher Hardware
  // (LXC) das Dashboard minutenlang „einfrieren" lassen. Lädt neu bei
  // Zeitraum-/Granularitäts-Wechsel.
  // AbortController: ein neuer Wechsel bricht den offenen Request ab, nur das
  // jüngste Ergebnis zählt; `refreshing` gibt sichtbares Lade-Feedback.
  useEffect(() => {
    const controller = new AbortController();
    setRefreshing(true);
    const params = new URLSearchParams({ granularity });
    if (from) params.set('from_at', from);
    if (to) params.set('to_at', to);
    api
      .get<DashboardResponse>(`/dashboard?${params}`, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const cById: ConsumptionsByMP = {};
        for (const item of data.items) {
          cById[item.measuring_point_id] = item.consumption;
        }
        setConsumptions(cById);
        setVirtualItems(data.virtual_items ?? []);
        setMpDataReady(true);
        setRefreshing(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRefreshing(false);
      });
    return () => controller.abort();
  }, [from, to, granularity]);

  // Die vier kategorialen Basis-Filter (Hauptstandort/Eigentümer/Standort/Typ).
  // Der Messstellen-Filter setzt darauf auf — deshalb hier separat, damit die
  // Messstellen-Optionen mit den Basis-Filtern kaskadieren können.
  const matchesBaseFilters = useCallback(
    (mp: MeasuringPointRead) => {
      if (mainLocationFilter.size > 0 && !mainLocationFilter.has(mp.main_location_id)) return false;
      if (ownerFilter.size > 0 && !ownerFilter.has(mp.current_owner_id)) return false;
      if (locationFilter.size > 0 && !locationFilter.has(mp.location_id)) return false;
      if (typeFilter.size > 0 && !typeFilter.has(mp.type)) return false;
      return true;
    },
    [mainLocationFilter, ownerFilter, locationFilter, typeFilter],
  );

  const filteredPoints = useMemo(() => {
    if (!points) return [];
    return points.filter(
      (mp) =>
        matchesBaseFilters(mp) &&
        (measuringPointFilter.size === 0 || measuringPointFilter.has(mp.id)),
    );
  }, [points, matchesBaseFilters, measuringPointFilter]);

  // Verbrauch ist bereits Backend-seitig auf den Zeitraum gefiltert; hier nur
  // noch nach den kategorialen MP-Filtern einschränken (für CSV + Summen-Tiles).
  const filteredConsumption = useMemo(() => {
    const out: Array<ConsumptionPoint & { mp: MeasuringPointRead }> = [];
    for (const mp of filteredPoints) {
      for (const p of consumptions[mp.id] ?? []) out.push({ ...p, mp });
    }
    return out;
  }, [filteredPoints, consumptions]);

  // Verrechnete Messstellen: respektieren Zählerart- und eigenen vmp-Filter.
  // Die übrigen kategorialen Filter (Standort/Eigentümer) greifen nicht —
  // virtuelle Messstellen haben diese Attribute nicht.
  const filteredVirtual = useMemo(
    () =>
      virtualItems.filter(
        (v) =>
          (typeFilter.size === 0 || typeFilter.has(v.type)) &&
          (virtualFilter.size === 0 || virtualFilter.has(v.id)),
      ),
    [virtualItems, typeFilter, virtualFilter],
  );

  // Vergleichs-Serien: eine Serie je Messstelle (bidirektionaler Strom getrennt
  // nach Bezug/Einspeisung), gruppiert nach (Zählerart, Einheit). Verrechnete
  // Messstellen erscheinen als zusätzliche Netto-Serien.
  const comparisonGroups = useMemo(
    () => buildComparisonGroups({ filteredPoints, consumptions, virtualItems: filteredVirtual }),
    [filteredPoints, consumptions, filteredVirtual],
  );
  const totalSeries = useMemo(
    () => comparisonGroups.reduce((n, g) => n + g.seriesKeys.length, 0),
    [comparisonGroups],
  );

  const locationOptions = useMemo(() => {
    const map = new Map<number | null, string>();
    points?.forEach((mp) => {
      if (mp.location_id !== null && !map.has(mp.location_id)) {
        map.set(mp.location_id, mp.location_name ?? `#${mp.location_id}`);
      }
    });
    return Array.from(map.entries());
  }, [points]);

  const mainLocationOptions = useMemo(() => {
    const map = new Map<number, string>();
    points?.forEach((mp) => {
      if (mp.main_location_id !== null && !map.has(mp.main_location_id)) {
        map.set(mp.main_location_id, mp.main_location_name ?? `#${mp.main_location_id}`);
      }
    });
    return Array.from(map.entries());
  }, [points]);

  const ownerOptions = useMemo(() => {
    const map = new Map<number, string>();
    points?.forEach((mp) => {
      if (mp.current_owner_id !== null && !map.has(mp.current_owner_id)) {
        map.set(mp.current_owner_id, mp.current_owner_name ?? `#${mp.current_owner_id}`);
      }
    });
    return Array.from(map.entries());
  }, [points]);

  // Messstellen-Optionen kaskadieren: nur Messstellen, die zu den vier
  // Basis-Filtern passen, stehen zur Wahl.
  const measuringPointOptions = useMemo<DropdownOption<number | null>[]>(() => {
    if (!points) return [];
    return points.filter(matchesBaseFilters).map((mp) => ({ value: mp.id, label: mp.name }));
  }, [points, matchesBaseFilters]);

  function downloadCsv() {
    const header = [
      'Messstelle',
      'Hauptstandort',
      'Eigentümer',
      'Kostenstelle',
      'Zählerstandort',
      'Einbauort',
      'Typ',
      'OBIS',
      'Einheit',
      'Periode_von',
      'Periode_bis',
      'Verbrauch',
    ];
    const lines = [header.join(';')];
    // CSV bleibt absichtlich pro OBIS-Register (reicher als der summierte
    // Vergleichs-Chart) — eine Zeile je Verbrauchspunkt.
    for (const p of filteredConsumption) {
      lines.push(
        [
          p.mp.name,
          p.mp.main_location_name ?? '',
          p.mp.current_owner_name ?? '',
          p.mp.kostenstelle != null ? String(p.mp.kostenstelle) : '',
          p.mp.location_name ?? '',
          p.mp.installation_location ?? '',
          p.mp.type,
          p.obis_code,
          p.unit,
          formatDateDe(p.period_start),
          formatDateDe(p.period_end),
          p.consumption.replace('.', ','),
        ]
          .map(csvField)
          .join(';'),
      );
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Zeitraum im Dateinamen macht den Filter-Effekt sichtbar — wenn beide
    // Endpunkte gesetzt sind (Default seit v2.17.0: laufendes Jahr), nutzen
    // wir sie; sonst Fallback auf heutiges Datum.
    const rangeSuffix = from && to ? `${from}_${to}` : new Date().toISOString().slice(0, 10);
    a.download = `verbrauch_${rangeSuffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <PageContainer>
        <LargeTitle title="Dashboard" />
        <Card>
          <div className="text-danger">{error}</div>
        </Card>
      </PageContainer>
    );
  }
  if (!points) {
    return (
      <PageContainer>
        <LargeTitle title="Dashboard" />
        <DashboardSkeleton />
      </PageContainer>
    );
  }
  if (points.length === 0) {
    return (
      <PageContainer>
        <LargeTitle title="Dashboard" />
        <EmptyState
          icon={<Plus size={32} />}
          title="Noch keine Messstellen"
          description="Lege deine erste Strom-, Gas- oder Wasser-Messstelle an."
          action={
            <Link to="/admin/messstellen">
              <Button variant="filled" leftIcon={<Plus size={16} />}>
                Messstelle anlegen
              </Button>
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const activeFilterCount =
    mainLocationFilter.size +
    ownerFilter.size +
    locationFilter.size +
    typeFilter.size +
    measuringPointFilter.size +
    virtualFilter.size;

  return (
    <PageContainer>
      <LargeTitle
        title="Dashboard"
        trailing={
          <Button
            variant="tinted"
            size="sm"
            leftIcon={<Download size={14} />}
            onClick={downloadCsv}
            disabled={filteredConsumption.length === 0}
          >
            CSV ({filteredConsumption.length})
          </Button>
        }
      />

      <Section header="Ansicht">
        <div className="space-y-4 p-5">
          <FilterRow label="Aggregation">
            {GRANULARITY_OPTIONS.map(([g, label]) => (
              <Pill key={g} active={granularity === g} onClick={() => pickGranularity(g)}>
                {label}
              </Pill>
            ))}
            {refreshing ? (
              <span
                className="ml-1 flex items-center gap-1.5 text-caption text-tertiary"
                role="status"
                aria-live="polite"
              >
                <Loader2 size={14} className="animate-spin" />
                Aktualisiere…
              </span>
            ) : null}
          </FilterRow>
          <FilterRow label="Diagramm">
            {CHART_TYPE_OPTIONS.map(([t, label]) => (
              <Pill key={t} active={chartType === t} onClick={() => pickChartType(t)}>
                {label}
              </Pill>
            ))}
          </FilterRow>
        </div>
      </Section>

      <Section>
        <button
          type="button"
          onClick={toggleFilters}
          aria-expanded={filtersExpanded}
          className="flex w-full items-center justify-between gap-2 px-5 py-3.5 text-left"
        >
          <span className="flex items-center gap-2">
            <Filter size={16} className="text-tertiary" />
            <span className="text-caption-bold uppercase text-tertiary">Filter</span>
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary-deep">
                {activeFilterCount} aktiv
              </span>
            ) : null}
          </span>
          <ChevronDown
            size={18}
            className={`text-tertiary transition-transform ${filtersExpanded ? '' : '-rotate-90'}`}
          />
        </button>
        {filtersExpanded ? (
          <div className="space-y-4 border-t border-separator p-5">
            <div className="flex flex-wrap items-center gap-2">
              {mainLocationOptions.length > 0 ? (
                <MultiSelectDropdown
                  label="Hauptstandorte"
                  options={[
                    ...mainLocationOptions.map(
                      ([id, name]): DropdownOption<number | null> => ({ value: id, label: name }),
                    ),
                    {
                      value: null,
                      label: 'ohne Hauptstandort',
                    } satisfies DropdownOption<number | null>,
                  ]}
                  selected={mainLocationFilter}
                  onChange={setMainLocationFilter}
                />
              ) : null}
              {ownerOptions.length > 0 ? (
                <MultiSelectDropdown
                  label="Eigentümer"
                  options={[
                    ...ownerOptions.map(
                      ([id, name]): DropdownOption<number | null> => ({ value: id, label: name }),
                    ),
                    {
                      value: null,
                      label: 'ohne Eigentümer',
                    } satisfies DropdownOption<number | null>,
                  ]}
                  selected={ownerFilter}
                  onChange={setOwnerFilter}
                />
              ) : null}
              <MultiSelectDropdown
                label="Zählerstandorte"
                options={[
                  ...locationOptions.map(
                    ([id, name]): DropdownOption<number | null> => ({ value: id, label: name }),
                  ),
                  {
                    value: null,
                    label: 'ohne Zählerstandort',
                  } satisfies DropdownOption<number | null>,
                ]}
                selected={locationFilter}
                onChange={setLocationFilter}
              />
              <MultiSelectDropdown
                label="Zählerart"
                options={(Object.keys(TYPE_LABELS) as MeterType[]).map((t) => ({
                  value: t,
                  label: TYPE_LABELS[t],
                }))}
                selected={typeFilter}
                onChange={setTypeFilter}
              />
              <MultiSelectDropdown
                label="Messstellen"
                options={measuringPointOptions}
                selected={measuringPointFilter}
                onChange={setMeasuringPointFilter}
              />
              {virtualItems.length > 0 ? (
                <MultiSelectDropdown
                  label="Verrechnete Messstellen"
                  options={virtualItems.map(
                    (v): DropdownOption<number | null> => ({ value: v.id, label: v.name }),
                  )}
                  selected={virtualFilter}
                  onChange={setVirtualFilter}
                />
              ) : null}
            </div>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setMainLocationFilter(new Set());
                  setOwnerFilter(new Set());
                  setLocationFilter(new Set());
                  setTypeFilter(new Set());
                  setMeasuringPointFilter(new Set());
                  setVirtualFilter(new Set());
                }}
                className="text-caption font-semibold text-primary"
              >
                Filter zurücksetzen
              </button>
            ) : null}
          </div>
        ) : null}
      </Section>

      {!mpDataReady ? (
        <>
          <ConsumptionSummarySkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
        </>
      ) : null}

      {mpDataReady ? (
        <ConsumptionSummary points={filteredPoints} consumption={filteredConsumption} />
      ) : null}

      {mpDataReady && filteredPoints.length === 0 ? (
        <EmptyState icon={<Filter size={32} />} title="Keine Messstellen entsprechen dem Filter" />
      ) : null}

      {mpDataReady && filteredPoints.length > 0 && comparisonGroups.length === 0 ? (
        <EmptyState
          icon={<Filter size={32} />}
          title="Kein Verbrauch im gewählten Zeitraum"
          description="Für die gefilterten Messstellen gibt es im gewählten Zeitraum keine berechenbaren Verbräuche."
        />
      ) : null}

      {mpDataReady && totalSeries > MAX_SERIES_HINT ? (
        <div className="bg-fill/60 rounded-card border-hairline border-border px-4 py-3 text-caption text-secondary">
          {totalSeries} Serien im Vergleich — zur besseren Lesbarkeit die Auswahl eingrenzen (z. B.
          über den Messstellen-Filter).
        </div>
      ) : null}

      {mpDataReady
        ? comparisonGroups.map((g) => {
            const groupId = `${g.type}-${g.unit}`;
            return (
              <Section key={groupId} header={`${TYPE_LABELS[g.type]} · ${g.unit}`}>
                <div className="p-5">
                  <ComparisonChart
                    groupId={groupId}
                    series={g.series}
                    seriesKeys={g.seriesKeys}
                    labelOf={g.labelOf}
                    chartType={chartType}
                    unit={g.unit}
                  />
                </div>
              </Section>
            );
          })
        : null}
    </PageContainer>
  );
}

function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 space-y-5 p-4 pb-12 md:p-7">{children}</div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-caption-bold uppercase text-tertiary">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function ConsumptionSummary({
  points,
  consumption,
}: {
  points: MeasuringPointRead[];
  consumption: Array<ConsumptionPoint & { mp: MeasuringPointRead }>;
}) {
  const buckets = useMemo(() => {
    type Bucket = { label: string; sum: number; unit: string; type: MeterType };
    const map = new Map<string, Bucket>();
    for (const p of consumption) {
      const key = `${p.mp.type}::${p.obis_code}::${p.unit}`;
      const reg = p.mp.physical_meters
        .flatMap((m) => m.registers)
        .find((r) => r.obis_code === p.obis_code);
      const label = reg?.label ?? p.obis_code;
      const existing = map.get(key);
      if (existing) {
        existing.sum += Number(p.consumption);
      } else {
        map.set(key, {
          label: `${TYPE_LABELS[p.mp.type]} · ${label}`,
          sum: Number(p.consumption),
          unit: p.unit,
          type: p.mp.type,
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.label.localeCompare(b.label),
    );
  }, [consumption]);

  if (points.length === 0) return null;

  return (
    <Section header="Verbrauch im gewählten Zeitraum">
      {buckets.length === 0 ? (
        <div className="p-5 text-caption text-tertiary">
          Im gewählten Zeitraum gibt es keine zwei aufeinanderfolgenden Erfassungen, aus denen ein
          Verbrauch berechnet werden könnte.
        </div>
      ) : (
        <ul className="divide-y divide-separator">
          {buckets.map((b) => (
            <li key={b.label} className="flex items-baseline justify-between gap-3 px-5 py-3">
              <div className="min-w-0 flex-1 truncate text-body text-label">{b.label}</div>
              <div className="num text-headline text-label">
                {formatDe(b.sum)} <span className="text-caption text-tertiary">{b.unit}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * Höhen-reservierter Skeleton während der initialen Daten-Loads (vor
 * `points`). Layout entspricht grob der späteren Vollseite (Ansicht-Controls →
 * Filter-Leiste → Verbrauchs-Summe → Vergleichs-Charts).
 */
function DashboardSkeleton() {
  return (
    <>
      {/* Ansicht-Controls (Granularität + Diagrammtyp; Datum ist global) */}
      <div
        aria-hidden
        className="bg-surface/50 glass rounded-card border-hairline border-border"
        style={{ minHeight: 136 }}
      />
      {/* Filter-Leiste (eingeklappt per Default) */}
      <div
        aria-hidden
        className="bg-surface/50 glass rounded-card border-hairline border-border"
        style={{ minHeight: 52 }}
      />

      <ConsumptionSummarySkeleton />
      <ChartSkeleton />
      <ChartSkeleton />

      <span className="sr-only" role="status" aria-live="polite">
        Daten werden geladen
      </span>
    </>
  );
}

/** Slot für einen Vergleichs-Chart (Section mit Header + Chart-Fläche). */
function ChartSkeleton() {
  return (
    <div
      aria-hidden
      className="bg-surface/50 glass rounded-card border-hairline border-border"
      style={{ minHeight: 360 }}
    >
      <div className="border-b border-separator p-5">
        <div className="bg-fill/60 h-5 w-1/3 rounded-pill" />
      </div>
      <div className="p-5">
        <div className="bg-fill/40 h-64 w-full rounded-card" />
      </div>
    </div>
  );
}

/**
 * Slot für die `ConsumptionSummary` (Section "Verbrauch im gewählten
 * Zeitraum"). Gleiche Höhe wie der typische echte Inhalt mit ~5 Buckets.
 */
function ConsumptionSummarySkeleton() {
  return (
    <div
      aria-hidden
      className="bg-surface/50 glass rounded-card border-hairline border-border"
      style={{ minHeight: 260 }}
    >
      <div className="border-b border-separator p-5">
        <div className="bg-fill/60 h-5 w-1/2 rounded-pill" />
      </div>
      <div className="space-y-3 p-5">
        <div className="bg-fill/40 h-4 w-3/4 rounded-pill" />
        <div className="bg-fill/40 h-4 w-2/3 rounded-pill" />
        <div className="bg-fill/40 h-4 w-3/5 rounded-pill" />
      </div>
    </div>
  );
}

function csvField(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
