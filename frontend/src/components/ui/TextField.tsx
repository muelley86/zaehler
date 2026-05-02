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
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, trailing, className, inputClassName, ...rest },
  ref,
) {
  return (
    <label className={cx('block', className)}>
      {label ? (
        <span className="mb-1 block text-ios-footnote text-ios-secondary">{label}</span>
      ) : null}
      <span
        className={cx(
          'flex items-center gap-2 rounded-ios bg-ios-elevated px-3',
          error ? 'ring-1 ring-ios-red/60' : '',
        )}
      >
        <input
          ref={ref}
          className={cx(
            'h-11 w-full bg-transparent text-ios-body outline-none placeholder:text-ios-tertiary',
            inputClassName,
          )}
          {...rest}
        />
        {trailing}
      </span>
      {error ? (
        <span className="mt-1 block text-ios-footnote text-ios-red">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-ios-footnote text-ios-tertiary">{hint}</span>
      ) : null}
    </label>
  );
});
