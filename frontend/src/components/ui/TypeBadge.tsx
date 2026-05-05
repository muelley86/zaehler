import { cx } from './cx';

export type MeterType = 'electricity' | 'water' | 'heating';

const META: Record<MeterType, { label: string; symbol: string; gradient: string; glow: string }> = {
  electricity: {
    label: 'Strom',
    symbol: '⚡',
    gradient: 'bg-type-electricity',
    glow: 'shadow-glow-electricity',
  },
  water: {
    label: 'Wasser',
    symbol: '◈',
    gradient: 'bg-type-water',
    glow: 'shadow-glow-water',
  },
  heating: {
    label: 'Heizung',
    symbol: '◆',
    gradient: 'bg-type-heating',
    glow: 'shadow-glow-heating',
  },
};

export function TypeBadge({
  type,
  size = 'md',
  className,
}: {
  type: MeterType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const meta = META[type];
  return (
    <div
      role="img"
      aria-label={meta.label}
      className={cx(
        'flex shrink-0 items-center justify-center font-semibold leading-none text-white',
        size === 'sm' && 'h-7 w-7 rounded-[9px] text-[13px]',
        size === 'md' && 'h-9 w-9 rounded-[11.5px] text-base',
        size === 'lg' && 'h-12 w-12 rounded-[15.4px] text-[22px]',
        meta.gradient,
        meta.glow,
        className,
      )}
    >
      {meta.symbol}
    </div>
  );
}

export const TYPE_META = META;
