/**
 * Integrationstests fuer „Filter merken" auf der Auswertungen-Seite. Der
 * Zeitraum folgt per Default dem geteilten Datumsbereich (shared_range);
 * die Seite hat per-Seite-Session-Memory fuer ihre Arbeits-Filter
 * (Dimension, Granularitaet, Periode, kategoriale Filter).
 *
 * Der Report wird per „Auswerten" ausgefuehrt → die wiederhergestellte
 * Dimension fliesst in die /reports/aggregate-Query (End-to-End-Beleg).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';

import { ReportsPage } from './ReportsPage';
import { mockEndpoints, runReport } from './reportsTestUtils';

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ me: { id: 1, username: 'admin', role: 'admin', is_active: true } }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('ReportsPage — Filter merken', () => {
  it('stellt die gemerkte Dimension wieder her (fließt in die /reports/aggregate-Query)', async () => {
    window.localStorage.setItem('filters.remember', '1');
    window.sessionStorage.setItem('filters.reports.dimension', 'owner');
    const { dimensionCalls } = mockEndpoints();

    renderWithRouter(<ReportsPage />);
    await runReport();

    await waitFor(() => expect(dimensionCalls).toContain('owner'));
    expect(dimensionCalls).not.toContain('measuring_point');
  });

  it('merkt eine geänderte Dimension je Seite in sessionStorage', async () => {
    window.localStorage.setItem('filters.remember', '1');
    mockEndpoints();

    renderWithRouter(<ReportsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Kostenstelle' }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem('filters.reports.dimension')).toBe('kostenstelle'),
    );
  });

  it('merkt den Messstellen-Filter und „Filter zurücksetzen" leert ihn auch im Speicher', async () => {
    window.localStorage.setItem('filters.remember', '1');
    window.sessionStorage.setItem('filters.reports.measuringPoint', JSON.stringify([1]));
    const { urls } = mockEndpoints();

    renderWithRouter(<ReportsPage />);
    expect(await screen.findByText('1 aktiv')).toBeInTheDocument();
    await runReport();
    await waitFor(() => expect(urls.some((u) => u.includes('measuring_point_id=1'))).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    await waitFor(() =>
      expect(window.sessionStorage.getItem('filters.reports.measuringPoint')).toBe('[]'),
    );
    expect(screen.queryByText('1 aktiv')).toBeNull();
  });

  it('persistiert nichts, wenn „Filter merken" deaktiviert ist (Default)', async () => {
    mockEndpoints();

    renderWithRouter(<ReportsPage />);
    const pill = await screen.findByRole('button', { name: 'Kostenstelle' });
    fireEvent.click(pill);

    await waitFor(() => expect(pill).toHaveAttribute('aria-pressed', 'true'));
    expect(window.sessionStorage.getItem('filters.reports.dimension')).toBeNull();
  });
});
