import type { ReactNode } from 'react';

import { cx } from './cx';

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cx('rounded-ios-lg bg-ios-surface shadow-ios-card', padded && 'p-4', className)}
    >
      {children}
    </div>
  );
}
