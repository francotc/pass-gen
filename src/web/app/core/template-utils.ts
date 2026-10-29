import { FIELD_SECTIONS, type FieldSection, type TemplateInput } from '../../../worker/types';

export const SECTION_LABELS: Record<FieldSection, { title: string; hint: string }> = {
  headerFields: { title: 'Encabezado', hint: 'Arriba a la derecha en Apple. El primero es el saldo en Google.' },
  primaryFields: { title: 'Principales', hint: 'Texto grande sobre la imagen strip.' },
  secondaryFields: { title: 'Secundarios', hint: 'Fila debajo de la imagen.' },
  auxiliaryFields: { title: 'Auxiliares', hint: 'Fila adicional.' },
  backFields: { title: 'Reverso', hint: 'Detalles al dar vuelta el pase (Apple) y módulos de texto (Google).' },
};

const RESERVED = new Set(['holderName', 'serial']);

/** Claves {{placeholder}} usadas en la plantilla que el pase debe completar. */
export function placeholderKeys(t: TemplateInput): string[] {
  const texts = [t.logoText, t.barcode.message, t.barcode.altText ?? ''];
  for (const s of FIELD_SECTIONS) for (const f of t[s]) texts.push(f.label, f.value);
  const keys = new Set<string>();
  for (const text of texts) for (const m of text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) if (!RESERVED.has(m[1])) keys.add(m[1]);
  return [...keys];
}

export function newTemplate(): TemplateInput {
  return {
    name: 'Tarjeta de sellos',
    kind: 'loyalty',
    organizationName: '[Tu negocio]',
    description: 'Tarjeta de fidelidad',
    logoText: '[Tu negocio]',
    colors: { background: '#171717', foreground: '#fafafa', label: '#a3a3a3' },
    images: {},
    barcode: { format: 'QR', message: '{{serial}}', altText: '{{serial}}' },
    headerFields: [{ key: 'stamps', label: 'SELLOS', value: '{{stamps}} / 10', changeMessage: 'Ahora tenés %@ sellos' }],
    primaryFields: [],
    secondaryFields: [
      { key: 'member', label: 'MIEMBRO', value: '{{holderName}}' },
      { key: 'reward', label: 'PRÓXIMO PREMIO', value: '{{reward}}' },
    ],
    auxiliaryFields: [],
    backFields: [{ key: 'terms', label: 'Términos', value: 'Un sello por visita. Canjeable en cualquier local.' }],
    google: { programName: 'Tarjeta de sellos', issuerName: '' },
  };
}

export function toInput(t: TemplateInput & { id?: string; createdAt?: string; updatedAt?: string }): TemplateInput {
  const { id: _i, createdAt: _c, updatedAt: _u, ...input } = t;
  return structuredClone(input);
}
