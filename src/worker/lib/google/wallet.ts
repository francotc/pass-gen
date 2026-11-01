import type { BarcodeFormat, Field, GoogleSettings, Pass, PassKind, Template } from '../../types';
import { signJwt } from '../crypto';
import { otpBarcodeValue, type PassOtp } from '../otp';
import { passVars, render } from '../render';

const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';

const BARCODE: Record<BarcodeFormat, string> = {
  QR: 'QR_CODE',
  PDF417: 'PDF_417',
  AZTEC: 'AZTEC',
  CODE128: 'CODE_128',
};

export type Resource = 'loyaltyClass' | 'loyaltyObject' | 'genericClass' | 'genericObject';

export class GoogleError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Los ids de Google solo admiten [A-Za-z0-9._-]. */
const safeId = (s: string) => s.replace(/[^\w.-]/g, '_');
export const classId = (issuerId: string, templateId: string) => `${issuerId}.${safeId(templateId)}`;
export const objectId = (issuerId: string, serial: string) => `${issuerId}.${safeId(serial)}`;

const localized = (value: string) => ({ defaultValue: { language: 'en', value } });
const image = (uri: string | undefined, description: string) =>
  uri ? { sourceUri: { uri }, contentDescription: localized(description) } : undefined;

export async function getAccessToken(sa: GoogleSettings): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt('RS256', sa.privateKey, {}, {
    iss: sa.clientEmail,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new GoogleError(`OAuth: ${body.error_description ?? body.error ?? res.status}`, res.status);
  }
  return body.access_token;
}

export interface ImageUrls {
  logo?: string;
  hero?: string;
  background?: string;
  /** URL pública de una imagen subida (vacío fuera de HTTPS). */
  byId?: (id: string) => string | undefined;
}

export function buildClass(t: Template, issuerId: string, images: ImageUrls): Record<string, unknown> {
  const smartTap = t.nfc?.enabled ? { enableSmartTap: true, redemptionIssuers: [issuerId] } : {};
  // merchantLocations reemplaza al campo `locations` (deprecado, ya no notifica). El radio lo define Google.
  const points = t.locations?.points ?? [];
  const merchantLocations = points.length ? { merchantLocations: points.map((l) => ({ latitude: l.latitude, longitude: l.longitude })) } : {};
  // Google no tiene fondo a pantalla completa: la imagen va a lo ancho en el detalle del pase.
  const imageModules = images.background ? { imageModulesData: [{ id: 'background', mainImage: image(images.background, t.name) }] } : {};
  const base = { id: classId(issuerId, t.id), ...smartTap, ...merchantLocations, ...imageModules };
  if (t.kind === 'generic') return base;
  return JSON.parse(
    JSON.stringify({
      ...base,
      issuerName: t.google.issuerName || t.organizationName,
      programName: t.google.programName || t.name,
      programLogo: image(images.logo, t.organizationName),
      hexBackgroundColor: t.colors.background,
      reviewStatus: 'UNDER_REVIEW',
    }),
  );
}

function textModules(fields: Field[], vars: Record<string, string>) {
  return fields
    .map((f) => ({ id: safeId(f.key), header: render(f.label, vars), body: render(f.value, vars) }))
    .filter((m) => m.body);
}

export function buildObject(t: Template, p: Pass, issuerId: string, images: ImageUrls, otp?: PassOtp): Record<string, unknown> {
  const vars = passVars(p);
  const [lead, ...rest] = [...t.headerFields, ...t.primaryFields];
  const others = [...rest, ...t.secondaryFields, ...t.auxiliaryFields, ...t.backFields];
  const common = {
    smartTapRedemptionValue: t.nfc?.enabled ? render(t.nfc.message, vars) : undefined,
    id: objectId(issuerId, p.serial),
    classId: classId(issuerId, t.id),
    state: p.voided ? 'INACTIVE' : 'ACTIVE',
    hexBackgroundColor: t.colors.background,
    heroImage: image(images.hero, t.name),
    barcode: t.barcode.message
      ? {
          type: BARCODE[t.barcode.format],
          value: render(t.barcode.message, vars),
          alternateText: t.barcode.altText ? render(t.barcode.altText, vars) : undefined,
        }
      : undefined,
  };

  Object.assign(common, actionModules(t, vars, images));
  if (otp) {
    // El teléfono genera el TOTP; sin barcode estático para que una captura no sirva.
    delete (common as Record<string, unknown>).barcode;
    Object.assign(common, {
      rotatingBarcode: {
        // Los códigos rotativos solo admiten QR y PDF417; el resto cae a QR.
        type: t.barcode.format === 'PDF417' ? 'PDF_417' : 'QR_CODE',
        valuePattern: otpBarcodeValue(p.serial, '{totp_value_0}'),
        alternateText: p.serial,
        totpDetails: {
          periodMillis: String((t.otp?.googlePeriodSeconds ?? 30) * 1000),
          algorithm: 'TOTP_SHA1',
          parameters: [{ key: otp.keyHex, valueLength: 8 }],
        },
      },
    });
  }
  const obj =
    t.kind === 'loyalty'
      ? {
          ...common,
          accountId: p.serial,
          accountName: p.holderName,
          loyaltyPoints: lead
            ? { label: render(lead.label, vars), balance: { string: render(lead.value, vars) } }
            : undefined,
          textModulesData: textModules(others, vars),
        }
      : {
          ...common,
          cardTitle: localized(t.organizationName || t.name),
          header: localized(lead ? render(lead.value, vars) : p.holderName),
          subheader: lead ? localized(render(lead.label, vars)) : undefined,
          logo: image(images.logo, t.organizationName),
          textModulesData: textModules(lead ? others : [...rest, ...others], vars),
        };
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Links, botón y módulos van en el object (no en la class) para poder usar placeholders por pase.
 * AppLinkData del object reemplaza al de la class; links y módulos se suman.
 */
function actionModules(t: Template, vars: Record<string, string>, images: ImageUrls): Record<string, unknown> {
  const a = t.actions;
  if (!a) return {};
  const r = (s: string) => render(s, vars);
  const out: Record<string, unknown> = {};
  if (a.links.length) {
    out.linksModuleData = { uris: a.links.map((l, i) => ({ id: `link${i}`, uri: r(l.url), description: r(l.label) })) };
  }
  if (a.button) {
    const uri = r(a.button.url);
    out.appLinkData = {
      displayText: localized(a.button.label),
      webAppLinkInfo: { appTarget: { targetUri: { uri, description: a.button.label } } },
      ...(a.button.androidPackage ? { androidAppLinkInfo: { appTarget: { packageName: a.button.androidPackage } } } : {}),
    };
  }
  if (a.modules.length) {
    out.valueAddedModuleData = a.modules.map((m, i) => {
      const img = m.imageId ? images.byId?.(m.imageId) : undefined;
      return {
        ...(m.header ? { header: localized(r(m.header)) } : {}),
        ...(m.body ? { body: localized(r(m.body)) } : {}),
        ...(m.url ? { uri: r(m.url) } : {}),
        ...(img ? { image: image(img, m.header || m.body) } : {}),
        sortIndex: i,
        ...(m.displayStart || m.displayEnd
          ? {
              viewConstraints: {
                displayInterval: {
                  ...(m.displayStart ? { start: { date: m.displayStart } } : {}),
                  ...(m.displayEnd ? { end: { date: m.displayEnd } } : {}),
                },
              },
            }
          : {}),
      };
    });
  }
  return out;
}

/** Crea o reemplaza un recurso: GET → PUT si existe, POST si no. */
export async function upsert(token: string, resource: Resource, body: Record<string, unknown>): Promise<void> {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const id = encodeURIComponent(String(body.id));
  const existing = await fetch(`${API}/${resource}/${id}`, { headers });
  if (existing.status !== 404 && !existing.ok) throw await asError(existing);
  if (existing.ok && !('messages' in body)) {
    // PUT reemplaza el recurso entero: conservar los mensajes enviados con addMessage.
    const current = (await existing.json()) as { messages?: unknown[] };
    if (current.messages?.length) body = { ...body, messages: current.messages };
  }
  const res = existing.ok
    ? await fetch(`${API}/${resource}/${id}`, { method: 'PUT', headers, body: JSON.stringify(body) })
    : await fetch(`${API}/${resource}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw await asError(res);
}

/** Lee un recurso tal como lo tiene Google (null si no existe). */
export async function getResource(token: string, resource: Resource, id: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API}/${resource}/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw await asError(res);
  return (await res.json()) as Record<string, unknown>;
}

export interface GoogleMessage {
  id: string;
  header: string;
  body: string;
  messageType: 'TEXT' | 'TEXT_AND_NOTIFY';
  localizedHeader?: Record<string, unknown>;
  localizedBody?: Record<string, unknown>;
  displayInterval?: { start?: { date: string }; end?: { date: string } };
}

/** Agrega un mensaje a un object (un pase) o a una class (todos sus titulares). */
export async function addMessage(token: string, resource: Resource, resourceId: string, message: GoogleMessage): Promise<void> {
  const res = await fetch(`${API}/${resource}/${encodeURIComponent(resourceId)}/addMessage`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw await asError(res);
}

/** Arma un LocalizedString de Google a partir del valor por defecto y sus traducciones. */
export function localizedString(defaultValue: string, translations: { language: string; value: string }[]) {
  return {
    defaultValue: { language: 'en', value: defaultValue },
    ...(translations.length ? { translatedValues: translations.map((t) => ({ language: t.language, value: t.value })) } : {}),
  };
}

async function asError(res: Response): Promise<GoogleError> {
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  return new GoogleError(`Google Wallet ${res.status}: ${body.error?.message ?? res.statusText}`, res.status);
}

export const classResource = (kind: PassKind): Resource => (kind === 'loyalty' ? 'loyaltyClass' : 'genericClass');
export const objectResource = (kind: PassKind): Resource => (kind === 'loyalty' ? 'loyaltyObject' : 'genericObject');

/** Link "Save to Google Wallet" para un objeto ya creado por API. */
export async function saveLink(sa: GoogleSettings, kind: PassKind, objId: string, origins: string[]): Promise<string> {
  const jwt = await signJwt('RS256', sa.privateKey, {}, {
    iss: sa.clientEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins,
    payload: { [kind === 'loyalty' ? 'loyaltyObjects' : 'genericObjects']: [{ id: objId }] },
  });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
