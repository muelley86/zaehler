import { useEffect, useMemo, useState } from 'react';
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
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateTimeDe, formatDe, nowForInput, parseDe } from '@/lib/format';
import { useChartTheme } from '@/lib/useChartTheme';
import type {
  ConsumptionPoint,
  LocationRead,
  MeasuringPointRead,
  MeterType,
  ReadingRead,
  RegisterStateRead,
} from '@/lib/types';

interface ConsumptionsByMP {
  [mpId: number]: ConsumptionPoint[];
}

interface StatesByMP {
  [mpId: number]: RegisterStateRead[];
}

interface ReadingsByMP {
  [mpId: number]: ReadingRead[];
}

const TYPE_LABELS: Record<MeterType, string> = {
  electricity: 'Strom',
  gas: 'Gas',
  water: 'Wasser',
  oil: 'Ölheizung',
};

export function DashboardPage() {
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [, setLocations] = useState<LocationRead[]>([]);
  const [consumptions, setConsumptions] = useState<ConsumptionsByMP>({});
  const [states, setStates] = useState<StatesByMP>({});
  const [readingsByMP, setReadingsByMP] = useState<ReadingsByMP>({});
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

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
          p.period_start,
          p.period_end,
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
      <div className="space-y-5">
        <LargeTitle title="Dashboard" />
        <div className="px-4">
          <Card>
            <div className="text-ios-red">{error}</div>
          </Card>
        </div>
      </div>
    );
  }
  if (!points) {
    return (
      <div className="space-y-5">
        <LargeTitle title="Dashboard" />
        <div className="px-4 text-ios-tertiary">Lade…</div>
      </div>
    );
  }
  if (points.length === 0) {
    return (
      <div className="space-y-5">
        <LargeTitle title="Dashboard" />
        <div className="px-4">
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
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
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

      <div className="space-y-5 px-4">
        <Section header="Filter">
          <div className="space-y-4 p-4">
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
              <span className="text-ios-tertiary">—</span>
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
                className="text-ios-footnote text-ios-blue"
              >
                Filter zurücksetzen
              </button>
            ) : null}
          </div>
        </Section>

        <ConsumptionSummary points={filteredPoints} consumption={filteredConsumption} />

        {filteredPoints.length === 0 ? (
          <EmptyState
            icon={<Filter size={32} />}
            title="Keine Messstellen entsprechen dem Filter"
          />
        ) : (
          filteredPoints.map((mp) => (
            <MeasuringPointCard
              key={mp.id}
              mp={mp}
              consumption={(consumptions[mp.id] ?? []).filter((p) => {
                if (from && p.period_end < from) return false;
                if (to && p.period_end > to) return false;
                return true;
              })}
              readings={(readingsByMP[mp.id] ?? []).filter((r) => {
                const day = r.reading_at.slice(0, 10);
                if (from && day < from) return false;
                if (to && day > to) return false;
                return true;
              })}
              state={states[mp.id] ?? []}
              onChanged={() => setTick((t) => t + 1)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-ios-footnote text-ios-secondary">{label}</div>
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
      className="rounded-ios bg-ios-elevated px-3 py-1.5 text-ios-footnote text-ios-label"
      {...rest}
    />
  );
}

function MeasuringPointCard({
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
  const consumptionMerged = new Map<string, Record<string, number | string>>();
  for (const p of consumption) {
    const row = consumptionMerged.get(p.period_end) ?? { date: p.period_end };
    row[p.obis_code] = Number(p.consumption);
    consumptionMerged.set(p.period_end, row);
  }
  const consumptionSeries = Array.from(consumptionMerged.values()).sort((a, b) =>
    String(a['date']).localeCompare(String(b['date'])),
  );

  // Stand-Serie (reading_date → value pro OBIS)
  // OBIS pro Reading anhand Register-Index aus mp ableiten
  const obisByRegister = new Map<number, string>();
  for (const meter of mp.physical_meters) {
    for (const r of meter.registers) obisByRegister.set(r.id, r.obis_code);
  }
  const levelMerged = new Map<string, Record<string, number | string>>();
  for (const r of readings) {
    const code = obisByRegister.get(r.register_id);
    if (!code) continue;
    const row = levelMerged.get(r.reading_at) ?? { date: r.reading_at };
    row[code] = Number(r.value);
    levelMerged.set(r.reading_at, row);
  }
  const levelSeries = Array.from(levelMerged.values()).sort((a, b) =>
    String(a['date']).localeCompare(String(b['date'])),
  );

  const series = mode === 'consumption' ? consumptionSeries : levelSeries;

  // OBIS-Codes je nach Modus aus den passenden Daten
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

  const labelByObis = new Map<string, string>();
  const unitByObis = new Map<string, string>();
  for (const meter of mp.physical_meters) {
    for (const r of meter.registers) {
      if (!labelByObis.has(r.obis_code)) labelByObis.set(r.obis_code, r.label);
      if (!unitByObis.has(r.obis_code)) unitByObis.set(r.obis_code, r.unit);
    }
  }
  const seriesLabel = (code: string) => {
    const base = labelByObis.get(code) ?? code;
    return mode === 'consumption' ? `Verbrauch · ${base}` : base;
  };

  // Verbrauchssumme pro OBIS-Code im Zeitraum (für die numerische Anzeige).
  const consumptionTotals = new Map<string, { sum: number; unit: string }>();
  for (const p of consumption) {
    const e = consumptionTotals.get(p.obis_code) ?? { sum: 0, unit: p.unit };
    e.sum += Number(p.consumption);
    consumptionTotals.set(p.obis_code, e);
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="font-rounded text-ios-title2">{mp.name}</h2>
        <span className="rounded-full bg-ios-fill/15 px-2 py-0.5 text-ios-caption uppercase tracking-wide text-ios-secondary">
          {TYPE_LABELS[mp.type]}
        </span>
        {mp.location_name ? (
          <span className="text-ios-footnote text-ios-tertiary">· {mp.location_name}</span>
        ) : null}
        {unit ? (
          <span className="ml-auto text-ios-caption text-ios-tertiary">in {unit}</span>
        ) : null}
      </div>

      {state.length > 0 ? (
        <div className="mb-3 space-y-2">
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
            <div className="grid gap-2 sm:grid-cols-2">
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
        <div className="mb-3 rounded-ios-lg bg-ios-elevated/60 p-3">
          <div className="text-ios-footnote uppercase tracking-wide text-ios-tertiary">
            Verbrauch im Zeitraum
          </div>
          <ul className="mt-1 space-y-0.5">
            {Array.from(consumptionTotals.entries()).map(([code, t]) => (
              <li key={code} className="flex items-baseline justify-between gap-3 text-ios-body">
                <span className="truncate">{labelByObis.get(code) ?? code}</span>
                <span className="font-rounded tabular-nums">
                  {formatDe(t.sum)}{' '}
                  <span className="text-ios-footnote text-ios-tertiary">{t.unit}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Pill active={mode === 'consumption'} onClick={() => setMode('consumption')}>
          Verbrauch
        </Pill>
        <Pill active={mode === 'level'} onClick={() => setMode('level')}>
          Stand ({readings.length})
        </Pill>
      </div>

      {series.length === 0 ? (
        <p className="text-ios-footnote text-ios-tertiary">
          {mode === 'consumption'
            ? 'Keine Verbrauchsdaten im gewählten Zeitraum.'
            : 'Keine Stände im gewählten Zeitraum.'}
        </p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 10, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: theme.axis }} stroke={theme.axis} />
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
                contentStyle={{
                  backgroundColor: theme.tooltipBg,
                  border: `1px solid ${theme.tooltipBorder}`,
                  borderRadius: 12,
                  color: theme.label,
                }}
                labelStyle={{ color: theme.label }}
                formatter={(value, name) => [
                  `${formatDe(value as number)}${unit ? ' ' + unit : ''}`,
                  seriesLabel(String(name)),
                ]}
              />
              <Legend
                formatter={(name) => seriesLabel(String(name))}
                wrapperStyle={{ fontSize: 12, color: theme.label }}
              />
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
}

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
  const fillBarColor =
    percent === null
      ? 'bg-ios-fill/30'
      : percent < 20
        ? 'bg-ios-red'
        : percent < 50
          ? 'bg-ios-orange'
          : 'bg-ios-green';

  return (
    <div className="rounded-ios-lg bg-ios-elevated/60 p-4">
      <div className="text-ios-footnote uppercase tracking-wide text-ios-tertiary">
        {state.label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-rounded text-ios-largetitle tabular-nums">
          {current !== null ? formatDe(current) : '—'}
        </span>
        <span className="text-ios-headline text-ios-secondary">{state.unit}</span>
        {percent !== null ? (
          <span className="ml-auto font-rounded text-ios-title2 tabular-nums text-ios-secondary">
            {formatDe(percent, { maximumFractionDigits: 0 })} %
          </span>
        ) : null}
      </div>

      {percent !== null ? (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ios-fill/15">
          <div
            className={`h-full ${fillBarColor} transition-all`}
            style={{ width: `${percent.toFixed(1)}%` }}
          />
        </div>
      ) : null}

      <div className="mt-2 space-y-0.5 text-ios-caption text-ios-tertiary">
        {capacity ? (
          <div>
            Tankvolumen: {formatDe(capacity)} {state.unit}
          </div>
        ) : (
          <div>
            Tankvolumen nicht gesetzt — für Prozent-Anzeige in Messstellen-Stammdaten ergänzen.
          </div>
        )}
        <div>
          {state.last_reading_at
            ? `Letzter Stand: ${formatDe(state.last_reading_value ?? '0')} ${state.unit} (${formatDateTimeDe(state.last_reading_at)})`
            : 'noch keine Erfassung'}
        </div>
        {Number(state.refilled_since) > 0 ? (
          <div className="text-ios-blue">
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
      <div className="text-ios-footnote text-ios-tertiary">
        {mp.name} · {state.label} ({state.unit})
      </div>
      {state.last_reading_at ? (
        <div className="rounded-ios bg-ios-elevated p-3 text-ios-footnote">
          <div className="text-ios-tertiary">Bisheriger Stand:</div>
          <div className="font-rounded text-ios-headline tabular-nums">
            {formatDe(state.last_reading_value ?? '0')} {state.unit}
            <span className="ml-2 text-ios-caption text-ios-tertiary">
              ({formatDateTimeDe(state.last_reading_at)})
            </span>
          </div>
          {Number(state.refilled_since) > 0 ? (
            <div className="text-ios-caption text-ios-blue">
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
        <div className="p-4 text-ios-footnote text-ios-tertiary">
          Im gewählten Zeitraum gibt es keine zwei aufeinanderfolgenden Erfassungen, aus denen ein
          Verbrauch berechnet werden könnte.
        </div>
      ) : (
        <ul className="divide-y divide-ios-separator/60">
          {buckets.map((b) => (
            <li key={b.label} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 truncate text-ios-body">{b.label}</div>
              <div className="font-rounded text-ios-headline tabular-nums">
                {formatDe(b.sum)}{' '}
                <span className="text-ios-footnote text-ios-tertiary">{b.unit}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const TYPE_ORDER: MeterType[] = ['electricity', 'gas', 'water', 'oil'];

function CurrentStateTile({ state }: { state: RegisterStateRead }) {
  return (
    <div className="rounded-ios-lg bg-ios-elevated/60 p-3">
      <div className="text-ios-footnote text-ios-tertiary">{state.label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-rounded text-ios-title2 tabular-nums">
          {state.current_value !== null ? formatDe(state.current_value) : '—'}
        </span>
        <span className="text-ios-footnote text-ios-secondary">{state.unit}</span>
      </div>
      <div className="mt-1 text-ios-caption text-ios-tertiary">
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
