import { FIELD_SECTIONS, type TemplateInput } from '../../../worker/types';
import { SECTION_LABELS } from './template-utils';

/** Idiomas sugeridos (BCP 47, válidos en Apple y Google). Se puede escribir cualquier otro. */
export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'es-419', name: 'Spanish (Latin America)' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'he', name: 'Hebrew' },
];

export const LANGUAGE_TAG = /^[a-zA-Z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export const languageName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code;

export interface TranslatableText {
  source: string;
  /** Dónde aparece, para orientar al traductor. */
  context: string;
}

/** ¿Tiene texto para traducir más allá de los placeholders? */
const hasWords = (s: string) => /\p{L}/u.test(s.replace(/\{\{[^}]*\}\}/g, ''));

/** Textos de la plantilla que se muestran en el pase, sin duplicados. */
export function translatableTexts(t: TemplateInput): TranslatableText[] {
  const out: TranslatableText[] = [];
  const add = (source: string | undefined, context: string) => {
    const s = source?.trim();
    if (s && hasWords(s) && !out.some((o) => o.source === s)) out.push({ source: s, context });
  };
  add(t.organizationName, 'Business name');
  add(t.google.programName || t.name, t.kind === 'loyalty' ? 'Program name' : 'Pass title');
  add(t.google.issuerName, 'Issuer name (Google)');
  add(t.logoText, 'Logo text (Apple)');
  add(t.description, 'Description (Apple, accessibility)');
  for (const s of FIELD_SECTIONS) {
    for (const f of t[s]) {
      add(f.label, `${SECTION_LABELS[s].title} field label`);
      add(f.value, `${SECTION_LABELS[s].title} field value`);
    }
  }
  add(t.barcode.altText, 'Text below the barcode');
  const a = t.actions;
  if (a) {
    for (const l of a.links) add(l.label, 'Link');
    add(a.button?.label, 'Button (Google)');
    for (const m of a.modules) {
      add(m.header, 'Module title (Google)');
      add(m.body, 'Module text (Google)');
    }
  }
  for (const l of [...(t.locations?.points ?? []), ...(t.locations?.beacons ?? [])]) add(l.relevantText, 'Lock screen text (Apple)');
  return out;
}

/** Quita traducciones de textos que ya no existen en la plantilla y las vacías. */
export function pruneTranslations(t: TemplateInput): TemplateInput['localization'] {
  const loc = t.localization;
  if (!loc) return loc;
  const sources = new Set(translatableTexts(t).map((x) => x.source));
  const translations = Object.fromEntries(
    Object.entries(loc.translations).map(([lang, map]) => [
      lang,
      Object.fromEntries(Object.entries(map).filter(([src, v]) => sources.has(src) && v.trim())),
    ]),
  );
  return { language: loc.language, translations };
}
