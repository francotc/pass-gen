import { BRAND_FIELDS, type BrandField, type BrandSettings, type TemplateInput } from '../../../worker/types';
import { labelOn, textOn } from './color';

export const BRAND_FIELD_LABELS: Record<BrandField, { label: string; group: 'Identity' | 'Colors' | 'Barcode' }> = {
  organizationName: { label: 'Organization (Apple)', group: 'Identity' },
  logoText: { label: 'Logo text (Apple)', group: 'Identity' },
  description: { label: 'Description (Apple accessibility)', group: 'Identity' },
  issuerName: { label: 'Issuer name (Google)', group: 'Identity' },
  programName: { label: 'Program name (Google)', group: 'Identity' },
  background: { label: 'Background', group: 'Colors' },
  foreground: { label: 'Text', group: 'Colors' },
  label: { label: 'Labels', group: 'Colors' },
  altText: { label: 'Text below the barcode', group: 'Barcode' },
};

export const COLOR_FIELDS: BrandField[] = ['background', 'foreground', 'label'];

/** Valores que se generan a partir de la marca. */
export function deriveBrand(t: TemplateInput, b: BrandSettings): Record<BrandField, string> {
  const business = b.businessName.trim();
  const program = b.programName.trim();
  return {
    organizationName: business,
    logoText: business,
    description: program && business ? `${program} · ${business}` : program || business,
    issuerName: business,
    programName: program || t.name,
    background: b.color,
    foreground: textOn(b.color),
    label: labelOn(b.color),
    altText: t.barcode.message,
  };
}

export function getField(t: TemplateInput, f: BrandField): string {
  switch (f) {
    case 'issuerName':
      return t.google.issuerName ?? '';
    case 'programName':
      return t.google.programName ?? '';
    case 'background':
    case 'foreground':
    case 'label':
      return t.colors[f];
    case 'altText':
      return t.barcode.altText ?? '';
    default:
      return t[f];
  }
}

export function setField(t: TemplateInput, f: BrandField, v: string) {
  switch (f) {
    case 'issuerName':
      t.google.issuerName = v;
      break;
    case 'programName':
      t.google.programName = v;
      break;
    case 'background':
    case 'foreground':
    case 'label':
      t.colors[f] = v;
      break;
    case 'altText':
      t.barcode.altText = v;
      break;
    default:
      t[f] = v;
  }
}

/** Escribe en la plantilla los valores generados, salvo los que el usuario personalizó. */
export function applyBrand(t: TemplateInput) {
  const b = t.brand!;
  const derived = deriveBrand(t, b);
  for (const f of BRAND_FIELDS) if (!b.overrides.includes(f)) setField(t, f, derived[f]);
}

/** Plantillas anteriores a la marca: la reconstruye y marca como personalizado lo que no coincide. */
export function brandFromTemplate(t: TemplateInput): BrandSettings {
  const b: BrandSettings = {
    businessName: t.organizationName,
    programName: t.google.programName ?? t.name,
    color: t.colors.background,
    overrides: [],
  };
  const derived = deriveBrand(t, b);
  b.overrides = BRAND_FIELDS.filter((f) => getField(t, f).toLowerCase() !== derived[f].toLowerCase());
  return b;
}

/** Clave de campo a partir de la etiqueta: "Next reward" → "next_reward". */
export function slugKey(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'field'
  );
}
