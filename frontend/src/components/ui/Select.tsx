import type { ReactNode, SelectHTMLAttributes } from 'react';

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
        <span className="mb-1 block text-ios-footnote text-ios-secondary">{label}</span>
      ) : null}
      <span className="flex items-center rounded-ios bg-ios-elevated px-3">
        <select
          className="h-11 w-full bg-transparent text-ios-body outline-none appearance-none pr-7"
          {...rest}
        >
          {children}
        </select>
        <span className="pointer-events-none -ml-5 text-ios-tertiary">▾</span>
      </span>
      {hint ? (
        <span className="mt-1 block text-ios-footnote text-ios-tertiary">{hint}</span>
      ) : null}
    </label>
  );
}
