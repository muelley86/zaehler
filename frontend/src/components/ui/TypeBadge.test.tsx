import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TypeBadge } from './TypeBadge';

describe('TypeBadge', () => {
  it('zeigt für Wasser den Tropfen (lucide Droplet) bei unveränderter Farbe', () => {
    const { container } = render(<TypeBadge type="water" />);
    const badge = screen.getByRole('img', { name: 'Wasser' });
    expect(badge).toHaveClass('bg-type-water');
    expect(container.querySelector('svg.lucide-droplet')).toBeInTheDocument();
  });

  it('zeigt für Heizung das Thermometer (lucide Thermometer) bei unveränderter Farbe', () => {
    const { container } = render(<TypeBadge type="heating" />);
    const badge = screen.getByRole('img', { name: 'Heizung' });
    expect(badge).toHaveClass('bg-type-heating');
    expect(container.querySelector('svg.lucide-thermometer')).toBeInTheDocument();
  });

  it('lässt Strom unverändert (Unicode-Glyph, kein Icon)', () => {
    const { container } = render(<TypeBadge type="electricity" />);
    const badge = screen.getByRole('img', { name: 'Strom' });
    expect(badge).toHaveClass('bg-type-electricity');
    expect(badge).toHaveTextContent('⚡');
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
});
