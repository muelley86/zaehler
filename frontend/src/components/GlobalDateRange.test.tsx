import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderWithRouter } from '@/tests/render';
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
  it('zeigt den aktiven Bereich und springt mit den Pfeilen um ganze Jahre', () => {
    renderWithRouter(<GlobalDateRange variant="sidebar" />);
    expect(screen.getByText('01.01.2026 – 31.12.2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ein Jahr zurück' }));
    expect(screen.getByText('01.01.2025 – 31.12.2025')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ein Jahr vor' }));
    expect(screen.getByText('01.01.2026 – 31.12.2026')).toBeInTheDocument();
  });

  it('ändert den Bereich über das von/bis-Popover', () => {
    renderWithRouter(<GlobalDateRange variant="sidebar" />);
    // Trigger trägt das Bereichs-Label → Popover öffnen.
    fireEvent.click(screen.getByRole('button', { name: /01\.01\.2026/ }));
    fireEvent.change(screen.getByLabelText('von'), { target: { value: '2026-03-01' } });
    expect(screen.getByText('01.03.2026 – 31.12.2026')).toBeInTheDocument();
  });
});
