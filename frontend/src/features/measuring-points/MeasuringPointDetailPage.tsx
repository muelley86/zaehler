import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Map as MapIcon } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, EmptyState, LargeTitle, Section, TypeBadge } from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { LocationMapSheet } from '@/components/LocationMapSheet';
import { ApiError, api } from '@/lib/api';
import { formatDateTimeDe, formatDe } from '@/lib/format';
import { useChartTheme } from '@/lib/useChartTheme';
import type {
  ConsumptionPoint,
  LocationRead,
  MeasuringPointRead,
  RegisterStateRead,
} from '@/lib/types';
import { describeMeterType } from '@/lib/meterLabels';

export function MeasuringPointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const mpId = id ? Number(id) : NaN;

  const [mp, setMp] = useState<MeasuringPointRead | null>(null);
  const [location, setLocation] = useState<LocationRead | null>(null);
  const [consumption, setConsumption] = useState<ConsumptionPoint[]>([]);
  const [states, setStates] = useState<RegisterStateRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(mpId)) {
      navigate('/messstellen', { replace: true });
      return;
    }
    api
      .get<MeasuringPointRead>(`/measuring-points/${mpId}`)
      .then((data) => {
        setMp(data);
        if (data.location_id !== null) {
          api
            .get<LocationRead>(`/locations/${data.location_id}`)
            .then(setLocation)
            .catch(() => {
              /* nicht kritisch — Standort-Detail optional */
            });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
        else setError('Konnte Messstelle nicht laden.');
      });
    api
      .get<ConsumptionPoint[]>(`/measuring-points/${mpId}/consumption`)
      .then(setConsumption)
      .catch(() => {
        /* nicht kritisch */
      });
    api
      .get<RegisterStateRead[]>(`/measuring-points/${mpId}/state`)
      .then(setStates)
      .catch(() => {
        /* nicht kritisch */
      });
  }, [mpId, navigate]);

  if (error) {
    return (
      <PageContainer>
        <BackLink />
        <div className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-danger">
          {error}
        </div>
      </PageContainer>
    );
  }
  if (!mp) {
    return (
      <PageContainer>
        <BackLink />
        <div className="text-tertiary">Lade…</div>
      </PageContainer>
    );
  }

  const activeMeter = mp.physical_meters.find((m) => m.removed_at === null);

  return (
    <PageContainer>
      <BackLink />
      <div className="flex items-center gap-3">
        <TypeBadge type={mp.type} size="lg" />
        <div className="min-w-0">
          <div className="text-caption-bold uppercase text-tertiary">Messstelle</div>
          <LargeTitle title={mp.name} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="text-caption-bold uppercase text-tertiary">Stammdaten</div>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <FieldRow k="Typ" v={describeMeterType(mp.type, mp.heating_source)} />
            <FieldRow
              k="Standort"
              v={
                mp.location_name ? (
                  location && location.latitude !== null && location.longitude !== null ? (
                    <button
                      type="button"
                      onClick={() => setMapOpen(true)}
                      className="hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-pill bg-primary-soft px-2 py-0.5 font-semibold text-primary-deep transition-colors"
                    >
                      <MapIcon size={14} />
                      {mp.location_name}
                    </button>
                  ) : (
                    <Link
                      to="/standorte"
                      className="font-semibold text-primary-deep underline-offset-2 hover:underline"
                    >
                      {mp.location_name}
                    </Link>
                  )
                ) : (
                  '—'
                )
              }
            />
            {mp.type === 'electricity' ? (
              <>
                <FieldRow k="Doppeltarif" v={mp.has_dual_tariff ? 'Ja' : 'Nein'} />
                <FieldRow k="Bidirektional" v={mp.is_bidirectional ? 'Ja' : 'Nein'} />
                <FieldRow
                  k="Wandlerfaktor"
                  v={mp.transformer_factor !== null ? `×${mp.transformer_factor}` : '—'}
                />
              </>
            ) : null}
            {mp.type === 'heating' && mp.tank_capacity ? (
              <FieldRow
                k="Tankvolumen"
                v={
                  <span className="num">
                    {formatDe(mp.tank_capacity)} <span className="text-tertiary">L</span>
                  </span>
                }
              />
            ) : null}
            <FieldRow k="Aktive Register" v={String(activeMeter?.registers.length ?? 0)} />
            <FieldRow k="Physische Zähler" v={String(mp.physical_meters.length)} />
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-caption-bold uppercase text-tertiary">Aktiver Zähler</div>
              {activeMeter ? (
                <div className="num mt-1 text-headline tracking-tight text-label">
                  {activeMeter.serial_number}
                </div>
              ) : (
                <div className="mt-1 text-body text-tertiary">Kein aktiver Zähler.</div>
              )}
            </div>
            {activeMeter ? (
              <span className="bg-success/15 rounded-full px-2 py-0.5 text-caption font-semibold text-success">
                aktiv
              </span>
            ) : null}
          </div>
          {activeMeter ? (
            <div className="mt-3 text-body-sm text-secondary">
              Eingebaut <span className="num text-label">{activeMeter.installed_at}</span>
            </div>
          ) : null}
          <div className="mt-4 rounded-card border-hairline border-border bg-fill p-3 text-caption text-tertiary">
            Beim Zählertausch wird das aktuelle Gerät mit Datum „entfernt" markiert. Alle
            Erfassungen bleiben erhalten und werden weiterhin diesem Zähler zugeordnet.
          </div>
        </Card>
      </div>

      <ConsumptionChart consumption={consumption} mp={mp} />

      <RegisterTable mp={mp} states={states} />

      {location && location.latitude !== null && location.longitude !== null ? (
        <LocationMapSheet
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          latitude={location.latitude}
          longitude={location.longitude}
          name={location.name}
        />
      ) : null}
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

function BackLink() {
  return (
    <Link
      to="/messstellen"
      className="inline-flex items-center gap-1 text-caption font-semibold text-primary-deep transition-colors hover:text-primary"
    >
      <ArrowLeft size={14} />
      Messstellen
    </Link>
  );
}

function FieldRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-caption text-tertiary">{k}</div>
      <div className="mt-0.5 text-body font-semibold text-label">{v}</div>
    </div>
  );
}

function ConsumptionChart({
  consumption,
  mp,
}: {
  consumption: ConsumptionPoint[];
  mp: MeasuringPointRead;
}) {
  const theme = useChartTheme();

  if (consumption.length === 0) {
    return (
      <Section header="Verbrauchskurve">
        <div className="p-5 text-caption text-tertiary">
          Noch keine Verbrauchsdaten — mindestens zwei Erfassungen pro Register werden benötigt.
        </div>
      </Section>
    );
  }

  // Pro period_end ein Punkt mit allen OBIS-Codes daneben.
  const merged = new Map<string, Record<string, number | string>>();
  for (const p of consumption) {
    const row = merged.get(p.period_end) ?? { date: p.period_end };
    row[p.obis_code] = Number(p.consumption);
    merged.set(p.period_end, row);
  }
  const series = Array.from(merged.values()).sort((a, b) =>
    String(a['date']).localeCompare(String(b['date'])),
  );
  const obisCodes = Array.from(new Set(consumption.map((p) => p.obis_code)));
  const unit = consumption[0]?.unit ?? '';

  const labelByObis = new Map<string, string>();
  for (const meter of mp.physical_meters) {
    for (const r of meter.registers) {
      if (!labelByObis.has(r.obis_code)) labelByObis.set(r.obis_code, r.label);
    }
  }

  const total = consumption.reduce((acc, p) => acc + Number(p.consumption), 0);
  const avg = consumption.length > 0 ? total / consumption.length : 0;

  return (
    <Section header={`Verbrauchskurve · ${consumption.length} Punkte`}>
      <div className="p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <div className="num text-headline text-label">
              {formatDe(total)} <span className="text-tertiary">{unit} gesamt</span>
            </div>
            <div className="num text-caption text-tertiary">
              ⌀ {formatDe(avg)} {unit} pro Periode
            </div>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 10, right: 16, bottom: 8, left: 8 }}>
              <defs>
                {obisCodes.map((code, idx) => (
                  <linearGradient
                    id={`mpd-grad-${code}`}
                    key={`grad-${code}-${idx}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={theme.palette[idx % theme.palette.length]}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="100%"
                      stopColor={theme.palette[idx % theme.palette.length]}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: theme.axis }} stroke={theme.axis} />
              <YAxis
                tick={{ fontSize: 11, fill: theme.axis }}
                stroke={theme.axis}
                tickFormatter={(v) => formatDe(v as number)}
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
                  labelByObis.get(String(name)) ?? String(name),
                ]}
              />
              <Legend
                formatter={(name) => labelByObis.get(String(name)) ?? String(name)}
                wrapperStyle={{ fontSize: 12, color: theme.label }}
              />
              {obisCodes.map((code, idx) => (
                <Area
                  key={code}
                  type="monotone"
                  dataKey={code}
                  name={code}
                  stroke={theme.palette[idx % theme.palette.length]}
                  fill={`url(#mpd-grad-${code})`}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}

function RegisterTable({ mp, states }: { mp: MeasuringPointRead; states: RegisterStateRead[] }) {
  const stateByRegister = new Map(states.map((s) => [s.register_id, s]));
  const allRegisters = mp.physical_meters
    .flatMap((meter) =>
      meter.registers.map((r) => ({
        register: r,
        meterSerial: meter.serial_number,
        meterRemovedAt: meter.removed_at,
      })),
    )
    .sort((a, b) => a.register.obis_code.localeCompare(b.register.obis_code));

  if (allRegisters.length === 0) {
    return <EmptyState title="Keine Register" />;
  }

  return (
    <Section header="Register">
      <ul className="divide-y divide-separator">
        {allRegisters.map(({ register, meterSerial, meterRemovedAt }) => {
          const state = stateByRegister.get(register.id);
          return (
            <li
              key={register.id}
              className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-[110px_1.4fr_1fr_1fr_24px] md:items-center md:gap-4"
            >
              <div>
                <code className="num inline-block rounded-badge bg-primary-soft px-2 py-1 text-caption font-semibold text-primary-deep">
                  {register.obis_code}
                </code>
              </div>
              <div className="min-w-0">
                <div className="truncate text-body font-semibold text-label">{register.label}</div>
                <div className="num truncate text-caption text-tertiary">
                  SN {meterSerial}
                  {meterRemovedAt ? ` · entfernt ${meterRemovedAt}` : ''}
                  {!register.is_active ? ' · inaktiv' : ''}
                </div>
              </div>
              <div>
                {state?.current_value !== null && state?.current_value !== undefined ? (
                  <div className="num text-headline text-label">
                    {formatDe(state.current_value)}{' '}
                    <span className="text-caption text-tertiary">{register.unit}</span>
                  </div>
                ) : (
                  <div className="text-caption text-tertiary">noch keine Erfassung</div>
                )}
              </div>
              <div className="num text-caption text-tertiary">
                {state?.last_reading_at ? formatDateTimeDe(state.last_reading_at) : '—'}
              </div>
              <ChevronRight size={16} className="hidden text-tertiary md:block" />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
