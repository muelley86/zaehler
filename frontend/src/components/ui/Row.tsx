import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cx } from './cx';

interface BaseProps {
  icon?: ReactNode;
  label: ReactNode;
  sublabel?: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  destructive?: boolean;
}

interface AsLinkProps extends BaseProps {
  to: string;
  onClick?: never;
  href?: never;
}
interface AsButtonProps extends BaseProps {
  onClick: () => void;
  to?: never;
  href?: never;
}
interface AsExternalProps extends BaseProps {
  href: string;
  to?: never;
  onClick?: never;
}
interface AsStaticProps extends BaseProps {
  to?: undefined;
  onClick?: undefined;
  href?: undefined;
}

type RowProps = AsLinkProps | AsButtonProps | AsExternalProps | AsStaticProps;

export function Row(props: RowProps) {
  const { icon, label, sublabel, value, trailing, className, destructive } = props;
  const isInteractive = 'to' in props || 'onClick' in props || 'href' in props;
  const showChevron = isInteractive && trailing === undefined;

  const inner = (
    <div
      className={cx(
        'flex min-h-[44px] items-center gap-3 px-4 py-2.5',
        destructive && 'text-ios-red',
        className,
      )}
    >
      {icon ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center text-ios-blue">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-ios-body">{label}</div>
        {sublabel ? (
          <div className="truncate text-ios-footnote text-ios-tertiary">{sublabel}</div>
        ) : null}
      </div>
      {value !== undefined && value !== null ? (
        <div className="shrink-0 text-ios-body text-ios-tertiary">{value}</div>
      ) : null}
      {trailing}
      {showChevron ? <ChevronRight size={18} className="shrink-0 text-ios-tertiary" /> : null}
    </div>
  );

  const wrapClass = cx(
    'block w-full text-left',
    isInteractive && 'cursor-pointer hover:bg-ios-elevated/40 active:bg-ios-elevated/70',
  );

  if ('to' in props && props.to) {
    return (
      <Link to={props.to} className={wrapClass}>
        {inner}
      </Link>
    );
  }
  if ('href' in props && props.href) {
    return (
      <a href={props.href} className={wrapClass}>
        {inner}
      </a>
    );
  }
  if ('onClick' in props && props.onClick) {
    return (
      <button type="button" onClick={props.onClick} className={wrapClass}>
        {inner}
      </button>
    );
  }
  return <div className={wrapClass}>{inner}</div>;
}

export function RowSeparator() {
  return <div className="ml-12 h-px bg-ios-separator/60" />;
}

export function RowGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-ios-separator/60">{children}</div>;
}
