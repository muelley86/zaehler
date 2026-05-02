import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Gauge } from 'lucide-react';

import { Button, EmptyState, LargeTitle, Pill, Section, Select, TextField } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateTimeDe, formatDe, nowForInput, parseDe } from '@/lib/format';
import type {
  DeliveryRead,
  MeasuringPointRead,
  PhysicalMeterRead,
  ReadingRead,
  RegisterRead,
} from '@/lib/types';

interface ActiveRegister {
  measuringPoint: MeasuringPointRead;
  meter: PhysicalMeterRead;
  register: RegisterRead;
}

type Mode = 'reading' | 'delivery';

export function RecordReadingPage() {
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
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

  // Wenn der aktuell gewählte Register beim Modus-Wechsel nicht mehr passt → ersten Eintrag wählen.
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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (registerId === null) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const numeric = parseDe(value);
      if (mode === 'reading') {
        const created = await api.post<ReadingRead>('/readings', {
          register_id: registerId,
          value: numeric,
          reading_at: readingAt,
          note: note || null,
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
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof RangeError) setError(err.message);
      else setError('Konnte Eintrag nicht speichern.');
    } finally {
      setBusy(false);
    }
  }

  if (!points) {
    return (
      <div className="space-y-5">
        <LargeTitle title="Erfassen" />
        <div className="px-4 text-ios-tertiary">Lade…</div>
      </div>
    );
  }
  if (activeRegisters.length === 0) {
    return (
      <div className="space-y-5">
        <LargeTitle title="Erfassen" />
        <div className="px-4">
          <EmptyState
            icon={<Gauge size={32} />}
            title="Keine aktiven Register"
            description="Lege zuerst eine Messstelle an."
          />
        </div>
      </div>
    );
  }

  const valueLabel = mode === 'delivery' ? 'Liefermenge' : 'Stand';
  const dateLabel = mode === 'delivery' ? 'Lieferdatum' : 'Ablesedatum';

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 pb-28 md:pb-8">
      <LargeTitle title="Erfassen" />

      <div className="space-y-5 px-4">
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
              <div className="p-4">
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
              </div>
            </Section>

            <Section header={mode === 'delivery' ? 'Lieferung' : 'Erfassung'}>
              <div className="space-y-4 p-4">
                <TextField
                  label={valueLabel}
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]+"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={mode === 'delivery' ? 'z. B. 1.500' : 'z. B. 12.345,678'}
                  required
                  inputClassName="text-ios-title font-rounded"
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
          <div className="rounded-ios-lg bg-ios-red/15 p-3 text-ios-footnote text-ios-red">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-ios-lg bg-ios-green/15 p-3 text-ios-footnote text-ios-green">
            {success}
          </div>
        ) : null}
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-ios-separator/60 bg-ios-bg/90 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:px-4 md:pb-0 md:pt-2">
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
  );
}
