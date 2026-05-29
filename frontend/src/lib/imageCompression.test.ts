import { describe, expect, it, vi } from 'vitest';

import { compressImage } from './imageCompression';

function makeFile(size: number, type = 'image/jpeg'): File {
  const buf = new Uint8Array(size);
  return new File([buf], 'photo.jpg', { type });
}

describe('compressImage', () => {
  it('gibt non-image-Dateien unveraendert zurueck', async () => {
    const f = makeFile(1024 * 1024, 'application/pdf');
    expect(await compressImage(f)).toBe(f);
  });

  it('gibt kleine Bilder unveraendert zurueck (unter minBytesToCompress)', async () => {
    const f = makeFile(100 * 1024); // 100 KB
    expect(await compressImage(f)).toBe(f);
  });

  it('faellt auf das Original zurueck, wenn createImageBitmap wirft', async () => {
    const f = makeFile(2 * 1024 * 1024);
    const orig = globalThis.createImageBitmap;
    globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error('HEIC unsupported'));
    try {
      expect(await compressImage(f)).toBe(f);
    } finally {
      globalThis.createImageBitmap = orig;
    }
  });

  it('skaliert grosse Bilder auf die Langseite herunter', async () => {
    const f = makeFile(2 * 1024 * 1024);
    const bitmap = {
      width: 4000,
      height: 3000,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    const origCIB = globalThis.createImageBitmap;
    globalThis.createImageBitmap = vi.fn().mockResolvedValue(bitmap);
    const origOSC = globalThis.OffscreenCanvas;
    const drawImage = vi.fn();
    const convertToBlob = vi.fn().mockResolvedValue(new Blob([new Uint8Array(200_000)]));
    class FakeOSC {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return { drawImage };
      }
      convertToBlob = convertToBlob;
    }
    (globalThis as unknown as { OffscreenCanvas: typeof FakeOSC }).OffscreenCanvas = FakeOSC;
    try {
      const out = await compressImage(f, { maxLongSide: 1600, quality: 0.8 });
      expect(out).not.toBe(f);
      expect(out.type).toBe('image/jpeg');
      expect(out.size).toBeLessThan(f.size);
      expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 1200);
      expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.8 });
    } finally {
      globalThis.createImageBitmap = origCIB;
      (globalThis as unknown as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas =
        origOSC;
    }
  });

  it('bleibt beim Original, wenn die komprimierte Datei nicht kleiner ist', async () => {
    const f = makeFile(2 * 1024 * 1024);
    const bitmap = {
      width: 4000,
      height: 3000,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    const origCIB = globalThis.createImageBitmap;
    globalThis.createImageBitmap = vi.fn().mockResolvedValue(bitmap);
    const origOSC = globalThis.OffscreenCanvas;
    class FakeOSC {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return { drawImage: vi.fn() };
      }
      convertToBlob = vi.fn().mockResolvedValue(new Blob([new Uint8Array(3 * 1024 * 1024)]));
    }
    (globalThis as unknown as { OffscreenCanvas: typeof FakeOSC }).OffscreenCanvas = FakeOSC;
    try {
      const out = await compressImage(f);
      expect(out).toBe(f);
    } finally {
      globalThis.createImageBitmap = origCIB;
      (globalThis as unknown as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas =
        origOSC;
    }
  });
});
