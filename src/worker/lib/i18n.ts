import type { Template } from '../types';
import { render } from './render';

/**
 * Traducciones de la plantilla: `translations[idioma][texto original] = texto traducido`.
 * La clave es el texto tal como está en la plantilla (con sus {{placeholders}}), así una
 * traducción sobrevive aunque cambie el orden de los campos. Ambos lados se renderizan por pase.
 */
export const DEFAULT_LANGUAGE = 'en';

export interface Translated {
  language: string;
  value: string;
}

export interface I18n {
  /** Idioma principal (el de los textos de la plantilla). */
  language: string;
  /** Traducciones renderizadas de un texto de la plantilla (solo las que existen y no están vacías). */
  tr(source: string): Translated[];
  /** LocalizedString de Google. `value` reemplaza al texto renderizado (por si ya viene procesado). */
  ls(source: string, value?: string): Record<string, unknown>;
}

export function i18n(t: Pick<Template, 'localization'>, vars: Record<string, string> = {}): I18n {
  const language = t.localization?.language || DEFAULT_LANGUAGE;
  const langs = Object.entries(t.localization?.translations ?? {}).filter(([l]) => l !== language);
  const tr = (source: string): Translated[] =>
    langs.flatMap(([l, map]) => {
      const target = map[source.trim()];
      return target?.trim() ? [{ language: l, value: render(target, vars) }] : [];
    });
  return {
    language,
    tr,
    ls(source, value = render(source, vars)) {
      const translated = tr(source);
      return {
        defaultValue: { language, value },
        ...(translated.length ? { translatedValues: translated } : {}),
      };
    },
  };
}

/** Idiomas con al menos una traducción (sin el principal). */
export const translationLanguages = (t: Pick<Template, 'localization'>) =>
  Object.entries(t.localization?.translations ?? {})
    .filter(([l, map]) => l !== (t.localization?.language || DEFAULT_LANGUAGE) && Object.values(map).some((v) => v.trim()))
    .map(([l]) => l);

/** Escapa un texto para un archivo .strings de Apple. */
const escapeStrings = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');

/** Archivo pass.strings en UTF-16LE con BOM, como lo pide Apple. */
export function passStrings(entries: [string, string][]): Uint8Array {
  const text = entries.map(([k, v]) => `"${escapeStrings(k)}" = "${escapeStrings(v)}";\n`).join('');
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[3 + i * 2] = c >> 8;
  }
  return out;
}
