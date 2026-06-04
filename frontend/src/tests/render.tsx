/**
 * Test-Render-Helper: stellt React Router + Auth-Context bereit, damit
 * Komponenten-Tests nicht jedes Mal Provider-Boilerplate brauchen.
 *
 * ``renderWithRouter`` rendert eine Komponente in einem MemoryRouter; der
 * AuthProvider wird mit einem statischen Default-User gefüllt (Admin),
 * sodass alle Routes erreichbar sind. Wer Recorder-/Anonyme-Tests braucht,
 * passt ``mockUser`` per ``vi.mock('@/features/auth/auth-context', ...)``
 * im jeweiligen Test an.
 */

import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { FilterPrefsProvider } from '@/features/prefs/FilterPrefsProvider';

interface Options extends RenderOptions {
  initialEntries?: string[];
}

export function renderWithRouter(
  ui: ReactElement,
  { initialEntries = ['/'], ...rest }: Options = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>
        <FilterPrefsProvider>{children}</FilterPrefsProvider>
      </MemoryRouter>
    );
  }
  return render(ui, { wrapper: Wrapper, ...rest });
}
