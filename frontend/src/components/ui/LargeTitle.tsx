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
    <div className={cx('px-4 pb-2 pt-1 md:pt-2', className)}>
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-rounded text-ios-largetitle">{title}</h1>
        {trailing ? <div className="pb-2">{trailing}</div> : null}
      </div>
      {subtitle ? <div className="mt-1 text-ios-subhead text-ios-secondary">{subtitle}</div> : null}
    </div>
  );
}
