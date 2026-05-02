import type { ReactNode } from 'react';

import { cx } from './cx';

export function LargeTitle({
  title,
  trailing,
  subtitle,
  className,
}: {
  title: ReactNode;
  trailing?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('px-1 pb-3 pt-1 md:pt-2', className)}>
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-title-2 text-label md:text-display">{title}</h1>
        {trailing ? <div className="pb-1.5">{trailing}</div> : null}
      </div>
      {subtitle ? <div className="mt-1.5 text-body text-secondary">{subtitle}</div> : null}
    </div>
  );
}
