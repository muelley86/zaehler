/**
 * Mieter-Formular — geteilt zwischen der Stammdaten-Seite (Anlegen/Bearbeiten)
 * und dem Sheet „Mieter wechseln" einer Messstelle (Neuanlage mit direkter
 * Übernahme). Mieter sind Person (Vorname optional, Nachname Pflicht) oder
 * Firma (nur Firmenname, im Backend als ``last_name`` gespeichert).
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { Button, TextField, cx } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { MieterRead } from '@/lib/types';

import { emptyFormState, toBody } from './mieterFormState';
import type { MieterFormState } from './mieterFormState';

const KIND_OPTIONS: { value: boolean; label: string }[] = [
  { value: false, label: 'Person' },
  { value: true, label: 'Firma' },
];

/** Umschalter Person/Firma — native Radios (Pfeiltasten, ein Tab-Stopp), als Pills gestylt. */
function KindSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label="Mieter-Art"
      className="flex gap-0.5 rounded-pill border-hairline border-border bg-fill p-0.5"
    >
      {KIND_OPTIONS.map((o) => (
        <label
          key={o.label}
          className={cx(
            'flex-1 cursor-pointer rounded-pill px-3 py-1.5 text-center text-body-sm font-semibold transition-colors',
            'focus-within:ring-2 focus-within:ring-primary',
            value === o.value
              ? 'bg-primary-soft text-primary-deep'
              : 'text-secondary hover:bg-fill-strong hover:text-label',
          )}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function FormFields({
  state,
  onChange,
}: {
  state: MieterFormState;
  onChange: (s: MieterFormState) => void;
}) {
  function set<K extends keyof MieterFormState>(key: K, value: MieterFormState[K]) {
    onChange({ ...state, [key]: value });
  }
  return (
    <>
      <KindSwitch value={state.is_company} onChange={(v) => set('is_company', v)} />
      {state.is_company ? (
        <TextField
          label="Firmenname"
          value={state.last_name}
          onChange={(e) => set('last_name', e.target.value)}
          maxLength={80}
          required
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <TextField
            label="Vorname (optional)"
            value={state.first_name}
            onChange={(e) => set('first_name', e.target.value)}
          />
          <TextField
            label="Nachname"
            value={state.last_name}
            onChange={(e) => set('last_name', e.target.value)}
            required
          />
        </div>
      )}
      <TextField
        label="Straße + Hausnr. (optional)"
        value={state.address_street}
        onChange={(e) => set('address_street', e.target.value)}
      />
      <div className="grid grid-cols-3 gap-2">
        <TextField
          label="PLZ"
          value={state.address_postcode}
          onChange={(e) => set('address_postcode', e.target.value)}
          inputMode="numeric"
          pattern="\d{5}"
          maxLength={5}
          hint="5 Ziffern"
        />
        <div className="col-span-2">
          <TextField
            label="Ort"
            value={state.address_city}
            onChange={(e) => set('address_city', e.target.value)}
          />
        </div>
      </div>
      <TextField
        label="E-Mail"
        value={state.email}
        onChange={(e) => set('email', e.target.value)}
        type="email"
      />
      <TextField
        label="Telefon"
        value={state.phone}
        onChange={(e) => set('phone', e.target.value)}
        type="tel"
      />
      <TextField label="Notiz" value={state.note} onChange={(e) => set('note', e.target.value)} />
    </>
  );
}

/**
 * Anlegen-Formular mit eigenem ``<form>``. Liefert den angelegten Mieter aus
 * der POST-Antwort an ``onCreated`` — so kann der Aufrufer ihn direkt
 * auswählen. ``onCancel`` blendet einen Abbrechen-Button ein (während des
 * Speicherns gesperrt). ``autoFocus`` setzt den Fokus beim Einblenden auf den
 * Person/Firma-Umschalter (z. B. wenn das Formular im Sheet eingewechselt wird).
 */
export function MieterCreateForm({
  onCreated,
  onCancel,
  className,
  autoFocus = false,
}: {
  onCreated: (m: MieterRead) => void;
  onCancel?: () => void;
  className?: string;
  autoFocus?: boolean;
}) {
  const [state, setState] = useState<MieterFormState>(() => emptyFormState());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Verwirft Antworten nach Unmount — sonst würde ein verspäteter POST einen
  // Mieter auswählen, obwohl die Ansicht schon verlassen wurde.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (autoFocus) formRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    return () => {
      mounted.current = false;
    };
  }, [autoFocus]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    let created: MieterRead;
    try {
      created = await api.post<MieterRead>('/mieters', toBody(state));
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof ApiError) setError(err.problem.detail ?? err.problem.title);
      else setError('Anlegen fehlgeschlagen.');
      setBusy(false);
      return;
    }
    if (!mounted.current) return;
    setBusy(false);
    setState(emptyFormState());
    // Außerhalb des try: ein Fehler im Callback ist kein fehlgeschlagenes Anlegen.
    onCreated(created);
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => void handleSubmit(e)}
      className={cx('space-y-3', className)}
    >
      <FormFields state={state} onChange={setState} />
      {error ? <div className="text-caption text-danger">{error}</div> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="filled" disabled={busy} fullWidth>
          {busy ? 'Speichere…' : 'Anlegen'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="bordered" onClick={onCancel} disabled={busy}>
            Abbrechen
          </Button>
        ) : null}
      </div>
    </form>
  );
}
