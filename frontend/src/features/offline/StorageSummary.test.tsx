import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StorageSummary } from './StorageSummary';

const MB = 1024 * 1024;

function stubStorage(usage: number, quota: number, persisted: boolean): void {
  Object.defineProperty(window.navigator, 'storage', {
    configurable: true,
    value: {
      estimate: () => Promise.resolve({ usage, quota }),
      persisted: () => Promise.resolve(persisted),
    },
  });
}

afterEach(() => {
  delete (window.navigator as unknown as Record<string, unknown>)['storage'];
});

describe('StorageSummary', () => {
  it('zeigt belegten und verfügbaren Speicher in MB', async () => {
    stubStorage(12 * MB, 960 * MB, true);
    render(<StorageSummary />);
    const summary = await screen.findByTestId('storage-summary');
    expect(summary).toHaveTextContent('12 MB von 960 MB');
    expect(summary).toHaveTextContent(/dauerhaft/i);
    expect(screen.queryByTestId('storage-warning')).not.toBeInTheDocument();
  });

  it('warnt ab 80 % Belegung', async () => {
    stubStorage(850 * MB, 1000 * MB, true);
    render(<StorageSummary />);
    expect(await screen.findByTestId('storage-warning')).toHaveTextContent(/Speicher/);
  });

  it('meldet nicht gewährte Persistenz', async () => {
    stubStorage(1 * MB, 100 * MB, false);
    render(<StorageSummary />);
    expect(await screen.findByTestId('storage-summary')).toHaveTextContent(/nicht dauerhaft/i);
  });

  it('ohne Storage-API wird nichts gerendert', () => {
    render(<StorageSummary />);
    expect(screen.queryByTestId('storage-summary')).not.toBeInTheDocument();
  });
});
