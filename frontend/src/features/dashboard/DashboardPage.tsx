import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
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
  Sheet,
  TextField,
  TypeBadge,
} from '@/components/ui';
import type { DropdownOption } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError, api } from '@/lib/api';
import {
  formatDateDe,
  formatDateTimeDe,
  formatDe,
  localInputToIso,
  nowForInput,
  parseDe,
} from '@/lib/format';
import type {
  ConsumptionPoint,
  DashboardResponse,
  LocationRead,
  MeasuringPointRead,
  MeterType,
  ReadingRead,
  RegisterStateRead,
} from '@/lib/types';
import { TYPE_LABELS, TYPE_ORDER, describeMeterType } from '@/lib/meterLabels';
import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import { setCodec, useStickyState } from '@/lib/useStickyState';
import { MeterChart } from './MeterChart';
import {
  bucketEndIso,
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

// Stabile Leer-Sentinel — wenn eine Messstelle (noch) keine Daten hat,
// bekommt sie immer dieselbe Array-Referenz. Sonst würden React.memo-
// Vergleiche fälschlich „neue Daten" sehen. Diese Arrays werden nirgends
// mutiert (Konvention).
const EMPTY_CONSUMPTION: ConsumptionPoint[] = [];
const EMPTY_READINGS: ReadingRead[] = [];
const EMPTY_STATES: RegisterStateRead[] = [];

// localStorage-Keys fuer die Akkordeon-Zustaende. Wir speichern die
// AUFGEKLAPPTEN Gruppen — Default ist „alles zu", d. h. ein leeres Set bei
// erstem Aufruf. „Ohne Hauptstandort"/„Ohne Zaehlerstandort" haben eigene
// Sentinel-Keys, damit echte ID 0 (theoretisch) nicht kollidiert.
const EXPANDED_MAIN_LOCATIONS_KEY = 'dashboard.expandedMainLocations';
const EXPANDED_LOCATIONS_KEY = 'dashboard.expandedLocations';
const NO_MAIN_LOCATION_KEY = '__no_main_location__';
const NO_LOCATION_KEY = '__no_location__';
const FILTERS_EXPANDED_KEY = 'dashboard.filtersExpanded';

// Session-Memory der Dashboard-Filter („Filter merken"). Namespace + Codecs als
// Modul-Consts → stabile Referenzen. ID-Sets enthalten `null` (= „ohne …").
const FILTER_NS = 'filters.dashboard.';
const isIdMember = (x: unknown): x is number | null => x === null || typeof x === 'number';
const isMeterType = (x: unknown): x is MeterType =>
  typeof x === 'string' && Object.prototype.hasOwnProperty.call(TYPE_LABELS, x);
const ID_CODEC = setCodec<number | null>(isIdMember);
const TYPE_CODEC = setCodec<MeterType>(isMeterType);

function loadExpandedSet(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function saveExpandedSet(key: string, set: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* QuotaExceeded / SecurityError ignorieren — non-fatal UX-State */
  }
}

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

interface LocationGroup {
  locationKey: string;
  locationLabel: string;
  points: MeasuringPointRead[];
}
interface MainLocationGroup {
  mainKey: string;
  mainLabel: string;
  totalPoints: number;
  locations: LocationGroup[];
}

interface ConsumptionsByMP {
  [mpId: number]: ConsumptionPoint[];
}

interface StatesByMP {
  [mpId: number]: RegisterStateRead[];
}

interface ReadingsByMP {
  [mpId: number]: ReadingRead[];
}

export function DashboardPage() {
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [, setLocations] = useState<LocationRead[]>([]);
  const [consumptions, setConsumptions] = useState<ConsumptionsByMP>({});
  const [states, setStates] = useState<StatesByMP>({});
  const [readingsByMP, setReadingsByMP] = useState<ReadingsByMP>({});
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Wird `true`, sobald die zweite Lade-Welle (state/consumption/readings)
  // fertig ist. Bis dahin zeigen wir Skeleton-Karten in derselben Hoehe wie
  // die spaeteren echten Karten — so wandert beim Cutover nichts (CLS).
  const [mpDataReady, setMpDataReady] = useState(false);
  // Läuft, solange der gebündelte Dashboard-Request offen ist — gibt sichtbares
  // Feedback beim Zeitraum-/Granularitäts-Wechsel, statt die alten Charts
  // kommentarlos stehen zu lassen, bis die Antwort da ist.
  const [refreshing, setRefreshing] = useState(false);

  // Stabile Refresh-Referenz für memoizierte Sub-Komponenten.
  const handleChanged = useCallback(() => setTick((t) => t + 1), []);

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
  // Der Datumsbereich kommt global aus dem FilterPrefsContext (Navigation);
  // `from`/`to` bleiben lokale Aliase, damit alle abhängigen Effekte/Helfer
  // (Granularitäts-Default, /dashboard-Load, CSV) unverändert weiterlaufen.
  const currentYear = new Date().getFullYear();
  const from = dateRange.from;
  const to = dateRange.to;

  // Globale View-Controls (gelten für alle Karten + CSV): Diagrammtyp und
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
  }, [tick]);

  // Gebündelter Dashboard-Load: Verbrauch + Readings + Bestand aller
  // (zugänglichen) Messstellen in EINEM Request (`GET /dashboard`) statt
  // Fan-out je MP — sonst hunderte Roundtrips, die auf schwacher Hardware
  // (LXC) das Dashboard minutenlang „einfrieren" lassen. Lädt neu bei
  // Zeitraum-/Granularitäts-Wechsel und nach Datenänderungen (tick).
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
        const rById: ReadingsByMP = {};
        const sById: StatesByMP = {};
        for (const item of data.items) {
          cById[item.measuring_point_id] = item.consumption;
          rById[item.measuring_point_id] = item.readings;
          sById[item.measuring_point_id] = item.state;
        }
        setConsumptions(cById);
        setReadingsByMP(rById);
        setStates(sById);
        setMpDataReady(true);
        setRefreshing(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRefreshing(false);
      });
    return () => controller.abort();
  }, [from, to, granularity, tick]);

  const filteredPoints = useMemo(() => {
    if (!points) return [];
    return points.filter((mp) => {
      if (mainLocationFilter.size > 0 && !mainLocationFilter.has(mp.main_location_id)) return false;
      if (ownerFilter.size > 0 && !ownerFilter.has(mp.current_owner_id)) return false;
      if (locationFilter.size > 0 && !locationFilter.has(mp.location_id)) return false;
      if (typeFilter.size > 0 && !typeFilter.has(mp.type)) return false;
      return true;
    });
  }, [points, mainLocationFilter, ownerFilter, locationFilter, typeFilter]);

  // Verbrauch/Readings sind bereits Backend-seitig auf den Zeitraum gefiltert;
  // hier nur noch nach den kategorialen MP-Filtern einschränken.
  const filteredConsumption = useMemo(() => {
    const out: Array<ConsumptionPoint & { mp: MeasuringPointRead }> = [];
    for (const mp of filteredPoints) {
      for (const p of consumptions[mp.id] ?? []) out.push({ ...p, mp });
    }
    return out;
  }, [filteredPoints, consumptions]);

  // Pro-MP-Listen vorab in eine Map packen — React.memo vergleicht
  // per Reference-Identity, daher dürfen wir diese Arrays NICHT inline im
  // JSX bauen (sonst neue Reference bei jedem Render).
  const consumptionByMp = useMemo(() => {
    const out = new Map<number, ConsumptionPoint[]>();
    for (const mp of filteredPoints) {
      const list = consumptions[mp.id] ?? [];
      if (list.length > 0) out.set(mp.id, list);
    }
    return out;
  }, [filteredPoints, consumptions]);

  const readingsFilteredByMp = useMemo(() => {
    const out = new Map<number, ReadingRead[]>();
    for (const mp of filteredPoints) {
      const list = readingsByMP[mp.id] ?? [];
      if (list.length > 0) out.set(mp.id, list);
    }
    return out;
  }, [filteredPoints, readingsByMP]);

  // Zweistufige Gruppierung: Hauptstandort > Zaehlerstandort > Karten.
  // Bei wachsendem MP-Bestand bleibt das Dashboard kompakt — Default ist
  // „alles zugeklappt", User klappt selektiv auf. localStorage speichert
  // die AUFGEKLAPPTEN Keys (expanded-Semantik); leeres Set = alles zu.
  // Sortierung pro Ebene: Label alphabetisch, „Ohne …"-Buckets ans Ende.
  const [expandedMainLocations, setExpandedMainLocations] = useState<Set<string>>(() =>
    loadExpandedSet(EXPANDED_MAIN_LOCATIONS_KEY),
  );
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(() =>
    loadExpandedSet(EXPANDED_LOCATIONS_KEY),
  );

  const groupedByMainLocation = useMemo<MainLocationGroup[]>(() => {
    const outer = new Map<string, { label: string; locs: Map<string, LocationGroup> }>();
    for (const mp of filteredPoints) {
      const mainKey =
        mp.main_location_id === null ? NO_MAIN_LOCATION_KEY : String(mp.main_location_id);
      const mainLabel =
        mp.main_location_id === null
          ? 'Ohne Hauptstandort'
          : (mp.main_location_name ?? `#${mp.main_location_id}`);
      const locKey = mp.location_id === null ? NO_LOCATION_KEY : String(mp.location_id);
      const locLabel =
        mp.location_id === null
          ? 'Ohne Zählerstandort'
          : (mp.location_name ?? `#${mp.location_id}`);
      let outerEntry = outer.get(mainKey);
      if (!outerEntry) {
        outerEntry = { label: mainLabel, locs: new Map() };
        outer.set(mainKey, outerEntry);
      }
      let innerEntry = outerEntry.locs.get(locKey);
      if (!innerEntry) {
        innerEntry = { locationKey: locKey, locationLabel: locLabel, points: [] };
        outerEntry.locs.set(locKey, innerEntry);
      }
      innerEntry.points.push(mp);
    }
    return Array.from(outer.entries())
      .sort(([keyA, a], [keyB, b]) => {
        if (keyA === NO_MAIN_LOCATION_KEY) return 1;
        if (keyB === NO_MAIN_LOCATION_KEY) return -1;
        return a.label.localeCompare(b.label, 'de');
      })
      .map(([mainKey, group]) => ({
        mainKey,
        mainLabel: group.label,
        totalPoints: Array.from(group.locs.values()).reduce((acc, g) => acc + g.points.length, 0),
        locations: Array.from(group.locs.values()).sort((a, b) => {
          if (a.locationKey === NO_LOCATION_KEY) return 1;
          if (b.locationKey === NO_LOCATION_KEY) return -1;
          return a.locationLabel.localeCompare(b.locationLabel, 'de');
        }),
      }));
  }, [filteredPoints]);

  const toggleMainLocation = useCallback((key: string) => {
    setExpandedMainLocations((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveExpandedSet(EXPANDED_MAIN_LOCATIONS_KEY, next);
      return next;
    });
  }, []);

  const toggleLocation = useCallback((key: string) => {
    setExpandedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveExpandedSet(EXPANDED_LOCATIONS_KEY, next);
      return next;
    });
  }, []);

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
    mainLocationFilter.size + ownerFilter.size + locationFilter.size + typeFilter.size;

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
            </div>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setMainLocationFilter(new Set());
                  setOwnerFilter(new Set());
                  setLocationFilter(new Set());
                  setTypeFilter(new Set());
                }}
                className="text-caption font-semibold text-primary"
              >
                Filter zurücksetzen
              </button>
            ) : null}
          </div>
        ) : null}
      </Section>

      {/*
        Atomares Cutover: solange die zweite Lade-Welle laeuft, halten wir die
        Layout-Slots in identischer Hoehe wie spaeter — ConsumptionSummary
        als Skeleton-Section, eine Card-Skeleton-Karte pro angekuendigter MP.
        Erst wenn ALLE Sub-Daten da sind, switchen wir auf echte Cards. So
        wandert beim Render-Switch nichts (kein DOM-Wachstum innerhalb der
        Karte mehr — der Pill-Block, der bisher 0,13 CLS verursachte, hat
        ueber dem nichts mehr, das nachwaechst).
      */}
      {!mpDataReady ? (
        <>
          <ConsumptionSummarySkeleton />
          {(filteredPoints.length > 0 ? filteredPoints : points).map((mp) => (
            <MeasuringPointCardSkeleton key={mp.id} />
          ))}
        </>
      ) : null}

      {mpDataReady ? (
        <ConsumptionSummary points={filteredPoints} consumption={filteredConsumption} />
      ) : null}

      {mpDataReady && filteredPoints.length === 0 ? (
        <EmptyState icon={<Filter size={32} />} title="Keine Messstellen entsprechen dem Filter" />
      ) : null}

      {mpDataReady && groupedByMainLocation.length > 0
        ? groupedByMainLocation.map((mainGroup) => {
            const mainExpanded = expandedMainLocations.has(mainGroup.mainKey);
            return (
              <div key={mainGroup.mainKey} className="space-y-3">
                <button
                  type="button"
                  onClick={() => toggleMainLocation(mainGroup.mainKey)}
                  className="bg-fill/40 hover:bg-fill/60 flex w-full items-center justify-between gap-2 rounded-card border-hairline border-border px-4 py-3 text-left transition-colors"
                  aria-expanded={mainExpanded}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-title-3 font-semibold tracking-tight">
                      {mainGroup.mainLabel}
                    </span>
                    <span className="text-caption text-tertiary">{mainGroup.totalPoints}</span>
                  </span>
                  <ChevronDown
                    size={18}
                    className={`transition-transform ${mainExpanded ? '' : '-rotate-90'}`}
                  />
                </button>
                {mainExpanded
                  ? mainGroup.locations.map((locGroup) => {
                      // Inner-Key kombiniert mainKey, damit derselbe „Ohne
                      // Zaehlerstandort"-Sentinel unter mehreren Hauptstand-
                      // orten unabhaengig persistiert werden kann.
                      const innerKey = `${mainGroup.mainKey}::${locGroup.locationKey}`;
                      const locExpanded = expandedLocations.has(innerKey);
                      return (
                        <div key={innerKey} className="ml-2 space-y-3">
                          <button
                            type="button"
                            onClick={() => toggleLocation(innerKey)}
                            className="bg-fill/30 hover:bg-fill/50 flex w-full items-center justify-between gap-2 rounded-card border-hairline border-border px-4 py-2 text-left transition-colors"
                            aria-expanded={locExpanded}
                          >
                            <span className="flex items-baseline gap-2">
                              <span className="text-headline">{locGroup.locationLabel}</span>
                              <span className="text-caption text-tertiary">
                                {locGroup.points.length}
                              </span>
                            </span>
                            <ChevronDown
                              size={16}
                              className={`transition-transform ${locExpanded ? '' : '-rotate-90'}`}
                            />
                          </button>
                          {locExpanded
                            ? locGroup.points.map((mp) => (
                                <MeasuringPointCard
                                  key={mp.id}
                                  mp={mp}
                                  consumption={consumptionByMp.get(mp.id) ?? EMPTY_CONSUMPTION}
                                  readings={readingsFilteredByMp.get(mp.id) ?? EMPTY_READINGS}
                                  state={states[mp.id] ?? EMPTY_STATES}
                                  chartType={chartType}
                                  granularity={granularity}
                                  onChanged={handleChanged}
                                />
                              ))
                            : null}
                        </div>
                      );
                    })
                  : null}
              </div>
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

// React.memo: rendert nur, wenn sich Props effektiv ändern.
// Die zugehörigen Daten-Arrays werden im Parent vorab in stabile Maps
// gepackt, der onChanged-Callback ist ein useCallback. So rendern bei
// einem tick-Refresh nur die MPs neu, deren Daten sich tatsächlich
// geändert haben — nicht alle Cards der Liste.
const MeasuringPointCard = memo(function MeasuringPointCard({
  mp,
  consumption,
  readings,
  state,
  chartType,
  granularity,
  onChanged,
}: {
  mp: MeasuringPointRead;
  consumption: ConsumptionPoint[];
  readings: ReadingRead[];
  state: RegisterStateRead[];
  chartType: ChartType;
  granularity: Granularity;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'consumption' | 'level'>('consumption');
  const [correctTarget, setCorrectTarget] = useState<RegisterStateRead | null>(null);

  // Verbrauchs-Serie (period_end → values pro OBIS)
  const consumptionSeries = useMemo(() => {
    const merged = new Map<string, Record<string, number | string> & { date: string }>();
    for (const p of consumption) {
      const row = merged.get(p.period_end) ?? { date: p.period_end };
      row[p.obis_code] = Number(p.consumption);
      merged.set(p.period_end, row);
    }
    return Array.from(merged.values()).sort((a, b) =>
      String(a['date']).localeCompare(String(b['date'])),
    );
  }, [consumption]);

  // OBIS-Lookup: einmalig pro mp.physical_meters (stabile Referenz, solange
  // sich die MP nicht ändert).
  const obisByRegister = useMemo(() => {
    const m = new Map<number, string>();
    for (const meter of mp.physical_meters) {
      for (const r of meter.registers) m.set(r.id, r.obis_code);
    }
    return m;
  }, [mp.physical_meters]);

  // Stand-Serie: Readings je Granularitäts-Bucket gruppieren; spätere Readings
  // im selben Bucket gewinnen (= Endstand des Buckets). Teilt damit die X-Achse
  // mit der Backend-aggregierten Verbrauchs-Serie.
  const levelSeries = useMemo(() => {
    const merged = new Map<string, Record<string, number | string> & { date: string }>();
    const sorted = [...readings].sort((a, b) => a.reading_at.localeCompare(b.reading_at));
    for (const r of sorted) {
      const code = obisByRegister.get(r.register_id);
      if (!code) continue;
      const bucket = bucketEndIso(r.reading_at, granularity);
      const row = merged.get(bucket) ?? { date: bucket };
      row[code] = Number(r.value);
      merged.set(bucket, row);
    }
    return Array.from(merged.values()).sort((a, b) =>
      String(a['date']).localeCompare(String(b['date'])),
    );
  }, [readings, obisByRegister, granularity]);

  const series = mode === 'consumption' ? consumptionSeries : levelSeries;

  const obisCodes =
    mode === 'consumption'
      ? Array.from(new Set(consumption.map((p) => p.obis_code)))
      : Array.from(new Set(readings.map((r) => obisByRegister.get(r.register_id) ?? ''))).filter(
          Boolean,
        );

  const unit =
    consumption[0]?.unit ??
    mp.physical_meters.find((m) => m.removed_at === null)?.registers.find((r) => r.is_active)
      ?.unit ??
    '';

  const labelByObis = useMemo(() => {
    const m = new Map<string, string>();
    for (const meter of mp.physical_meters) {
      for (const r of meter.registers) {
        if (!m.has(r.obis_code)) m.set(r.obis_code, r.label);
      }
    }
    return m;
  }, [mp.physical_meters]);

  const seriesLabel = useCallback(
    (code: string) => {
      const base = labelByObis.get(code) ?? code;
      return mode === 'consumption' ? `Verbrauch · ${base}` : base;
    },
    [labelByObis, mode],
  );

  const consumptionTotals = new Map<string, { sum: number; unit: string }>();
  for (const p of consumption) {
    const e = consumptionTotals.get(p.obis_code) ?? { sum: 0, unit: p.unit };
    e.sum += Number(p.consumption);
    consumptionTotals.set(p.obis_code, e);
  }

  return (
    // min-h-[560px] = gleiche Hoehe wie MeasuringPointCardSkeleton, damit
    // der Cutover Skeleton -> echte Card NICHT shiftet. Kompakte Karten mit
    // wenig Inhalt tragen unten etwas Whitespace — bewusster Tausch fuer 0 CLS.
    <Card className="min-h-[560px]">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TypeBadge type={mp.type} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title-3 text-label">{mp.name}</h2>
          <div className="text-caption text-tertiary">
            {describeMeterType(mp.type, mp.heating_source)}
            {mp.location_name ? ` · ${mp.location_name}` : ''}
            {mp.transformer_factor !== null ? ` · Wandlerfaktor ×${mp.transformer_factor}` : ''}
          </div>
        </div>
        {unit ? <span className="text-caption text-tertiary">in {unit}</span> : null}
      </div>

      {consumptionTotals.size > 0 ? (
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2">
          {Array.from(consumptionTotals.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([code, t]) => (
              <ConsumptionTile
                key={code}
                label={labelByObis.get(code) ?? code}
                sum={t.sum}
                unit={t.unit}
              />
            ))}
        </div>
      ) : null}

      {state.length > 0 ? (
        <div className="mb-4 space-y-2.5">
          {state
            .filter((s) => s.accepts_deliveries)
            .map((s) => (
              <TankTile
                key={s.register_id}
                mp={mp}
                state={s}
                onCorrect={() => setCorrectTarget(s)}
              />
            ))}
          {state.some((s) => !s.accepts_deliveries) ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {state
                .filter((s) => !s.accepts_deliveries)
                .map((s) => (
                  <CurrentStateTile key={s.register_id} state={s} />
                ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Pill active={mode === 'consumption'} onClick={() => setMode('consumption')}>
          Verbrauch
        </Pill>
        <Pill active={mode === 'level'} onClick={() => setMode('level')}>
          Stand ({readings.length})
        </Pill>
      </div>

      {series.length === 0 ? (
        <p className="text-caption text-tertiary">
          {mode === 'consumption'
            ? 'Keine Verbrauchsdaten im gewählten Zeitraum.'
            : 'Keine Stände im gewählten Zeitraum.'}
        </p>
      ) : (
        <MeterChart
          mpId={mp.id}
          series={series}
          obisCodes={obisCodes}
          chartType={chartType}
          mode={mode}
          unit={unit}
          seriesLabel={seriesLabel}
        />
      )}

      <Sheet
        open={correctTarget !== null}
        onClose={() => setCorrectTarget(null)}
        title="Bestand korrigieren"
      >
        {correctTarget ? (
          <CorrectionForm
            mp={mp}
            state={correctTarget}
            onSaved={() => {
              setCorrectTarget(null);
              onChanged();
            }}
            onCancel={() => setCorrectTarget(null)}
          />
        ) : null}
      </Sheet>
    </Card>
  );
});

function TankTile({
  mp,
  state,
  onCorrect,
}: {
  mp: MeasuringPointRead;
  state: RegisterStateRead;
  onCorrect: () => void;
}) {
  const capacity = mp.tank_capacity ? Number(mp.tank_capacity) : null;
  const current = state.current_value !== null ? Number(state.current_value) : null;
  const percent =
    capacity && capacity > 0 && current !== null
      ? Math.max(0, Math.min(100, (current / capacity) * 100))
      : null;

  return (
    <div className="bg-fill/60 rounded-card border-hairline border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-caption-bold uppercase text-tertiary">{state.label}</div>
        {percent !== null ? (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary-deep">
            {formatDe(percent, { maximumFractionDigits: 0 })} %
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="num text-display leading-none tracking-tighter text-label">
          {current !== null ? formatDe(current) : '—'}
        </span>
        <span className="text-headline text-secondary">{state.unit}</span>
        {capacity ? (
          <span className="num ml-auto text-caption text-tertiary">
            / {formatDe(capacity)} {state.unit}
          </span>
        ) : null}
      </div>

      {percent !== null ? (
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-fill shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-electricity transition-all"
            style={{
              width: `${percent.toFixed(1)}%`,
              boxShadow: '0 0 12px color-mix(in oklch, var(--primary), transparent 50%)',
            }}
          />
        </div>
      ) : null}

      <div className="mt-3 space-y-0.5 text-caption text-tertiary">
        {!capacity ? (
          <div>
            Tankvolumen nicht gesetzt — für Prozent-Anzeige in Messstellen-Stammdaten ergänzen.
          </div>
        ) : null}
        <div>
          {state.last_reading_at
            ? `Letzter Stand: ${formatDe(state.last_reading_value ?? '0')} ${state.unit} (${formatDateTimeDe(state.last_reading_at)})`
            : 'noch keine Erfassung'}
        </div>
        {Number(state.refilled_since) > 0 ? (
          <div className="text-primary">
            + {formatDe(state.refilled_since)} {state.unit} seit letzter Erfassung geliefert
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="tinted" size="sm" onClick={onCorrect}>
          Bestand korrigieren
        </Button>
      </div>
    </div>
  );
}

function CorrectionForm({
  mp,
  state,
  onSaved,
  onCancel,
}: {
  mp: MeasuringPointRead;
  state: RegisterStateRead;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(
    state.current_value !== null ? formatDe(state.current_value) : '',
  );
  const [readingAt, setReadingAt] = useState(nowForInput());
  const [note, setNote] = useState('Bestandskorrektur');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/readings', {
        register_id: state.register_id,
        value: parseDe(value),
        // datetime-local liefert lokale Wanduhrzeit ohne Offset — vor dem
        // Senden in UTC (…Z) wandeln, sonst deutet das Backend sie als UTC
        // und die Bestandskorrektur landet um den lokalen Offset verschoben.
        reading_at: localInputToIso(readingAt),
        note: note || null,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof RangeError) setError(err.message);
      else setError('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <div className="text-caption text-tertiary">
        {mp.name} · {state.label} ({state.unit})
      </div>
      {state.last_reading_at ? (
        <div className="bg-fill/60 rounded-card border-hairline border-border p-3 text-caption">
          <div className="text-tertiary">Bisheriger Stand:</div>
          <div className="num text-headline text-label">
            {formatDe(state.last_reading_value ?? '0')} {state.unit}
            <span className="ml-2 text-caption text-tertiary">
              ({formatDateTimeDe(state.last_reading_at)})
            </span>
          </div>
          {Number(state.refilled_since) > 0 ? (
            <div className="text-caption text-primary">
              + {formatDe(state.refilled_since)} {state.unit} seitdem geliefert
            </div>
          ) : null}
        </div>
      ) : null}
      <TextField
        label={`Tatsächlicher Stand (${state.unit})`}
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
        hint="z. B. nach Tankablesung"
        numeric
      />
      <TextField
        label="Zeitpunkt"
        type="datetime-local"
        value={readingAt}
        onChange={(e) => setReadingAt(e.target.value)}
        required
      />
      <TextField
        label="Notiz"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={error}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Korrektur speichern'}
        </Button>
        <Button type="button" variant="bordered" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
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

function ConsumptionTile({ label, sum, unit }: { label: string; sum: number; unit: string }) {
  return (
    <div className="bg-fill/60 rounded-card border-hairline border-border p-4">
      <div className="text-caption-bold uppercase text-tertiary">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="num text-display leading-none tracking-tighter text-label">
          {formatDe(sum)}
        </span>
        <span className="text-headline text-secondary">{unit}</span>
      </div>
      <div className="mt-1 text-caption text-tertiary">im gewählten Zeitraum</div>
    </div>
  );
}

function CurrentStateTile({ state }: { state: RegisterStateRead }) {
  return (
    <div className="bg-fill/40 rounded-card border-hairline border-border p-3">
      <div className="text-caption-bold uppercase text-tertiary">Zählerstand {state.label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="num text-headline leading-none text-secondary">
          {state.current_value !== null ? formatDe(state.current_value) : '—'}
        </span>
        <span className="text-caption text-tertiary">{state.unit}</span>
      </div>
      <div className="mt-2 text-caption text-tertiary">
        {state.last_reading_at
          ? `Stand vom ${formatDateTimeDe(state.last_reading_at)}`
          : 'noch keine Erfassung'}
        {state.accepts_deliveries && Number(state.refilled_since) > 0
          ? ` · +${formatDe(state.refilled_since)} ${state.unit} seitdem geliefert`
          : ''}
      </div>
    </div>
  );
}

/**
 * Höhen-reservierter Skeleton während der initialen Daten-Loads (vor
 * `points`). Layout muss exakt zu der spaeteren Vollseite passen, sonst
 * springt das Layout beim Hydrieren — der CLS-Hauptverursacher.
 *
 * Reservierte Slots: Ansicht-Controls (136) → Filter-Leiste (52) →
 * ConsumptionSummary (260) → 3 Karten à 560 px. Dieselben Höhen verwenden
 * auch `MeasuringPointCardSkeleton` (Phase 2) und die echte
 * `MeasuringPointCard` (`min-h-[560px]`) — so ist die Layout-Höhe identisch.
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

      {[0, 1, 2].map((i) => (
        <MeasuringPointCardSkeleton key={i} />
      ))}

      <span className="sr-only" role="status" aria-live="polite">
        Daten werden geladen
      </span>
    </>
  );
}

/**
 * Card-Slot waehrend `mpDataReady === false`. Selbe Hoehe (560 px) und
 * dasselbe Compositing (`glass`) wie die echte `MeasuringPointCard`, sodass
 * der Phase-2 → Phase-3-Switch ohne Y-Verschiebung ablaeuft. Innen kein
 * MP-spezifischer Skeleton-Inhalt — aria-hidden, der sr-only-Text in
 * `DashboardSkeleton` liefert die Live-Region.
 */
function MeasuringPointCardSkeleton() {
  return (
    <div
      aria-hidden
      className="glass bg-surface/50 rounded-card border-hairline border-border shadow-glass dark:shadow-glass-dark"
      style={{ minHeight: 560 }}
    >
      <div className="space-y-3 p-5">
        <div className="h-7 w-2/3 rounded-pill bg-fill" />
        <div className="bg-fill/60 h-4 w-1/3 rounded-pill" />
        <div className="bg-fill/60 mt-6 h-32 w-full rounded-card" />
        <div className="bg-fill/40 mt-4 h-24 w-full rounded-card" />
        <div className="bg-fill/40 mt-4 h-64 w-full rounded-card" />
      </div>
    </div>
  );
}

/**
 * Slot fuer die `ConsumptionSummary` (Section "Verbrauch im gewaehlten
 * Zeitraum"). Gleiche Höhe wie der typische echte Inhalt mit ~5 Buckets
 * — schwankt in der Praxis zwischen 200 und 320 px, daher 260 px als
 * Mittelweg. Echter Inhalt mit weniger Buckets fuellt den Slot ueber das
 * Section-Padding nicht ganz; das ist der bewusste Tausch fuer 0 CLS.
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
