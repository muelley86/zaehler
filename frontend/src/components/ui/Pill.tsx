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
        'rounded-full transition-colors',
        size === 'sm' ? 'px-2.5 py-1 text-ios-caption' : 'px-3 py-1.5 text-ios-footnote',
        active
          ? 'bg-ios-blue text-white'
          : 'bg-ios-fill/15 text-ios-label hover:bg-ios-fill/25',
      )}
    >
      {children}
    </button>
  );
}
