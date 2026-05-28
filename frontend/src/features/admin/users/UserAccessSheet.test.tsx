/**
 * Tests für UserAccessSheet — der Editor für Per-Recorder MP-Zugriff.
 *
 * Wir prüfen die drei zentralen Verhaltensweisen:
 *  - initial werden bestehende Grants als Checkboxen markiert
 *  - Filter (Typ-Pill) reduziert die Liste
 *  - Bulk-Toggle "Alle auswählen" wirkt nur auf gefilterte Sicht
 *  - Speichern schickt PUT mit der vollständigen ID-Liste
 */

import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithRouter } from '@/tests/render';
import { server } from '@/tests/server';
import type { MeasuringPointRead, UserRead } from '@/lib/types';

import { UserAccessSheet } from './UserAccessSheet';

const _RECORDER: UserRead = {
  id: 5,
  username: 'recorder1',
  email: null,
  role: 'recorder',
  is_active: true,
  force_password_change: false,
  totp_enabled: false,
  can_assign_qr_tokens: false,
  last_login_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

const _baseRegister = {
  is_active: true,
  max_value: '0',
  accepts_deliveries: false,
};

function _mp(overrides: Partial<MeasuringPointRead> & { id: number; name: string }) {
  return {
    type: 'electricity' as const,
    location_id: null,
    location_name: null,
    main_location_id: null,
    main_location_name: null,
    contract_number: null,
    market_location: null,
    installation_location: null,
    current_owner_id: null,
    current_owner_name: null,
    is_bidirectional: false,
    has_dual_tariff: false,
    tank_capacity: null,
    transformer_factor: null,
    heating_source: null,
    physical_meters: [
      {
        id: overrides.id * 10,
        serial_number: `SN-${overrides.id}`,
        installed_at: '2024-01-01',
        removed_at: null,
        registers: [
          {
            id: overrides.id * 100,
            obis_code: '1.8.0',
            label: 'Bezug',
            unit: 'kWh',
            ..._baseRegister,
          },
        ],
      },
    ],
    ...overrides,
  } satisfies MeasuringPointRead;
}

function _mockEndpoints({
  mps,
  initialAccessIds,
}: {
  mps: MeasuringPointRead[];
  initialAccessIds: number[];
}) {
  server.use(
    http.get('/api/v1/measuring-points', () => HttpResponse.json(mps)),
    http.get('/api/v1/users/:userId/measuring-points', ({ params }) =>
      HttpResponse.json({
        user_id: Number(params['userId']),
        measuring_point_ids: initialAccessIds,
      }),
    ),
  );
}

describe('UserAccessSheet', () => {
  it('markiert bestehende Grants als gecheckt', async () => {
    _mockEndpoints({
      mps: [_mp({ id: 1, name: 'Strom' }), _mp({ id: 2, name: 'Wasser', type: 'water' })],
      initialAccessIds: [2],
    });
    renderWithRouter(<UserAccessSheet user={_RECORDER} onClose={() => {}} />);

    const wasserBox = await screen.findByLabelText<HTMLInputElement>('Zugriff auf Wasser');
    const stromBox = screen.getByLabelText<HTMLInputElement>('Zugriff auf Strom');
    expect(wasserBox.checked).toBe(true);
    expect(stromBox.checked).toBe(false);
  });

  it('filtert die Liste per Typ-Pill', async () => {
    _mockEndpoints({
      mps: [
        _mp({ id: 1, name: 'Strom-Haupt' }),
        _mp({ id: 2, name: 'Wasser-Garten', type: 'water' }),
      ],
      initialAccessIds: [],
    });
    const user = userEvent.setup();
    renderWithRouter(<UserAccessSheet user={_RECORDER} onClose={() => {}} />);

    await screen.findByLabelText('Zugriff auf Strom-Haupt');
    await user.click(screen.getByRole('button', { name: /^Wasser/ }));

    expect(screen.queryByLabelText('Zugriff auf Strom-Haupt')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Zugriff auf Wasser-Garten')).toBeInTheDocument();
  });

  it('"Alle auswählen" wirkt nur auf gefilterte Sicht', async () => {
    _mockEndpoints({
      mps: [
        _mp({ id: 1, name: 'Strom-A' }),
        _mp({ id: 2, name: 'Strom-B' }),
        _mp({ id: 3, name: 'Wasser-1', type: 'water' }),
      ],
      initialAccessIds: [],
    });
    const user = userEvent.setup();
    renderWithRouter(<UserAccessSheet user={_RECORDER} onClose={() => {}} />);

    await screen.findByLabelText('Zugriff auf Strom-A');
    // Filter auf Strom
    await user.click(screen.getByRole('button', { name: /^Strom · / }));
    // Alle auswählen (gefilterte Sicht)
    await user.click(screen.getByRole('button', { name: 'Alle auswählen' }));

    expect(screen.getByLabelText<HTMLInputElement>('Zugriff auf Strom-A').checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Zugriff auf Strom-B').checked).toBe(true);

    // Wasser-1 darf NICHT mit-aktiviert worden sein → Filter zurücksetzen
    await user.click(screen.getByRole('button', { name: /^Alle · / }));
    expect(screen.getByLabelText<HTMLInputElement>('Zugriff auf Wasser-1').checked).toBe(false);
  });

  it('Speichern schickt PUT mit vollständigem ID-Set', async () => {
    let putBody: { measuring_point_ids: number[] } | null = null;
    _mockEndpoints({
      mps: [_mp({ id: 1, name: 'Strom' }), _mp({ id: 2, name: 'Wasser', type: 'water' })],
      initialAccessIds: [1],
    });
    server.use(
      http.put('/api/v1/users/:userId/measuring-points', async ({ request }) => {
        putBody = (await request.json()) as { measuring_point_ids: number[] };
        return HttpResponse.json({
          user_id: 5,
          measuring_point_ids: putBody.measuring_point_ids,
        });
      }),
    );

    const onSaved = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithRouter(<UserAccessSheet user={_RECORDER} onClose={onClose} onSaved={onSaved} />);

    await screen.findByLabelText('Zugriff auf Strom');
    // Wasser zusätzlich aktivieren
    await user.click(screen.getByLabelText('Zugriff auf Wasser'));
    // Speichern
    await user.click(screen.getByRole('button', { name: /Speichern/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(putBody).not.toBeNull();
    expect(new Set(putBody!.measuring_point_ids)).toEqual(new Set([1, 2]));
  });
});
