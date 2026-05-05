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
import { describeMeterType } from '@/lib/meterLabels';
import type {
  DeliveryRead,
  MeasuringPointRead,
  ReadingRead,
  RegisterRead,
  RegisterStateRead,
} from '@/lib/types';
import { cx } from '@/components/ui/cx';

type Mode = 'reading' | 'delivery';

interface ActiveRegister {
  meterId: number;
  register: RegisterRead;
}

function activeRegistersOf(mp: MeasuringPointRead): ActiveRegister[] {
  const out: ActiveRegister[] = [];
  for (const meter of mp.physical_meters) {
    if (meter.removed_at !== null) continue;
    for (const r of meter.registers) {
      if (r.is_active) out.push({ meterId: meter.id, register: r });
    }
  }
  return out;
}

export function RecordReadingPage() {
  const [points, setPoints] = useState<MeasuringPointRead[] | null>(null);
  const [stateByRegister, setStateByRegister] = useState<Map<number, RegisterStateRead>>(
    () => new Map(),
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mpId, setMpId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('reading');

  useEffect(() => {
    api
      .get<MeasuringPointRead[]>('/measuring-points')
      .then(setPoints)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setLoadError(err.problem.detail ?? err.problem.title);
      });
  }, []);

  // Letzte Stände aller MPs nachladen — wir brauchen sie für die
  // Plausibilitäts-Deltas pro Register.
  const refreshStates = (current: MeasuringPointRead[] | null) => {
    if (!current) return;
    void Promise.all(
      current.map((mp) =>
        api
          .get<RegisterStateRead[]>(`/measuring-points/${mp.id}/state`)
          .catch(() => [] as RegisterStateRead[]),
      ),
    ).then((results) => {
      const next = new Map<number, RegisterStateRead>();
      for (const list of results) {
        for (const s of list) next.set(s.register_id, s);
      }
      setStateByRegister(next);
    });
  };

  useEffect(() => {
    refreshStates(points);
  }, [points]);

  // MP-Auswahl: Default = erste MP mit aktiven Registern
  useEffect(() => {
    if (!points) return;
    if (mpId !== null && points.some((mp) => mp.id === mpId)) return;
    const first = points.find((mp) => activeRegistersOf(mp).length > 0);
    if (first) setMpId(first.id);
  }, [points, mpId]);

  const selectedMP = useMemo(
    () => (points && mpId !== null ? (points.find((mp) => mp.id === mpId) ?? null) : null),
    [points, mpId],
  );
  const selectedRegisters = useMemo(
    () => (selectedMP ? activeRegistersOf(selectedMP) : []),
    [selectedMP],
  );
  const deliveryRegisters = useMemo(
    () => selectedRegisters.filter((ar) => ar.register.accepts_deliveries),
    [selectedRegisters],
  );

  if (!points) {
    return (
      <PageContainer>
        <LargeTitle title="Erfassen" />
        <div className="text-tertiary">Lade…</div>
        {loadError ? (
          <div className="border-danger/40 bg-danger/10 mt-3 rounded-card border-hairline p-3 text-caption text-danger">
            {loadError}
          </div>
        ) : null}
      </PageContainer>
    );
  }

  const recordableMPs = points.filter((mp) => activeRegistersOf(mp).length > 0);
  if (recordableMPs.length === 0) {
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

  return (
    <PageContainer>
      <div className="space-y-5">
        <LargeTitle title="Erfassen" />

        <Section header="Messstelle">
          <div className="p-5">
            <Select value={mpId ?? ''} onChange={(e) => setMpId(Number(e.target.value))}>
              {recordableMPs.map((mp) => (
                <option key={mp.id} value={mp.id}>
                  {mp.name}
                </option>
              ))}
            </Select>
            {selectedMP ? (
              <div className="mt-3 flex items-center gap-2.5 text-caption text-tertiary">
                <TypeBadge type={selectedMP.type} size="sm" />
                <span>{describeMeterType(selectedMP.type, selectedMP.heating_source)}</span>
                {selectedMP.location_name ? <span>· {selectedMP.location_name}</span> : null}
              </div>
            ) : null}
            {selectedMP && selectedMP.transformer_factor !== null ? (
              <div className="border-primary/40 mt-3 rounded-card border-hairline bg-primary-soft p-3 text-caption text-primary-deep">
                Wandlerfaktor ×{selectedMP.transformer_factor} — gib hier den Sekundärwert vom
                Zähler ein. Verbräuche werden mit diesem Faktor multipliziert.
              </div>
            ) : null}
          </div>
        </Section>

        {deliveryRegisters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill active={mode === 'reading'} onClick={() => setMode('reading')}>
              Stände
            </Pill>
            <Pill active={mode === 'delivery'} onClick={() => setMode('delivery')}>
              Lieferung
            </Pill>
          </div>
        ) : null}

        {selectedMP ? (
          mode === 'reading' ? (
            <ReadingsForm
              mp={selectedMP}
              registers={selectedRegisters}
              stateByRegister={stateByRegister}
              onSaved={() => refreshStates(points)}
            />
          ) : (
            <DeliveryForm registers={deliveryRegisters} onSaved={() => refreshStates(points)} />
          )
        ) : null}
      </div>
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Stände-Formular: alle aktiven Register einer MP gleichzeitig erfassen.
// ---------------------------------------------------------------------------

function ReadingsForm({
  mp,
  registers,
  stateByRegister,
  onSaved,
}: {
  mp: MeasuringPointRead;
  registers: ActiveRegister[];
  stateByRegister: Map<number, RegisterStateRead>;
  onSaved: () => void;
}) {
  // Pro MP eigene Form-State, damit Wechsel der MP die Eingaben löscht.
  const [values, setValues] = useState<Record<number, string>>({});
  const [readingAt, setReadingAt] = useState(nowForInput());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset, wenn die MP wechselt.
  useEffect(() => {
    setValues({});
    setReadingAt(nowForInput());
    setNote('');
    setSuccess(null);
    setError(null);
  }, [mp.id]);

  function setValue(registerId: number, v: string) {
    setValues((prev) => ({ ...prev, [registerId]: v }));
  }

  async function postOne(
    registerId: number,
    numeric: string,
    acknowledge: boolean,
  ): Promise<ReadingRead> {
    return api.post<ReadingRead>('/readings', {
      register_id: registerId,
      value: numeric,
      reading_at: readingAt,
      note: note || null,
      acknowledge_warnings: acknowledge,
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const filled = registers
      .map((ar) => ({
        ar,
        raw: (values[ar.register.id] ?? '').trim(),
      }))
      .filter((x) => x.raw !== '');
    if (filled.length === 0) {
      setError('Bitte mindestens einen Wert eingeben.');
      return;
    }
    setBusy(true);
    let savedCount = 0;
    try {
      for (const { ar, raw } of filled) {
        let numeric: string;
        try {
          numeric = parseDe(raw);
        } catch (err) {
          if (err instanceof RangeError) {
            throw new Error(`${ar.register.label}: ${err.message}`);
          }
          throw err;
        }
        try {
          await postOne(ar.register.id, numeric, false);
        } catch (err) {
          if (err instanceof ApiError && isPlausibilityWarning(err)) {
            const detail = err.problem.detail ?? err.problem.title;
            const ok = window.confirm(
              `${ar.register.label} (${ar.register.obis_code}): ${detail}\n\nTrotzdem speichern?`,
            );
            if (!ok) continue;
            await postOne(ar.register.id, numeric, true);
          } else {
            throw err;
          }
        }
        savedCount += 1;
      }
      if (savedCount > 0) {
        setSuccess(
          savedCount === 1
            ? '1 Stand gespeichert.'
            : `${savedCount} Stände gespeichert (${formatDateTimeDe(readingAt)}).`,
        );
        setValues({});
        setNote('');
        onSaved();
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof Error) setError(err.message);
      else setError('Konnte Eintrag nicht speichern.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 pb-44 md:pb-8">
      <Section header="Stände">
        <div className="space-y-4 p-5">
          {registers.map((ar) => {
            const state = stateByRegister.get(ar.register.id) ?? null;
            return (
              <RegisterRow
                key={ar.register.id}
                register={ar.register}
                state={state}
                value={values[ar.register.id] ?? ''}
                onChange={(v) => setValue(ar.register.id, v)}
                transformerFactor={mp.transformer_factor}
              />
            );
          })}
        </div>
      </Section>

      <Section header="Zeitpunkt & Notiz">
        <div className="space-y-3 p-5">
          <TextField
            label="Ablesedatum"
            type="datetime-local"
            value={readingAt}
            onChange={(e) => setReadingAt(e.target.value)}
            required
          />
          <TextField
            label="Notiz (optional)"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            hint="Wird auf alle Register dieser Erfassung übernommen."
          />
        </div>
      </Section>

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

      <StickySave busy={busy} disabled={registers.length === 0} />
    </form>
  );
}

function RegisterRow({
  register,
  state,
  value,
  onChange,
  transformerFactor,
}: {
  register: RegisterRead;
  state: RegisterStateRead | null;
  value: string;
  onChange: (v: string) => void;
  transformerFactor: number | null;
}) {
  const parsed = (() => {
    try {
      return value.trim() === '' ? null : Number(parseDe(value));
    } catch {
      return null;
    }
  })();
  const lastValue = state?.last_reading_value ? Number(state.last_reading_value) : null;
  const rawDelta = parsed !== null && lastValue !== null ? parsed - lastValue : null;
  const delta =
    rawDelta !== null && transformerFactor !== null ? rawDelta * transformerFactor : rawDelta;
  const negative = delta !== null && delta < 0 && !register.accepts_deliveries;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-body font-semibold text-label">{register.label}</span>
        <code className="num rounded-badge bg-fill px-1.5 py-0.5 text-caption text-tertiary">
          {register.obis_code}
        </code>
        <span className="text-caption text-tertiary">
          letzter Stand:{' '}
          {state?.last_reading_value
            ? `${formatDe(state.last_reading_value)} ${register.unit}`
            : '—'}
          {state?.last_reading_at ? ` · ${formatDateTimeDe(state.last_reading_at)}` : ''}
        </span>
      </div>
      <div className="flex items-stretch gap-2">
        <TextField
          label={register.unit}
          type="text"
          inputMode="decimal"
          pattern="[0-9.,]+"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="leer = nicht erfassen"
          numeric
          inputClassName="text-headline"
        />
      </div>
      {delta !== null ? (
        <div
          className={cx(
            'mx-auto w-fit rounded-full px-3 py-1 text-caption font-semibold',
            negative ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success',
          )}
        >
          {negative ? '⚠ ' : '+'}
          {formatDe(delta)} {register.unit}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lieferungs-Formular: ein Register + Menge + Zeitpunkt.
// ---------------------------------------------------------------------------

function DeliveryForm({
  registers,
  onSaved,
}: {
  registers: ActiveRegister[];
  onSaved: () => void;
}) {
  const [registerId, setRegisterId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [deliveryAt, setDeliveryAt] = useState(nowForInput());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (registers.length === 0) {
      setRegisterId(null);
      return;
    }
    if (!registers.some((ar) => ar.register.id === registerId)) {
      const first = registers[0];
      if (first) setRegisterId(first.register.id);
    }
  }, [registers, registerId]);

  const selected = registers.find((ar) => ar.register.id === registerId) ?? null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (registerId === null) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const numeric = parseDe(amount);
      const created = await api.post<DeliveryRead>(`/registers/${registerId}/deliveries`, {
        amount: numeric,
        delivery_at: deliveryAt,
        note: note || null,
      });
      setSuccess(
        `Lieferung erfasst: ${formatDe(created.amount)} (${formatDateTimeDe(created.delivery_at)}).`,
      );
      setAmount('');
      setNote('');
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else if (err instanceof RangeError) setError(err.message);
      else setError('Konnte Lieferung nicht erfassen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 pb-44 md:pb-8">
      <Section header="Lieferung">
        <div className="space-y-3 p-5">
          {registers.length > 1 ? (
            <Select
              label="Register"
              value={registerId ?? ''}
              onChange={(e) => setRegisterId(Number(e.target.value))}
            >
              {registers.map((ar) => (
                <option key={ar.register.id} value={ar.register.id}>
                  {ar.register.label} ({ar.register.unit})
                </option>
              ))}
            </Select>
          ) : null}
          <TextField
            label={`Menge (${selected?.register.unit ?? ''})`}
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]+"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            numeric
            inputClassName="text-headline"
          />
          <TextField
            label="Lieferdatum"
            type="datetime-local"
            value={deliveryAt}
            onChange={(e) => setDeliveryAt(e.target.value)}
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

      <StickySave busy={busy} disabled={registerId === null} />
    </form>
  );
}

function StickySave({ busy, disabled }: { busy: boolean; disabled: boolean }) {
  return (
    <div className="glass fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] left-0 right-0 z-30 border-t-hairline border-border bg-surface-high px-4 py-3 md:static md:bottom-auto md:border-0 md:bg-transparent md:p-0 md:pt-2">
      <Button
        type="submit"
        variant="filled"
        size="lg"
        fullWidth
        leftIcon={<Check size={18} />}
        disabled={busy || disabled}
      >
        {busy ? 'Speichere…' : 'Speichern'}
      </Button>
    </div>
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
