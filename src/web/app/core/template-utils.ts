import { FIELD_SECTIONS, type FieldSection, type TemplateInput } from '../../../worker/types';

export const SECTION_LABELS: Record<FieldSection, { title: string; hint: string }> = {
  headerFields: { title: 'Header', hint: 'Top right on Apple. The first one is the balance on Google.' },
  primaryFields: { title: 'Primary', hint: 'Large text over the strip image.' },
  secondaryFields: { title: 'Secondary', hint: 'Row below the image.' },
  auxiliaryFields: { title: 'Auxiliary', hint: 'Additional row.' },
  backFields: { title: 'Back', hint: 'Details on the back of the pass (Apple) and text modules (Google).' },
};

const RESERVED = new Set(['holderName', 'serial']);

/** Claves {{placeholder}} usadas en la plantilla que el pase debe completar. */
export function placeholderKeys(t: TemplateInput): string[] {
  const texts = [t.logoText, t.barcode.message, t.barcode.altText ?? ''];
  if (t.nfc?.enabled) texts.push(t.nfc.message);
  for (const s of FIELD_SECTIONS) for (const f of t[s]) texts.push(f.label, f.value);
  const keys = new Set<string>();
  for (const text of texts) for (const m of text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) if (!RESERVED.has(m[1])) keys.add(m[1]);
  return [...keys];
}

export function newTemplate(): TemplateInput {
  return {
    name: 'Stamp card',
    kind: 'loyalty',
    organizationName: '[Your business]',
    description: 'Loyalty card',
    logoText: '[Your business]',
    colors: { background: '#171717', foreground: '#fafafa', label: '#a3a3a3' },
    images: {},
    barcode: { format: 'QR', message: '{{serial}}', altText: '{{serial}}' },
    headerFields: [{ key: 'stamps', label: 'STAMPS', value: '{{stamps}} / 10', changeMessage: 'You now have %@ stamps' }],
    primaryFields: [],
    secondaryFields: [
      { key: 'member', label: 'MEMBER', value: '{{holderName}}' },
      { key: 'reward', label: 'NEXT REWARD', value: '{{reward}}' },
    ],
    auxiliaryFields: [],
    backFields: [{ key: 'terms', label: 'Terms', value: 'One stamp per visit. Redeemable at any location.' }],
    google: { programName: 'Stamp card', issuerName: '' },
    nfc: { enabled: false, message: '{{serial}}' },
  };
}

export function toInput(t: TemplateInput & { id?: string; createdAt?: string; updatedAt?: string }): TemplateInput {
  const { id: _i, createdAt: _c, updatedAt: _u, ...input } = t;
  const out = structuredClone(input);
  // Plantillas guardadas antes de soportar NFC.
  out.nfc ??= { enabled: false, message: '{{serial}}' };
  return out;
}
