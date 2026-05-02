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
    <section className={cx('space-y-1.5', className)}>
      {header ? (
        <div className="px-4 text-ios-footnote uppercase tracking-wide text-ios-tertiary">
          {header}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-ios-lg bg-ios-surface shadow-ios-card">
        {children}
      </div>
      {footer ? (
        <div className="px-4 text-ios-footnote text-ios-tertiary">{footer}</div>
      ) : null}
    </section>
  );
}
