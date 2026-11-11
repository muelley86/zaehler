import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import { formatRangeShort } from '@/lib/dateRange';
import { DateInput, Dropdown } from '@/components/ui';
import { cx } from '@/components/ui/cx';

/**
 * Globaler Datumsbereich — immer sichtbares Steuerelement in der Navigation.
 * Zeigt den aktiven Zeitraum, erlaubt Monats-Sprünge per `◀`/`▶` und ein
 * von/bis-Popover. `sidebar` = volle Breite (Desktop-Sidebar), `mobile` =
 * zentrierte Leiste mit größerer Schrift und 44-px-Tippflächen.
 */
export function GlobalDateRange({ variant }: { variant: 'sidebar' | 'mobile' }) {
  const { dateRange, setFrom, setTo, stepMonth, resetDateRange } = useFilterPrefs();
  const isMobile = variant === 'mobile';

  return (
    <div
      data-testid={`global-date-range-${variant}`}
      className={cx('flex items-center gap-0.5', isMobile && 'justify-center')}
    >
      <MonthArrow dir="prev" large={isMobile} onClick={() => stepMonth(-1)} />
      <div className={isMobile ? 'min-w-0' : 'min-w-0 flex-1'}>
        <Dropdown
          label={formatRangeShort(dateRange)}
          variant={isMobile ? 'pill' : 'field'}
          dense={!isMobile}
          large={isMobile}
          hideChevron
        >
          <div className="flex flex-col gap-2 p-3">
            <label className="flex flex-col gap-1 text-caption text-tertiary">
              von
              <DateInput value={dateRange.from} onChange={setFrom} aria-label="von" />
            </label>
            <label className="flex flex-col gap-1 text-caption text-tertiary">
              bis
              <DateInput value={dateRange.to} onChange={setTo} aria-label="bis" />
            </label>
            <button
              type="button"
              onClick={resetDateRange}
              className="mt-1 self-start text-caption font-semibold text-primary"
            >
              Datum zurücksetzen
            </button>
          </div>
        </Dropdown>
      </div>
      <MonthArrow dir="next" large={isMobile} onClick={() => stepMonth(1)} />
    </div>
  );
}

function MonthArrow({
  dir,
  large,
  onClick,
}: {
  dir: 'prev' | 'next';
  large: boolean;
  onClick: () => void;
}) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Einen Monat zurück' : 'Einen Monat vor'}
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full text-tertiary transition-colors hover:bg-fill hover:text-label',
        large ? 'h-11 w-11' : 'h-7 w-7',
      )}
    >
      <Icon size={large ? 20 : 16} />
    </button>
  );
}
