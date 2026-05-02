import type { InputHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

import { cx } from './cx';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  inputClassName?: string;
  /** Numerische Felder (Stand, Verbrauch, Tankvolumen) — nutzt Mono + tabular-nums. */
  numeric?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, trailing, className, inputClassName, numeric = false, ...rest },
  ref,
) {
  return (
    <label className={cx('block', className)}>
      {label ? (
        <span className="mb-1.5 block text-caption-bold uppercase text-tertiary">{label}</span>
      ) : null}
      <span
        className={cx(
          'flex items-center gap-2 rounded-pill border-hairline px-3.5 transition-colors',
          error
            ? 'border-danger bg-fill ring-1 ring-danger/40'
            : 'border-border bg-fill focus-within:border-primary focus-within:bg-surface-solid',
        )}
      >
        <input
          ref={ref}
          className={cx(
            'h-11 w-full bg-transparent text-body text-label outline-none placeholder:text-quaternary',
            numeric && 'num',
            inputClassName,
          )}
          {...rest}
        />
        {trailing}
      </span>
      {error ? (
        <span className="mt-1 block text-caption text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-caption text-tertiary">{hint}</span>
      ) : null}
    </label>
  );
});
