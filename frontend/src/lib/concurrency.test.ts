import { describe, expect, it, vi } from 'vitest';

import { mapWithConcurrency } from './concurrency';

describe('mapWithConcurrency', () => {
  it('liefert Results in Item-Reihenfolge zurueck', async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4], (n) => Promise.resolve(n * 10), 2);
    expect(result).toEqual([10, 20, 30, 40]);
  });

  it('begrenzt die parallel laufenden Worker auf maxConcurrency', async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency(
      Array.from({ length: 50 }, (_, i) => i),
      async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 3));
        active--;
      },
      5,
    );
    expect(maxActive).toBeGreaterThan(0);
    expect(maxActive).toBeLessThanOrEqual(5);
  });

  it('startet alles parallel, wenn items.length <= maxConcurrency', async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency(
      [1, 2, 3],
      async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 3));
        active--;
      },
      8,
    );
    expect(maxActive).toBe(3);
  });

  it('leitet Rejects der Worker-Funktion nach aussen weiter', async () => {
    const boom = new Error('boom');
    await expect(
      mapWithConcurrency(
        [1, 2, 3],
        (n) => {
          if (n === 2) return Promise.reject(boom);
          return Promise.resolve(n);
        },
        2,
      ),
    ).rejects.toBe(boom);
  });

  it('macht keine Worker fuer eine leere Eingabe', async () => {
    const spy = vi.fn((n: number) => Promise.resolve(n));
    const result = await mapWithConcurrency([], spy, 5);
    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
