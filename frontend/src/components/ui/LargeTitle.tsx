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
    <div className={cx('px-1 pt-1 pb-3 md:pt-2', className)}>
      {/* flex-wrap: passen Titel und Aktionen nicht nebeneinander (Handy), rutschen die Aktionen
          unter den Titel statt rechts aus dem Bild. */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <h1 className="min-w-0 text-title-2 text-label md:text-display">{title}</h1>
        {trailing ? <div className="pb-1.5">{trailing}</div> : null}
      </div>
      {subtitle ? <div className="mt-1.5 text-body text-secondary">{subtitle}</div> : null}
    </div>
  );
}
