import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border-hairline border-border bg-surface glass p-10 text-center shadow-glass dark:shadow-glass-dark">
      {icon ? <div className="text-tertiary">{icon}</div> : null}
      <div className="text-headline text-label">{title}</div>
      {description ? (
        <div className="max-w-sm text-body text-secondary">{description}</div>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
