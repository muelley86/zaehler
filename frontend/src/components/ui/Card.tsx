import type { ReactNode } from 'react';

import { cx } from './cx';

/**
 * Liquid-Glass-Karte. `solid` deaktiviert backdrop-blur (für Bereiche, in
 * denen kein Hintergrund-Glow durchschimmert oder die Karte über einer
 * anderen Glas-Schicht liegt).
 */
export function Card({
  children,
  className,
  padded = true,
  solid = false,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  solid?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-card border-hairline border-border shadow-glass dark:shadow-glass-dark',
        solid ? 'bg-surface-solid' : 'glass bg-surface',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}
