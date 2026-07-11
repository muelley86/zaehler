import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PendingAgeBanner } from './PendingAgeBanner';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-11T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PendingAgeBanner', () => {
  it('ohne offene Einträge nichts', () => {
    render(<PendingAgeBanner oldestPendingAt={null} />);
    expect(screen.queryByTestId('pending-age-banner')).not.toBeInTheDocument();
  });

  it('unter der Warnschwelle nichts', () => {
    render(<PendingAgeBanner oldestPendingAt="2026-07-10T12:00:00Z" />);
    expect(screen.queryByTestId('pending-age-banner')).not.toBeInTheDocument();
  });

  it('warnt ab 3 Tagen mit Tagesangabe', () => {
    render(<PendingAgeBanner oldestPendingAt="2026-07-07T12:00:00Z" />);
    expect(screen.getByTestId('pending-age-banner')).toHaveTextContent(/4 Tagen/);
    expect(screen.getByTestId('pending-age-banner')).not.toHaveTextContent(/löschen/i);
  });

  it('ab 5 Tagen zusätzlich mit Löschwarnung', () => {
    render(<PendingAgeBanner oldestPendingAt="2026-07-05T12:00:00Z" />);
    expect(screen.getByTestId('pending-age-banner')).toHaveTextContent(/6 Tagen/);
    expect(screen.getByTestId('pending-age-banner')).toHaveTextContent(/löschen/i);
  });
});
