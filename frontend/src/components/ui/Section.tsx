import type { ReactNode } from 'react';

import { cx } from './cx';

export function Section({
  header,
  footer,
  children,
  className,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('space-y-2', className)}>
      {header ? (
        <div className="px-1 text-caption-bold uppercase text-tertiary">{header}</div>
      ) : null}
      <div className="overflow-hidden rounded-card border-hairline border-border bg-surface glass shadow-glass dark:shadow-glass-dark">
        {children}
      </div>
      {footer ? <div className="px-1 text-caption text-tertiary">{footer}</div> : null}
    </section>
  );
}
