import {
  FIELD_SECTIONS,
  type AppleMessagePlacement,
  type MessageTranslation,
  type NotificationInput,
  type NotificationTarget,
  FEATURED_ACTIONS,
  MAX_FEATURED_ACTIONS,
  MAX_LINKS,
  MAX_MODULES,
  MAX_LOCATIONS,
  type ActionSettings,
  type FeaturedActionType,
  NFC_MAX_BYTES,
  type LocationSettings,
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
const SLOTS: ImageSlot[] = ['icon', 'logo', 'strip', 'hero', 'background'];
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
  const locations = parseLocations(b.locations);
  const actions = parseActions(b.actions);
  const background = { poster: obj(b.background).poster === true };

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
    locations,
    actions,
    background,
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(v: unknown, name: string, min: number, max: number, required = true): number | undefined {
  if (v === undefined || v === null || v === '') {
    if (required) throw new ValidationError(`${name} is required`);
    return undefined;
  }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(`${name} must be between ${min} and ${max}`);
  return n;
}

function int(v: unknown, name: string, min: number, max: number): number | undefined {
  const n = num(v, name, min, max, false);
  if (n !== undefined && !Number.isInteger(n)) throw new ValidationError(`${name} must be an integer`);
  return n;
}

/** Quita claves undefined para no guardar ruido en KV. */
const compact = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o));

function parseLocations(v: unknown): LocationSettings {
  const l = obj(v);
  const list = (x: unknown, name: string) => {
    if (x === undefined) return [];
    if (!Array.isArray(x)) throw new ValidationError(`${name} must be a list`);
    if (x.length > MAX_LOCATIONS) throw new ValidationError(`Up to ${MAX_LOCATIONS} ${name} are allowed`);
    return x;
  };
  const points = list(l.points, 'locations').map((raw, i) => {
    const p = obj(raw);
    const n = `Location ${i + 1}`;
    return compact({
      name: str(p.name, 80).trim() || undefined,
      latitude: num(p.latitude, `${n}: latitude`, -90, 90)!,
      longitude: num(p.longitude, `${n}: longitude`, -180, 180)!,
      altitude: num(p.altitude, `${n}: altitude`, -1000, 10000, false),
      relevantText: str(p.relevantText, 100).trim() || undefined,
    });
  });
  const beacons = list(l.beacons, 'beacons').map((raw, i) => {
    const b = obj(raw);
    const n = `Beacon ${i + 1}`;
    const proximityUUID = str(b.proximityUUID, 36).trim();
    if (!UUID.test(proximityUUID)) throw new ValidationError(`${n}: proximity UUID must be a UUID`);
    return compact({
      proximityUUID: proximityUUID.toUpperCase(),
      major: int(b.major, `${n}: major`, 0, 65535),
      minor: int(b.minor, `${n}: minor`, 0, 65535),
      relevantText: str(b.relevantText, 100).trim() || undefined,
    });
  });
  const maxDistance = int(l.maxDistance, 'Max distance', 1, 100000);
  return compact({ points, beacons, maxDistance });
}

const WEB_URL = /^https?:\/\/\S+$/i;
const LINK_URL = /^(https?:\/\/|tel:|mailto:|geo:)\S+$/i;
const ANDROID_PACKAGE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;

function url(v: unknown, name: string, pattern: RegExp, required = true): string | undefined {
  const s = str(v, 1000).trim();
  if (!s) {
    if (required) throw new ValidationError(`${name}: URL is required`);
    return undefined;
  }
  if (!pattern.test(s)) {
    throw new ValidationError(pattern === WEB_URL ? `${name}: URL must start with http(s)://` : `${name}: URL must start with http(s)://, tel:, mailto: or geo:`);
  }
  return s;
}

function parseActions(v: unknown): ActionSettings {
  const a = obj(v);
  const list = (x: unknown, name: string, max: number) => {
    if (x === undefined) return [];
    if (!Array.isArray(x)) throw new ValidationError(`${name} must be a list`);
    if (x.length > max) throw new ValidationError(`Up to ${max} ${name} are allowed`);
    return x;
  };

  const links = list(a.links, 'links', MAX_LINKS).map((raw, i) => {
    const l = obj(raw);
    const label = str(l.label, 40).trim();
    if (!label) throw new ValidationError(`Link ${i + 1}: label is required`);
    return { label, url: url(l.url, `Link ${i + 1}`, LINK_URL)! };
  });

  const b = obj(a.button);
  let button: ActionSettings['button'];
  if (str(b.label).trim() || str(b.url).trim()) {
    const label = str(b.label, 30).trim();
    if (!label) throw new ValidationError('Button: label is required (max 30 characters)');
    const androidPackage = str(b.androidPackage, 200).trim() || undefined;
    if (androidPackage && !ANDROID_PACKAGE.test(androidPackage)) throw new ValidationError('Button: invalid Android package name');
    button = compact({ label, url: url(b.url, 'Button', WEB_URL)!, androidPackage });
  }

  const modules = list(a.modules, 'modules', MAX_MODULES).map((raw, i) => {
    const m = obj(raw);
    const n = `Module ${i + 1}`;
    const header = str(m.header, 60).trim();
    const body = str(m.body, 50).trim();
    if (!header && !body) throw new ValidationError(`${n}: header or text is required`);
    const displayStart = optionalIso(m.displayStart, `${n}: display start`);
    const displayEnd = optionalIso(m.displayEnd, `${n}: display end`);
    if (displayStart && displayEnd && displayEnd <= displayStart) throw new ValidationError(`${n}: display end must be after start`);
    return compact({
      header,
      body,
      url: url(m.url, n, LINK_URL, false),
      imageId: str(m.imageId, 64).trim() || undefined,
      displayStart,
      displayEnd,
    });
  });

  const featured = list(a.featured, 'featured actions', MAX_FEATURED_ACTIONS).map((raw, i) => {
    const f = obj(raw);
    const action = f.action as FeaturedActionType;
    if (!FEATURED_ACTIONS.includes(action)) throw new ValidationError(`Featured action ${i + 1}: invalid action`);
    return compact({ action, url: url(f.url, `Featured action ${i + 1}`, LINK_URL)!, label: str(f.label, 40).trim() || undefined });
  });

  const ids = a.appStoreIds === undefined ? [] : a.appStoreIds;
  if (!Array.isArray(ids)) throw new ValidationError('App Store ids must be a list');
  const appStoreIds = ids.map((x) => {
    const n = Number(x);
    if (!Number.isInteger(n) || n <= 0) throw new ValidationError('App Store ids must be positive integers');
    return n;
  });
  const appLaunchURL = str(a.appLaunchURL, 1000).trim() || undefined;
  if (appLaunchURL && !appStoreIds.length) throw new ValidationError('App launch URL requires an App Store id');

  return compact({ links, button, modules, featured, appLaunchURL, appStoreIds });
}

function optionalIso(v: unknown, name: string): string | undefined {
  const s = str(v, 40).trim();
  if (!s) return undefined;
  if (Number.isNaN(Date.parse(s))) throw new ValidationError(`Invalid date: ${name}`);
  return new Date(s).toISOString();
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

const PLACEMENTS: AppleMessagePlacement[] = ['backFields', 'secondaryFields', 'auxiliaryFields'];
const LANG = /^[a-zA-Z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const PLACEHOLDER = /\{\{[^}]*\}\}/;

function isoDate(v: unknown, name: string): string | undefined {
  const s = str(v, 40).trim();
  if (!s) return undefined;
  if (Number.isNaN(Date.parse(s))) throw new ValidationError(`Invalid date: ${name}`);
  return new Date(s).toISOString();
}

export function parseNotificationInput(body: unknown): NotificationInput {
  const b = obj(body);
  const t = obj(b.target);
  let target: NotificationTarget;
  if (t.type === 'pass' && str(t.serial, 64)) target = { type: 'pass', serial: str(t.serial, 64) };
  else if (t.type === 'template' && str(t.templateId, 64)) target = { type: 'template', templateId: str(t.templateId, 64) };
  else throw new ValidationError('Invalid target: choose a pass or a template');

  const header = str(b.header, 100).trim();
  const text = str(b.body, 1000).trim();
  if (!header) throw new ValidationError('Header is required');
  if (!text) throw new ValidationError('Message is required');

  const link = str(b.link, 500).trim() || undefined;
  if (link && !/^https?:\/\/\S+$/.test(link)) throw new ValidationError('Link must be an http(s) URL');

  if (b.translations !== undefined && !Array.isArray(b.translations)) throw new ValidationError('translations must be a list');
  const translations: MessageTranslation[] = ((b.translations as unknown[]) ?? []).slice(0, 20).map((raw, i) => {
    const tr = obj(raw);
    const language = str(tr.language, 20).trim();
    if (!LANG.test(language)) throw new ValidationError(`Translation ${i + 1}: invalid language tag`);
    const trHeader = str(tr.header, 100).trim();
    const trBody = str(tr.body, 1000).trim();
    if (!trHeader || !trBody) throw new ValidationError(`Translation ${i + 1}: header and message are required`);
    return { language, header: trHeader, body: trBody };
  });

  const a = obj(b.apple);
  const placement = (a.placement ?? 'backFields') as AppleMessagePlacement;
  if (!PLACEMENTS.includes(placement)) throw new ValidationError('Invalid Apple placement');
  const changeMessage = str(a.changeMessage, 200).trim() || '%@';
  if (!changeMessage.includes('%@')) throw new ValidationError('Apple notification text must include %@ (the message)');

  const g = obj(b.google);
  const scope = g.scope === 'class' ? 'class' : 'object';
  if (scope === 'class') {
    if (target.type !== 'template') throw new ValidationError('Google class messages require a template target');
    const texts = [header, text, ...translations.flatMap((tr) => [tr.header, tr.body])];
    if (texts.some((x) => PLACEHOLDER.test(x))) {
      throw new ValidationError('Google class messages are shared by all holders and cannot use placeholders');
    }
  }
  const displayStart = isoDate(g.displayStart, 'display start');
  const displayEnd = isoDate(g.displayEnd, 'display end');
  if (displayStart && displayEnd && displayEnd <= displayStart) throw new ValidationError('Display end must be after start');

  const apple = { enabled: a.enabled === true, placement, changeMessage };
  const google = { enabled: g.enabled === true, notify: g.notify !== false, scope, displayStart, displayEnd } as NotificationInput['google'];
  if (!apple.enabled && !google.enabled) throw new ValidationError('Enable Apple, Google or both');
  return { target, header, body: text, link, translations, apple, google };
}
