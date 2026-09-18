import { TextField } from '@/components/ui';

import type { CircleFormState } from './circleForm';

export function CircleFields({
  state,
  onChange,
}: {
  state: CircleFormState;
  onChange: (s: CircleFormState) => void;
}) {
  const set = (key: keyof CircleFormState, value: string) => onChange({ ...state, [key]: value });
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <TextField
          label="Kürzel"
          value={state.code}
          onChange={(e) => set('code', e.target.value)}
          maxLength={16}
          required
        />
        <div className="col-span-2">
          <TextField
            label="Name"
            value={state.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
        </div>
      </div>
      <TextField
        label="Rechnungsleger"
        value={state.rechnungsleger}
        onChange={(e) => set('rechnungsleger', e.target.value)}
        required
      />
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Abnahmestelle"
          value={state.abnahmestelle}
          onChange={(e) => set('abnahmestelle', e.target.value)}
          hint="z. B. AID-000001"
          required
        />
        <TextField
          label="Marktlokation (optional)"
          value={state.marktlokation}
          onChange={(e) => set('marktlokation', e.target.value.replace(/\D/g, '').slice(0, 11))}
          inputMode="numeric"
          hint="11 Ziffern"
        />
      </div>
      <TextField label="Notiz" value={state.note} onChange={(e) => set('note', e.target.value)} />
    </>
  );
}
