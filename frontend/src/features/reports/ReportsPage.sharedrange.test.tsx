/**
 * „Aktueller Zeitraum" (shared_range) in den Auswertungen: per DEFAULT folgt der
 * Report dem globalen Datumsbereich (sessionStorage `app.dateRange`) und sendet
 * dessen from_at/to_at an /reports/aggregate — konsistent mit dem Dashboard.
 * Andere Zeiträume (z. B. „Laufendes Jahr") bleiben als bewusste Abwahl wählbar.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ me: { role: 'admin' } }),
}));

import { ReportsPage } from './ReportsPage';
import { mockEndpoints, runReport } from './reportsTestUtils';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('ReportsPage — Aktueller Zeitraum (shared_range)', () => {
  it('folgt per Default dem globalen Datumsbereich (ohne manuelle Auswahl)', async () => {
    window.sessionStorage.setItem(
      'app.dateRange',
      JSON.stringify({ from: '2023-01-01', to: '2023-12-31' }),
    );
    const { dateParams } = mockEndpoints();

    renderWithRouter(<ReportsPage />);
    await runReport();

    // Bereits der erste Lauf nutzt den globalen Bereich — importierte Historien
    // fallen nicht stumm aus einem abweichenden Seiten-Default.
    await waitFor(() => expect(dateParams.length).toBeGreaterThan(0));
    expect(dateParams[0]).toEqual({ from: '2023-01-01', to: '2023-12-31' });
  });

  it('„Laufendes Jahr" bleibt als bewusste Abwahl wählbar', async () => {
    const { dateParams } = mockEndpoints();

    renderWithRouter(<ReportsPage />);
    await runReport();
    await waitFor(() => expect(dateParams.length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText('Zeitraum'), { target: { value: 'current_year' } });
    await runReport();

    const y = new Date().getFullYear();
    await waitFor(() =>
      expect(dateParams.some((p) => p.from === `${y}-01-01` && p.to === `${y}-12-31`)).toBe(true),
    );
  });
});
