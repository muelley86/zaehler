import { useEffect } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLatestRef } from './useLatestRef';

describe('useLatestRef', () => {
  it('liefert über Re-Renders denselben Ref mit dem jeweils neuesten Wert', () => {
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: 1 },
    });
    const first = result.current;
    expect(first.current).toBe(1);

    rerender({ value: 2 });
    expect(result.current).toBe(first);
    expect(result.current.current).toBe(2);
  });

  it('ist in passiven Effekten desselben Commits bereits aktualisiert', () => {
    const seen: number[] = [];
    const { rerender } = renderHook(
      ({ value }) => {
        const ref = useLatestRef(value);
        useEffect(() => {
          seen.push(ref.current);
        });
      },
      { initialProps: { value: 1 } },
    );
    rerender({ value: 5 });
    expect(seen).toEqual([1, 5]);
  });
});
