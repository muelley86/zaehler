import type { ReactNode } from 'react';

import { cx } from './cx';

export function Pill({
  active,
  onClick,
  children,
  size = 'md',
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'whitespace-nowrap rounded-full border-hairline font-medium tracking-tight transition-[background,color,border-color]',
        size === 'sm' ? 'px-2.5 py-1 text-caption' : 'px-3 py-1.5 text-body-sm',
        active
          ? 'bg-gradient-primary shadow-glow-primary border-transparent text-white'
          : 'border-border bg-fill text-secondary hover:bg-fill-strong',
      )}
    >
      {children}
    </button>
  );
}
