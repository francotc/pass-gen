type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = ([r, g, b]: Rgb) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Luminancia relativa (WCAG 2.x). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mezcla lineal: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

const LIGHT = '#ffffff';
const DARK = '#0a0a0a';

/** Texto con mejor contraste sobre el fondo. */
export const textOn = (bg: string) => (contrast(bg, LIGHT) >= contrast(bg, DARK) ? LIGHT : DARK);

/** Etiquetas: el texto atenuado hacia el fondo, sin bajar de 3:1 (WCAG para texto grande/UI). */
export function labelOn(bg: string): string {
  const fg = textOn(bg);
  for (const t of [0.4, 0.3, 0.2, 0.1]) {
    const c = mix(fg, bg, t);
    if (contrast(c, bg) >= 3) return c;
  }
  return fg;
}
