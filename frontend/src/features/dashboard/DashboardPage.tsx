import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Download, Filter, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Button,
  Card,
  EmptyState,
  LargeTitle,
  Pill,
  Section,
  Sheet,
  TextField,
  TypeBadge,
} from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError, api } from '@/lib/api';
import {
  formatDateDe,
  formatDateTickDe,
  formatDateTimeDe,
  formatDe,
  nowForInput,
  parseDe,
} from '@/lib/format';
import { useChartTheme } from '@/lib/useChartTheme';
import type {
  ConsumptionPoint,
  LocationRead,
  MeasuringPointRead,
  MeterType,
  ReadingRead,
  RegisterStateRead,
} from '@/lib/types';
import { TYPE_LABELS, TYPE_ORDER, describeMeterType } from '@/lib/meterLabels';

// Konstante Chart-Margin als Modul-Const, damit Recharts nicht bei jedem
// Render eine neue Object-Referenz sieht (Recharts vergleicht per ===).
const CHART_MARGIN = { top: 10, right: 16, bottom: 8, left: 8 } as const;

// Stabile Leer-Sentinel — wenn eine Messstelle (noch) keine Daten hat,
// bekommt sie immer dieselbe Array-Referenz. Sonst würden React.memo-
// Vergleiche fälschlich „neue Daten" sehen. Diese Arrays werden nirgends
// mutiert (Konvention).
const EMPTY_CONSUMPTION: ConsumptionPoint[] = [];
const EMPTY_READINGS: ReadingRead[] = [];
const EMPTY_STATES: RegisterStateRead[] = [];

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

  // Stabile Refresh-Referenz für memoizierte Sub-Komponenten.
  const handleChanged = useCallback(() => setTick((t) => t + 1), []);

  const [locationFilter, setLocationFilter] = useState<Set<number | null>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<MeterType>>(new Set());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

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

  useEffect(() => {
    if (!points) return;
    let cancelled = false;
    void Promise.all(
      points.map(async (mp) => {
        const params = new URLSearchParams();
        params.set('measuring_point_id', String(mp.id));
        params.set('limit', '5000');
        const [c, s, r] = await Promise.all([
          api
            .get<ConsumptionPoint[]>(`/measuring-points/${mp.id}/consumption`)
            .catch(() => [] as ConsumptionPoint[]),
          api
            .get<RegisterStateRead[]>(`/measuring-points/${mp.id}/state`)
            .catch(() => [] as RegisterStateRead[]),
          api.get<ReadingRead[]>(`/readings?${params}`).catch(() => [] as ReadingRead[]),
        ]);
        return [mp.id, c, s, r] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const cById: ConsumptionsByMP = {};
      const sById: StatesByMP = {};
      const rById: ReadingsByMP = {};
      for (const [id, c, s, r] of entries) {
        cById[id] = c;
        sById[id] = s;
        rById[id] = r;
      }
      setConsumptions(cById);
      setStates(sById);
      setReadingsByMP(rById);
    });
    return () => {
      cancelled = true;
    };
  }, [points]);

  const filteredPoints = useMemo(() => {
    if (!points) return [];
    return points.filter((mp) => {
      if (locationFilter.size > 0 && !locationFilter.has(mp.location_id)) return false;
      if (typeFilter.size > 0 && !typeFilter.has(mp.type)) return false;
      return true;
    });
  }, [points, locationFilter, typeFilter]);

  const filteredConsumption = useMemo(() => {
    const out: Array<ConsumptionPoint & { mp: MeasuringPointRead }> = [];
    for (const mp of filteredPoints) {
      const list = consumptions[mp.id] ?? [];
      for (const p of list) {
        if (from && p.period_end < from) continue;
        if (to && p.period_end > to) continue;
        out.push({ ...p, mp });
      }
    }
    return out;
  }, [filteredPoints, consumptions, from, to]);

  // Pro-MP gefilterte Listen vorab in eine Map packen — React.memo vergleicht
  // per Reference-Identity, daher dürfen wir diese Arrays NICHT inline im
  // JSX bauen (sonst neue Reference bei jedem Render).
  const consumptionByMp = useMemo(() => {
    const out = new Map<number, ConsumptionPoint[]>();
    for (const mp of filteredPoints) {
      const list = (consumptions[mp.id] ?? []).filter((p) => {
        if (from && p.period_end < from) return false;
        if (to && p.period_end > to) return false;
        return true;
      });
      if (list.length > 0) out.set(mp.id, list);
    }
    return out;
  }, [filteredPoints, consumptions, from, to]);

  const readingsFilteredByMp = useMemo(() => {
    const out = new Map<number, ReadingRead[]>();
    for (const mp of filteredPoints) {
      const list = (readingsByMP[mp.id] ?? []).filter((r) => {
        const day = r.reading_at.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      });
      if (list.length > 0) out.set(mp.id, list);
    }
    return out;
  }, [filteredPoints, readingsByMP, from, to]);

  const locationOptions = useMemo(() => {
    const map = new Map<number | null, string>();
    points?.forEach((mp) => {
      if (mp.location_id !== null && !map.has(mp.location_id)) {
        map.set(mp.location_id, mp.location_name ?? `#${mp.location_id}`);
      }
    });
    return Array.from(map.entries());
  }, [points]);

  function downloadCsv() {
    const header = [
      'Messstelle',
      'Standort',
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
          p.mp.location_name ?? '',
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
    a.download = `verbrauch_${new Date().toISOString().slice(0, 10)}.csv`;
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
        <div className="text-tertiary">Lade…</div>
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
            <Link to="/messstellen">
              <Button variant="filled" leftIcon={<Plus size={16} />}>
                Messstelle anlegen
              </Button>
            </Link>
          }
        />
      </PageContainer>
    );
  }

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

      <Section header="Filter">
        <div className="space-y-4 p-5">
          <FilterRow label="Standorte">
            {locationOptions.map(([id, name]) => (
              <Pill
                key={String(id)}
                active={locationFilter.has(id)}
                onClick={() => setLocationFilter(toggle(locationFilter, id))}
              >
                {name}
              </Pill>
            ))}
            <Pill
              active={locationFilter.has(null)}
              onClick={() => setLocationFilter(toggle(locationFilter, null))}
            >
              ohne Standort
            </Pill>
          </FilterRow>
          <FilterRow label="Zählerart">
            {(Object.keys(TYPE_LABELS) as MeterType[]).map((t) => (
              <Pill
                key={t}
                active={typeFilter.has(t)}
                onClick={() => setTypeFilter(toggle(typeFilter, t))}
              >
                {TYPE_LABELS[t]}
              </Pill>
            ))}
          </FilterRow>
          <FilterRow label="Zeitraum">
            <DateInput value={from} onChange={setFrom} aria-label="von" />
            <span className="text-tertiary">—</span>
            <DateInput value={to} onChange={setTo} aria-label="bis" />
          </FilterRow>
          {locationFilter.size || typeFilter.size || from || to ? (
            <button
              type="button"
              onClick={() => {
                setLocationFilter(new Set());
                setTypeFilter(new Set());
                setFrom('');
                setTo('');
              }}
              className="text-caption font-semibold text-primary"
            >
              Filter zurücksetzen
            </button>
          ) : null}
        </div>
      </Section>

      <ConsumptionSummary points={filteredPoints} consumption={filteredConsumption} />

      {filteredPoints.length === 0 ? (
        <EmptyState icon={<Filter size={32} />} title="Keine Messstellen entsprechen dem Filter" />
      ) : (
        filteredPoints.map((mp) => (
          <MeasuringPointCard
            key={mp.id}
            mp={mp}
            consumption={consumptionByMp.get(mp.id) ?? EMPTY_CONSUMPTION}
            readings={readingsFilteredByMp.get(mp.id) ?? EMPTY_READINGS}
            state={states[mp.id] ?? EMPTY_STATES}
            onChanged={handleChanged}
          />
        ))
      )}
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

function DateInput({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (s: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="num rounded-pill border-hairline border-border bg-fill px-3 py-1.5 text-body-sm text-label outline-none focus:border-primary focus:bg-surface-solid"
      {...rest}
    />
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
  onChanged,
}: {
  mp: MeasuringPointRead;
  consumption: ConsumptionPoint[];
  readings: ReadingRead[];
  state: RegisterStateRead[];
  onChanged: () => void;
}) {
  const theme = useChartTheme();
  const [mode, setMode] = useState<'consumption' | 'level'>('consumption');
  const [correctTarget, setCorrectTarget] = useState<RegisterStateRead | null>(null);

  // Verbrauchs-Serie (period_end → values pro OBIS)
  const consumptionSeries = useMemo(() => {
    const merged = new Map<string, Record<string, number | string>>();
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

  // Stand-Serie (reading_at → value pro OBIS)
  const levelSeries = useMemo(() => {
    const merged = new Map<string, Record<string, number | string>>();
    for (const r of readings) {
      const code = obisByRegister.get(r.register_id);
      if (!code) continue;
      const row = merged.get(r.reading_at) ?? { date: r.reading_at };
      row[code] = Number(r.value);
      merged.set(r.reading_at, row);
    }
    return Array.from(merged.values()).sort((a, b) =>
      String(a['date']).localeCompare(String(b['date'])),
    );
  }, [readings, obisByRegister]);

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

  // Stabile Style-Objekte für Recharts (Tooltip/Legend) — sonst sieht
  // Recharts bei jedem Render neue Referenzen und re-rendert die ganze
  // Subtree, auch wenn theme & Daten gleich sind.
  const tooltipContentStyle = useMemo(
    () => ({
      backgroundColor: theme.tooltipBg,
      border: `1px solid ${theme.tooltipBorder}`,
      borderRadius: 12,
      color: theme.label,
    }),
    [theme],
  );
  const tooltipLabelStyle = useMemo(() => ({ color: theme.label }), [theme.label]);
  const legendWrapperStyle = useMemo(() => ({ fontSize: 12, color: theme.label }), [theme.label]);
  const tooltipFormatter = useCallback(
    (value: number | string, name: string) => [
      `${formatDe(value as number)}${unit ? ' ' + unit : ''}`,
      seriesLabel(String(name)),
    ],
    [unit, seriesLabel],
  );
  const legendFormatter = useCallback((name: string) => seriesLabel(String(name)), [seriesLabel]);

  const consumptionTotals = new Map<string, { sum: number; unit: string }>();
  for (const p of consumption) {
    const e = consumptionTotals.get(p.obis_code) ?? { sum: 0, unit: p.unit };
    e.sum += Number(p.consumption);
    consumptionTotals.set(p.obis_code, e);
  }

  return (
    <Card>
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

      {consumptionTotals.size > 0 ? (
        <div className="bg-fill/60 mb-4 rounded-card border-hairline border-border p-4">
          <div className="text-caption-bold uppercase text-tertiary">
            Verbrauch im Zeitraum
            {mp.transformer_factor !== null ? (
              <span className="ml-1.5 normal-case text-tertiary">
                (Differenzen × Wandlerfaktor {mp.transformer_factor})
              </span>
            ) : null}
          </div>
          <ul className="mt-2 space-y-1">
            {Array.from(consumptionTotals.entries()).map(([code, t]) => (
              <li key={code} className="flex items-baseline justify-between gap-3 text-body">
                <span className="truncate text-label">{labelByObis.get(code) ?? code}</span>
                <span className="num text-headline text-label">
                  {formatDe(t.sum)} <span className="text-caption text-tertiary">{t.unit}</span>
                </span>
              </li>
            ))}
          </ul>
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
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: theme.axis }}
                stroke={theme.axis}
                tickFormatter={formatDateTickDe}
              />
              <YAxis
                tick={{ fontSize: 11, fill: theme.axis }}
                stroke={theme.axis}
                tickFormatter={(v) => formatDe(v as number)}
                {...(unit
                  ? {
                      label: {
                        value: unit,
                        angle: -90,
                        position: 'insideLeft',
                        offset: 10,
                        style: { textAnchor: 'middle', fontSize: 11, fill: theme.axis },
                      },
                    }
                  : {})}
              />
              <Tooltip
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle}
                formatter={tooltipFormatter}
                labelFormatter={formatDateTickDe}
              />
              <Legend formatter={legendFormatter} wrapperStyle={legendWrapperStyle} />
              {obisCodes.map((code, idx) => (
                <Line
                  key={code}
                  type="monotone"
                  dataKey={code}
                  name={code}
                  stroke={theme.palette[idx % theme.palette.length]}
                  strokeWidth={2}
                  dot={mode === 'level' ? { r: 3 } : false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
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
        reading_at: readingAt,
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

function CurrentStateTile({ state }: { state: RegisterStateRead }) {
  return (
    <div className="bg-fill/60 rounded-card border-hairline border-border p-4">
      <div className="text-caption-bold uppercase text-tertiary">{state.label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="num text-title-1 leading-none tracking-tighter text-label">
          {state.current_value !== null ? formatDe(state.current_value) : '—'}
        </span>
        <span className="text-body text-secondary">{state.unit}</span>
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

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function csvField(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
