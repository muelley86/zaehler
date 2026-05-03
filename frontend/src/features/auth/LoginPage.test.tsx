import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { LoginPage } from './LoginPage';

vi.mock('./auth-context', () => ({
  useAuth: () => ({
    me: null,
    loading: false,
    login: vi.fn(),
    verifyTotp: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  it('renders username and password inputs', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/Benutzername/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Passwort/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anmelden/i })).toBeInTheDocument();
  });
});
