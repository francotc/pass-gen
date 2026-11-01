import { rgbToHex } from './color';

/**
 * Color dominante de una imagen, ignorando transparencias y tonos casi blancos, negros o grises.
 * Agrupa por buckets de 4 bits y elige el más frecuente ponderado por saturación.
 */
export function dominantColor(img: HTMLImageElement | ImageBitmap): string | null {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number; w: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (max > 245 && sat < 0.1) continue; // casi blanco
    if (max < 20) continue; // casi negro
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, w: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    e.w += 0.3 + sat;
    buckets.set(key, e);
  }
  let best: { n: number; r: number; g: number; b: number; w: number } | undefined;
  for (const e of buckets.values()) if (!best || e.w > best.w) best = e;
  return best ? rgbToHex([best.r / best.n, best.g / best.n, best.b / best.n]) : null;
}
