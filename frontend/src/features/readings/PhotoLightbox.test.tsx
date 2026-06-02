/**
 * Tests fuer PhotoLightbox — GPS-Bar mit OSM/Google/Apple-Maps-Links.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import { renderWithRouter } from '@/tests/render';

import { PhotoLightbox } from './PhotoLightbox';

describe('PhotoLightbox GPS-Bar', () => {
  it('zeigt Koordinaten und drei Karten-Links bei vorhandenen GPS-Daten', () => {
    renderWithRouter(
      <PhotoLightbox
        readingId={42}
        photos={[{ id: 1, photo_lat: 52.5, photo_lon: 13.4 }]}
        onClose={vi.fn()}
      />,
    );

    const gpsBar = screen.getByTestId('photo-lightbox-gps');
    expect(gpsBar).toBeInTheDocument();
    expect(gpsBar).toHaveTextContent('52.500000, 13.400000');

    const osm = screen.getByTestId('photo-lightbox-map-osm');
    const google = screen.getByTestId('photo-lightbox-map-google');
    const apple = screen.getByTestId('photo-lightbox-map-apple');

    const osmHref = osm.getAttribute('href') ?? '';
    expect(osmHref).toContain('openstreetmap.org');
    expect(osmHref).toContain('mlat=52.5');
    expect(osmHref).toContain('mlon=13.4');
    expect(google.getAttribute('href')).toBe('https://www.google.com/maps?q=52.5,13.4');
    const appleHref = apple.getAttribute('href') ?? '';
    expect(appleHref).toContain('maps.apple.com');
    expect(appleHref).toContain('ll=52.5%2C13.4');

    // Externe Links: muessen target="_blank" + noopener haben
    expect(osm.getAttribute('target')).toBe('_blank');
    expect(osm.getAttribute('rel') ?? '').toContain('noopener');
  });

  it('blendet die GPS-Bar aus, wenn keine Koordinaten vorhanden sind', () => {
    renderWithRouter(
      <PhotoLightbox
        readingId={42}
        photos={[{ id: 1, photo_lat: null, photo_lon: null }]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('photo-lightbox-gps')).not.toBeInTheDocument();
  });

  it('blendet die GPS-Bar aus, wenn nur einer der Werte vorhanden ist', () => {
    renderWithRouter(
      <PhotoLightbox
        readingId={42}
        photos={[{ id: 1, photo_lat: 52.5, photo_lon: null }]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('photo-lightbox-gps')).not.toBeInTheDocument();
  });

  it('blättert mit Pfeil-Button durch mehrere Fotos', () => {
    renderWithRouter(
      <PhotoLightbox
        readingId={42}
        photos={[
          { id: 1, photo_lat: null, photo_lon: null },
          { id: 2, photo_lat: null, photo_lon: null },
        ]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Nächstes Foto'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});
