/**
 * Rechnungs-Upload: ein sichtbarer Button öffnet die Dateiauswahl — das rohe Dateifeld des
 * Browsers war als Upload nicht zu erkennen.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { InvoiceUpload } from './InvoiceUpload';

describe('InvoiceUpload', () => {
  it('öffnet die Dateiauswahl über einen sichtbaren Button', () => {
    render(<InvoiceUpload circleId={1} onImported={() => undefined} />);
    const input = screen.getByLabelText('Monatsrechnung (PDF) importieren');
    const click = vi.spyOn(input, 'click');

    fireEvent.click(screen.getByRole('button', { name: 'PDF hochladen' }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(input).toHaveClass('hidden');
  });
});
