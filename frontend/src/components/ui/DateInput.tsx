import type { InputHTMLAttributes } from 'react';

/**
 * Schlanker `<input type="date">`-Wrapper mit App-Styling. Zuvor inline in
 * Dashboard/Erfassungen dupliziert, jetzt geteilt (u.a. vom globalen
 * Datumsbereich-Widget genutzt).
 */
export function DateInput({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (s: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
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
