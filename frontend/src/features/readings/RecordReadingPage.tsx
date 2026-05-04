import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Gauge } from 'lucide-react';

import {
  Button,
  EmptyState,
  LargeTitle,
  Pill,
  Section,
  Select,
  TextField,
  TypeBadge,
} from '@/components/ui';
import { PageGlows } from '@/components/PageGlows';
import { ApiError, api, isPlausibilityWarning } from '@/lib/api';
import { formatDateTimeDe, formatDe, nowForInput, parseDe } from '@/lib/format';
import type {
  DeliveryRead,
  MeasuringPointRead,
  PhysicalMeterRead,
  ReadingRead,
  RegisterRead,
  RegisterStateRead,
} from '@/lib/types';
import { cx } from '@/components/ui/cx';

interface ActiveRegister {
  measuringPoint: MeasuringPointRead;
  meter: PhysicalMeterRead;
  register: RegisterRead;
}

type Mode = 'reading' | 'delivery';

export function RecordReadingPage() {
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [stateByRegister, setStateByRegister] = useState<Map<number, RegisterStateRead>>(
    () => new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<Mode>('reading');
  const [registerId, setRegisterId] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [readingAt, setReadingAt] = useState(nowForInput());
  const [note, setNote] = useState('');

  useEffect(() => {
    api
      .get<MeasuringPointRead[]>('/measuring-points')
      .then(setPoints)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      });
  }, []);

  // Letzte Stände nachladen, damit der Plausibilitätscheck (Delta) funktionieren kann.
  useEffect(() => {
    if (!points) return;
    let cancelled = false;
    void Promise.all(
      points.map((mp) =>
        api
          .get<RegisterStateRead[]>(`/measuring-points/${mp.id}/state`)
          .catch(() => [] as RegisterStateRead[]),
      ),
    ).then((results) => {
      if (cancelled) return;
      const next = new Map<number, RegisterStateRead>();
      for (const list of results) {
        for (const s of list) next.set(s.register_id, s);
      }
      setStateByRegister(next);
    });
    return () => {
      cancelled = true;
    };
  }, [points]);

  const activeRegisters = useMemo<ActiveRegister[]>(() => {
    if (!points) return [];
    const out: ActiveRegister[] = [];
    for (const mp of points) {
      for (const meter of mp.physical_meters) {
        if (meter.removed_at !== null) continue;
        for (const register of meter.registers) {
          if (register.is_active) {
            out.push({ measuringPoint: mp, meter, register });
          }
        }
      }
    }
    return out;
  }, [points]);

  const filteredRegisters = useMemo(
    () =>
      mode === 'delivery'
        ? activeRegisters.filter((ar) => ar.register.accepts_deliveries)
        : activeRegisters,
    [activeRegisters, mode],
  );

  useEffect(() => {
    if (filteredRegisters.length === 0) {
      setRegisterId(null);
      return;
    }
    if (!filteredRegisters.some((ar) => ar.register.id === registerId)) {
      const first = filteredRegisters[0];
      if (first) setRegisterId(first.register.id);
    }
  }, [filteredRegisters, registerId]);

  const hasDeliveryTargets = activeRegisters.some((ar) => ar.register.accepts_deliveries);

  const selected = useMemo(
    () => filteredRegisters.find((ar) => ar.register.id === registerId) ?? null,
    [filteredRegisters, registerId],
  );

  const lastState = registerId !== null ? (stateByRegister.get(registerId) ?? null) : null;
  const parsedValue = (() => {
    try {
      return value.trim() === '' ? null : Number(parseDe(value));
    } catch {
      return null;
    }
  })();
  const lastValue = lastState?.last_reading_value ? Number(lastState.last_reading_value) : null;
  const delta =
    parsedValue !== null && lastValue !== null && mode === 'reading'
      ? parsedValue - lastValue
      : null;
  const deltaIsNegative = delta !== null && delta < 0 && !selected?.register.accepts_deliveries;

  async function submitReading(acknowledge: boolean) {
    if (registerId === null) return;
    const numeric = parseDe(value);
    if (mode === 'reading') {
      const created = await api.post<ReadingRead>('/readings', {
        register_id: registerId,
        value: numeric,
        reading_at: readingAt,
        note: note || null,
        acknowledge_warnings: acknowledge,
      });
      setSuccess(
        `Stand gespeichert: ${formatDe(created.value)} (${formatDateTimeDe(created.reading_at)}).`,
      );
    } else {
      const created = await api.post<DeliveryRead>(`/registers/${registerId}/deliveries`, {
        amount: numeric,
        delivery_date: readingAt.slice(0, 10),
        note: note || null,
      });
      setSuccess(`Lieferung erfasst: ${formatDe(created.amount)} (${created.delivery_date}).`);
    }
    setValue('');
    setNote('');
    if (points) {
      void Promise.all(
        points.map((mp) =>
          api
            .get<RegisterStateRead[]>(`/measuring-points/${mp.id}/state`)
            .catch(() => [] as RegisterStateRead[]),
        ),
      ).then((results) => {
        const next = new Map<number, RegisterStateRead>();
        for (const list of results) for (const s of list) next.set(s.register_id, s);
        setStateByRegister(next);
      });
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (registerId === null) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await submitReading(false);
    } catch (err) {
      if (err instanceof ApiError && isPlausibilityWarning(err)) {
        const detail = err.problem.detail ?? err.problem.title;
        if (window.confirm(`${detail}\n\nTrotzdem speichern?`)) {
          try {
            await submitReading(true);
          } catch (retryErr) {
            if (retryErr instanceof ApiError) {
              setError(retryErr.problem.detail ?? retryErr.problem.title);
            } else {
              setError('Konnte Eintrag nicht speichern.');
            }
          }
        }
      } else if (err instanceof ApiError) {
        setError(err.problem.detail ?? err.problem.title);
      } else if (err instanceof RangeError) {
        setError(err.message);
      } else {
        setError('Konnte Eintrag nicht speichern.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!points) {
    return (
      <PageContainer>
        <LargeTitle title="Erfassen" />
        <div className="text-tertiary">Lade…</div>
      </PageContainer>
    );
  }
  if (activeRegisters.length === 0) {
    return (
      <PageContainer>
        <LargeTitle title="Erfassen" />
        <EmptyState
          icon={<Gauge size={32} />}
          title="Keine aktiven Register"
          description="Lege zuerst eine Messstelle an."
        />
      </PageContainer>
    );
  }

  const valueLabel = mode === 'delivery' ? 'Liefermenge' : 'Stand';
  const dateLabel = mode === 'delivery' ? 'Lieferdatum' : 'Ablesedatum';
  const unit = selected?.register.unit ?? '';

  return (
    <PageContainer>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 pb-44 md:pb-8">
        <LargeTitle title="Erfassen" />

        {hasDeliveryTargets ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill active={mode === 'reading'} onClick={() => setMode('reading')}>
              Stand
            </Pill>
            <Pill active={mode === 'delivery'} onClick={() => setMode('delivery')}>
              Lieferung
            </Pill>
          </div>
        ) : null}

        {filteredRegisters.length === 0 ? (
          <EmptyState
            icon={<Gauge size={32} />}
            title="Kein nachfüllbares Register"
            description="Lieferungen können nur an Tank-Registern (Heizöl) erfasst werden."
          />
        ) : (
          <>
            <Section header="Register">
              <div className="p-5">
                <Select
                  value={registerId ?? ''}
                  onChange={(e) => setRegisterId(Number(e.target.value))}
                >
                  {filteredRegisters.map((ar) => (
                    <option key={ar.register.id} value={ar.register.id}>
                      {ar.measuringPoint.name} — {ar.register.label} ({ar.register.obis_code},{' '}
                      {ar.register.unit})
                    </option>
                  ))}
                </Select>
                {selected ? (
                  <div className="mt-3 flex items-center gap-2.5 text-caption text-tertiary">
                    <TypeBadge type={selected.measuringPoint.type} size="sm" />
                    <span className="font-mono">{selected.register.obis_code}</span>
                    {selected.measuringPoint.location_name ? (
                      <span>· {selected.measuringPoint.location_name}</span>
                    ) : null}
                  </div>
                ) : null}
                {selected && selected.measuringPoint.transformer_factor !== null ? (
                  <div className="mt-3 rounded-card border-hairline border-primary/40 bg-primary-soft p-3 text-caption text-primary-deep">
                    Wandlerfaktor ×{selected.measuringPoint.transformer_factor} — gib hier den
                    Sekundärwert vom Zähler ein. Verbräuche werden mit diesem Faktor multipliziert.
                  </div>
                ) : null}
              </div>
            </Section>

            {/* Hero-Number-Anzeige + Eingabefeld kombiniert */}
            <Section header={mode === 'delivery' ? 'Lieferung' : 'Erfassung'}>
              <div className="space-y-4 p-5">
                {/* Großer Live-Wert oberhalb des Feldes */}
                <div className="flex items-baseline justify-center gap-2 py-2">
                  <span
                    className={cx(
                      'num text-display leading-none tracking-tighter',
                      parsedValue === null ? 'text-quaternary' : 'text-label',
                    )}
                  >
                    {parsedValue === null ? '—' : formatDe(parsedValue)}
                  </span>
                  {unit ? <span className="text-headline text-secondary">{unit}</span> : null}
                </div>

                {/* Plausibilitätscheck-Delta */}
                {delta !== null ? (
                  <div
                    data-testid="reading-delta"
                    className={cx(
                      'mx-auto w-fit rounded-full px-3 py-1 text-caption font-semibold',
                      deltaIsNegative ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success',
                    )}
                  >
                    {deltaIsNegative ? '⚠ ' : '+'}
                    {formatDe(delta)} {unit}
                    {lastState?.last_reading_at
                      ? ` seit ${formatDateTimeDe(lastState.last_reading_at)}`
                      : ''}
                  </div>
                ) : null}

                <TextField
                  label={valueLabel}
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]+"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={mode === 'delivery' ? 'z. B. 1.500' : 'z. B. 12.345,678'}
                  required
                  numeric
                  inputClassName="text-headline"
                />
                <TextField
                  label={dateLabel}
                  type={mode === 'delivery' ? 'date' : 'datetime-local'}
                  value={mode === 'delivery' ? readingAt.slice(0, 10) : readingAt}
                  onChange={(e) =>
                    setReadingAt(mode === 'delivery' ? `${e.target.value}T12:00` : e.target.value)
                  }
                  required
                />
                <TextField
                  label="Notiz (optional)"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </Section>
          </>
        )}

        {error ? (
          <div
            data-testid="record-error"
            className="border-danger/40 bg-danger/10 rounded-card border-hairline p-3 text-caption text-danger"
          >
            {error}
          </div>
        ) : null}
        {success ? (
          <div
            data-testid="record-success"
            className="border-success/40 bg-success/10 rounded-card border-hairline p-3 text-caption text-success"
          >
            {success}
          </div>
        ) : null}

        {/* Sticky save bar — Mobile: schwebt ÜBER der Tab-Bar (z-30 schlägt
            deren z-20, bottom-Offset = Tab-Bar-Höhe). Desktop: statisch
            unter dem letzten Form-Feld. */}
        <div className="glass fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] left-0 right-0 z-30 border-t-hairline border-border bg-surface-high px-4 py-3 md:static md:bottom-auto md:border-0 md:bg-transparent md:p-0 md:pt-2">
          <Button
            type="submit"
            variant="filled"
            size="lg"
            fullWidth
            leftIcon={<Check size={18} />}
            disabled={busy || filteredRegisters.length === 0}
          >
            {busy ? 'Speichere…' : 'Speichern'}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}

function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <PageGlows accent="electricity" />
      <div className="relative z-10 p-4 md:p-7">{children}</div>
    </div>
  );
}
