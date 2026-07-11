import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { shouldShowIosInstallHint } from '@/lib/pwaInstall';
import { IosInstallHintCard } from './IosInstallHintCard';

vi.mock('@/lib/pwaInstall', () => ({ shouldShowIosInstallHint: vi.fn() }));

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(shouldShowIosInstallHint).mockReturnValue(true);
});

describe('IosInstallHintCard', () => {
  it('zeigt den Hinweis auf iOS ohne Installation', () => {
    render(<IosInstallHintCard />);
    expect(screen.getByTestId('ios-install-hint')).toHaveTextContent(/Zum Home-Bildschirm/);
    expect(screen.getByTestId('ios-install-hint')).toHaveTextContent(/7 Tagen/);
  });

  it('zeigt nichts außerhalb von iOS bzw. wenn bereits installiert', () => {
    vi.mocked(shouldShowIosInstallHint).mockReturnValue(false);
    render(<IosInstallHintCard />);
    expect(screen.queryByTestId('ios-install-hint')).not.toBeInTheDocument();
  });

  it('dismissible: Ausblenden versteckt die Karte dauerhaft (localStorage)', () => {
    const { unmount } = render(<IosInstallHintCard dismissible />);
    fireEvent.click(screen.getByRole('button', { name: 'Ausblenden' }));
    expect(screen.queryByTestId('ios-install-hint')).not.toBeInTheDocument();

    unmount();
    render(<IosInstallHintCard dismissible />);
    expect(screen.queryByTestId('ios-install-hint')).not.toBeInTheDocument();
  });

  it('ohne dismissible gibt es keinen Ausblenden-Button', () => {
    render(<IosInstallHintCard />);
    expect(screen.queryByRole('button', { name: 'Ausblenden' })).not.toBeInTheDocument();
  });
});
