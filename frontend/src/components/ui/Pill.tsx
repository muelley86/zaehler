import type { ReactNode } from 'react';

import { cx } from './cx';

export function Pill({
  active,
  onClick,
  children,
  size = 'md',
  disabled = false,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  size?: 'sm' | 'md';
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={cx(
        'rounded-full border-hairline font-medium tracking-tight whitespace-nowrap transition-[background,color,border-color]',
        size === 'sm' ? 'px-2.5 py-1 text-caption' : 'px-3 py-1.5 text-body-sm',
        disabled
          ? 'cursor-not-allowed border-border bg-fill text-tertiary opacity-40'
          : active
            ? 'border-transparent text-white shadow-glow-primary bg-gradient-primary'
            : 'border-border bg-fill text-secondary hover:bg-fill-strong',
      )}
    >
      {children}
    </button>
  );
}
