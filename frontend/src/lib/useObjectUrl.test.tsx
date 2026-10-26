import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useObjectUrl } from './useObjectUrl';

describe('useObjectUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('legt die URL an und gibt sie beim Unmount wieder frei', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:eins');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });

    const { result, unmount } = renderHook(() => useObjectUrl(file));
    expect(result.current).toBe('blob:eins');
    expect(create).toHaveBeenCalledOnce();

    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:eins');
  });

  it('teilt sich die URL zwischen zwei Nutzern derselben Datei', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:geteilt');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });

    const a = renderHook(() => useObjectUrl(file));
    const b = renderHook(() => useObjectUrl(file));
    expect(create).toHaveBeenCalledOnce();

    a.unmount();
    expect(revoke).not.toHaveBeenCalled();
    expect(b.result.current).toBe('blob:geteilt');
    b.unmount();
    expect(revoke).toHaveBeenCalledOnce();
  });

  it('wechselt bei neuer Datei auf eine neue URL und gibt die alte frei', () => {
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:alt')
      .mockReturnValueOnce('blob:neu');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const first = new File(['1'], 'a.jpg', { type: 'image/jpeg' });
    const second = new File(['2'], 'b.jpg', { type: 'image/jpeg' });

    const { result, rerender } = renderHook(({ file }) => useObjectUrl(file), {
      initialProps: { file: first },
    });
    expect(result.current).toBe('blob:alt');

    rerender({ file: second });
    expect(result.current).toBe('blob:neu');
    expect(revoke).toHaveBeenCalledWith('blob:alt');
  });
});
