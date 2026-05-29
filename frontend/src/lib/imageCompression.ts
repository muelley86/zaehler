/**
 * Client-seitige Bildverkleinerung vor dem Foto-Upload.
 *
 * iPhone-Kameras liefern HEIC/JPEG mit 4–6 MB pro Aufnahme. Bei der
 * Reading-Erfassung im Keller (oft schwaches LTE) reicht 1600 px Langseite
 * bei 0.8 JPEG-Quality fuer Beweissicherung locker — typische Endgroesse
 * 300–700 KB statt 5 MB.
 *
 * Strategie:
 * - Wenn der Decode fehlschlaegt (z. B. HEIC ohne Browser-Support auf
 *   Desktop), bleibt das Original und der Server-side-Pillow-Reencode
 *   springt ein (mit Original-Groesse).
 * - Wenn das Bild schon klein genug ist (Langseite <= ``maxLongSide`` UND
 *   Datei <= ``minBytesToCompress``), bleibt das Original — sonst wuerde
 *   das Reencode unnoetig Qualitaet kosten.
 */
export async function compressImage(
  file: File,
  opts: { maxLongSide?: number; quality?: number; minBytesToCompress?: number } = {},
): Promise<File> {
  const maxLongSide = opts.maxLongSide ?? 1600;
  const quality = opts.quality ?? 0.8;
  const minBytesToCompress = opts.minBytesToCompress ?? 512 * 1024;

  if (!file.type.startsWith('image/')) return file;
  if (file.size <= minBytesToCompress) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const longSide = Math.max(bitmap.width, bitmap.height);
  if (longSide <= maxLongSide) {
    bitmap.close();
    return file;
  }

  const scale = maxLongSide / longSide;
  const targetW = Math.round(bitmap.width * scale);
  const targetH = Math.round(bitmap.height * scale);

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(targetW, targetH)
      : Object.assign(document.createElement('canvas'), { width: targetW, height: targetH });

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const blob = await canvasToJpegBlob(canvas, quality);
  if (!blob || blob.size >= file.size) {
    return file;
  }
  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

async function canvasToJpegBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number,
): Promise<Blob | null> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
}
