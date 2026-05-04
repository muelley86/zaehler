import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

import { cx } from './cx';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  label?: ReactNode;
  hint?: ReactNode;
  className?: string;
}

export function Select({ label, hint, className, children, ...rest }: SelectProps) {
  return (
    <label className={cx('block', className)}>
      {label ? (
        <span className="mb-1.5 block text-caption-bold uppercase text-tertiary">{label}</span>
      ) : null}
      <span
        className={cx(
          'flex items-center gap-2 rounded-pill border-hairline border-border bg-fill px-3.5',
          'focus-within:border-primary focus-within:bg-surface-solid',
        )}
      >
        <select
          className="h-11 w-full appearance-none bg-transparent pr-7 text-body text-label outline-none"
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          aria-hidden
          className="pointer-events-none -ml-5 shrink-0 text-tertiary"
        />
      </span>
      {hint ? <span className="mt-1 block text-caption text-tertiary">{hint}</span> : null}
    </label>
  );
}
