import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderWithRouter } from '@/tests/render';
import { currentAndLastMonthRange, formatRangeShort } from '@/lib/dateRange';
import { GlobalDateRange } from './GlobalDateRange';

beforeEach(() => {
  window.sessionStorage.setItem(
    'app.dateRange',
    JSON.stringify({ from: '2026-01-01', to: '2026-12-31' }),
  );
});
afterEach(() => {
  window.sessionStorage.clear();
});

describe('GlobalDateRange', () => {
  it('zeigt den vollen Bereich kompakt (YY) und springt mit den Pfeilen um ganze Monate', () => {
    window.sessionStorage.setItem(
      'app.dateRange',
      JSON.stringify({ from: '2026-06-01', to: '2026-07-31' }),
    );
    renderWithRouter(<GlobalDateRange variant="sidebar" />);
    expect(screen.getByText('01.06.–31.07.26')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Einen Monat zurück' }));
    expect(screen.getByText('01.05.–30.06.26')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Einen Monat vor' }));
    expect(screen.getByText('01.06.–31.07.26')).toBeInTheDocument();
  });

  it('ändert den Bereich über das von/bis-Popover', () => {
    renderWithRouter(<GlobalDateRange variant="sidebar" />);
    // Trigger trägt das Bereichs-Label → Popover öffnen.
    fireEvent.click(screen.getByRole('button', { name: /31\.12\.26/ }));
    fireEvent.change(screen.getByLabelText('von'), { target: { value: '2026-03-01' } });
    expect(screen.getByText('01.03.–31.12.26')).toBeInTheDocument();
  });

  it('„Datum zurücksetzen" im Popover setzt auf letzten + laufenden Monat', () => {
    window.sessionStorage.setItem(
      'app.dateRange',
      JSON.stringify({ from: '2020-01-01', to: '2020-12-31' }),
    );
    renderWithRouter(<GlobalDateRange variant="sidebar" />);
    expect(screen.getByText('01.01.–31.12.20')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /31\.12\.20/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Datum zurücksetzen' }));

    expect(
      screen.getByText(formatRangeShort(currentAndLastMonthRange(new Date()))),
    ).toBeInTheDocument();
  });
});
