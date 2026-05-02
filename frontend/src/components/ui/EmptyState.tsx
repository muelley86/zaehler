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
    <div className="flex flex-col items-center justify-center gap-3 rounded-ios-lg bg-ios-surface p-10 text-center shadow-ios-card">
      {icon ? <div className="text-ios-tertiary">{icon}</div> : null}
      <div className="text-ios-headline">{title}</div>
      {description ? (
        <div className="max-w-sm text-ios-subhead text-ios-secondary">{description}</div>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
