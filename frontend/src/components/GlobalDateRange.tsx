import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useFilterPrefs } from '@/features/prefs/filter-prefs-context';
import { formatRangeShort } from '@/lib/dateRange';
import { DateInput, Dropdown } from '@/components/ui';
import { cx } from '@/components/ui/cx';

/**
 * Globaler Datumsbereich — immer sichtbares Steuerelement in der Navigation.
 * Zeigt den aktiven Zeitraum, erlaubt Monats-Sprünge per `◀`/`▶` und ein
 * von/bis-Popover. `sidebar` = volle Breite (Desktop-Sidebar), `mobile` =
 * kompakte, zentrierte Leiste.
 */
export function GlobalDateRange({ variant }: { variant: 'sidebar' | 'mobile' }) {
  const { dateRange, setFrom, setTo, stepMonth, resetDateRange } = useFilterPrefs();

  return (
    <div
      data-testid={`global-date-range-${variant}`}
      className={cx('flex items-center gap-0.5', variant === 'mobile' && 'justify-center')}
    >
      <MonthArrow dir="prev" onClick={() => stepMonth(-1)} />
      <div className={variant === 'sidebar' ? 'min-w-0 flex-1' : 'min-w-0'}>
        <Dropdown
          label={formatRangeShort(dateRange)}
          variant={variant === 'sidebar' ? 'field' : 'pill'}
          dense
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
      <MonthArrow dir="next" onClick={() => stepMonth(1)} />
    </div>
  );
}

function MonthArrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Einen Monat zurück' : 'Einen Monat vor'}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-tertiary transition-colors hover:bg-fill hover:text-label"
    >
      <Icon size={16} />
    </button>
  );
}
