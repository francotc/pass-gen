import {
  FIELD_SECTIONS,
  NFC_MAX_BYTES,
  type NfcSettings,
  type BarcodeFormat,
  type Field,
  type ImageSlot,
  type PassInput,
  type PassKind,
  type TemplateInput,
} from '../types';

export class ValidationError extends Error {}

const KINDS: PassKind[] = ['loyalty', 'generic'];
const FORMATS: BarcodeFormat[] = ['QR', 'PDF417', 'AZTEC', 'CODE128'];
const SLOTS: ImageSlot[] = ['icon', 'logo', 'strip', 'hero'];
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.slice(0, max) : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function color(v: unknown, name: string): string {
  const s = str(v, 7);
  if (!HEX.test(s)) throw new ValidationError(`Invalid color: ${name}`);
  return s;
}

function fields(v: unknown, section: string): Field[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new ValidationError(`${section} must be a list`);
  const seen = new Set<string>();
  return v.map((raw, i) => {
    const f = obj(raw);
    const key = str(f.key, 64).trim();
    if (!/^[\w-]+$/.test(key)) throw new ValidationError(`${section}[${i}]: invalid key`);
    if (seen.has(key)) throw new ValidationError(`${section}: duplicate key "${key}"`);
    seen.add(key);
    const changeMessage = str(f.changeMessage, 200);
    return { key, label: str(f.label, 100), value: str(f.value, 2000), ...(changeMessage ? { changeMessage } : {}) };
  });
}

export function parseTemplateInput(body: unknown): TemplateInput {
  const b = obj(body);
  const name = str(b.name, 120).trim();
  if (!name) throw new ValidationError('Name is required');
  const kind = b.kind as PassKind;
  if (!KINDS.includes(kind)) throw new ValidationError('Invalid pass type');
  const colors = obj(b.colors);
  const barcode = obj(b.barcode);
  const format = (barcode.format ?? 'QR') as BarcodeFormat;
  if (!FORMATS.includes(format)) throw new ValidationError('Invalid barcode format');
  const images = obj(b.images);
  const google = obj(b.google);
  const nfc = parseNfc(b.nfc);

  const out = {
    name,
    kind,
    organizationName: str(b.organizationName, 120).trim() || name,
    description: str(b.description, 200),
    logoText: str(b.logoText, 60),
    colors: {
      background: color(colors.background, 'background'),
      foreground: color(colors.foreground, 'text'),
      label: color(colors.label, 'label'),
    },
    images: Object.fromEntries(SLOTS.filter((s) => typeof images[s] === 'string' && images[s]).map((s) => [s, str(images[s], 64)])),
    barcode: { format, message: str(barcode.message, 500), altText: str(barcode.altText, 100) || undefined },
    google: { programName: str(google.programName, 120) || undefined, issuerName: str(google.issuerName, 120) || undefined },
    nfc,
  } as TemplateInput;
  for (const sec of FIELD_SECTIONS) out[sec] = fields(b[sec], sec);
  return out;
}

/** SPKI de una clave P-256: 59 bytes (comprimida) o 91 (sin comprimir). */
function isP256Spki(b64: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return false;
  try {
    const len = atob(b64).length;
    return len === 59 || len === 91;
  } catch {
    return false;
  }
}

function parseNfc(v: unknown): NfcSettings {
  const n = obj(v);
  const enabled = n.enabled === true;
  const message = str(n.message, 500);
  const encryptionPublicKey = str(n.encryptionPublicKey, 500).replace(/-----[^-]+-----|\s+/g, '');
  if (enabled) {
    if (!message.trim()) throw new ValidationError('NFC: the message is required');
    // Sin placeholders ya debe entrar; con datos del pase se recorta al emitir.
    if (new TextEncoder().encode(message.replace(/\{\{[^}]*\}\}/g, '')).length > NFC_MAX_BYTES) {
      throw new ValidationError(`NFC: the message exceeds ${NFC_MAX_BYTES} bytes`);
    }
    if (encryptionPublicKey && !isP256Spki(encryptionPublicKey)) {
      throw new ValidationError('NFC: the public key must be a base64 P-256 SubjectPublicKeyInfo');
    }
  }
  return {
    enabled,
    message,
    ...(encryptionPublicKey ? { encryptionPublicKey } : {}),
    ...(n.requiresAuthentication === true ? { requiresAuthentication: true } : {}),
  };
}

export function parsePassInput(body: unknown): PassInput {
  const b = obj(body);
  const templateId = str(b.templateId, 64);
  if (!templateId) throw new ValidationError('Template is required');
  const holderName = str(b.holderName, 200).trim();
  if (!holderName) throw new ValidationError('Holder name is required');
  return { templateId, holderName, data: parseData(b.data) };
}

export function parseData(v: unknown): Record<string, string> {
  const d = obj(v);
  return Object.fromEntries(
    Object.entries(d)
      .filter(([k]) => /^[\w-]{1,64}$/.test(k))
      .map(([k, val]) => [k, str(typeof val === 'number' ? String(val) : val, 2000)]),
  );
}
