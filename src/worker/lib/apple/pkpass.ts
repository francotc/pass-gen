import { zipSync } from 'fflate';
import forge from 'node-forge';
import { NFC_MAX_BYTES, type AppleSettings, type BarcodeFormat, type Field, type FieldSection, type ImageSlot, type Pass, type PassMessage, type Template } from '../../types';
import { b64ToBytes, sha1Hex } from '../crypto';
import { DEFAULT_LANGUAGE, passStrings, translationLanguages } from '../i18n';
import { otpBarcodeValue, type PassOtp } from '../otp';
import { passVars, render } from '../render';

const BARCODE: Record<BarcodeFormat, string> = {
  QR: 'PKBarcodeFormatQR',
  PDF417: 'PKBarcodeFormatPDF417',
  AZTEC: 'PKBarcodeFormatAztec',
  CODE128: 'PKBarcodeFormatCode128',
};

const SECTIONS: FieldSection[] = ['headerFields', 'primaryFields', 'secondaryFields', 'auxiliaryFields', 'backFields'];

/** PNG transparente 1x1, usado cuando la plantilla no tiene ícono (Apple lo exige). */
const PLACEHOLDER_ICON = b64ToBytes(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function renderFields(fields: Field[], vars: Record<string, string>) {
  return fields.map((f) => ({
    key: f.key,
    label: render(f.label, vars),
    value: render(f.value, vars),
    ...(f.changeMessage ? { changeMessage: f.changeMessage } : {}),
  }));
}

/** Clave fija del campo de mensaje; no puede chocar con las claves de la plantilla (validadas a [\w-]). */
export const MESSAGE_FIELD_KEY = 'pg.message';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Campo que lleva el mensaje. Apple notifica en la pantalla bloqueada cuando cambia el valor
 * de un campo con changeMessage; %@ se reemplaza por el valor nuevo.
 */
function messageField(m: PassMessage) {
  const linkable = m.link && m.placement === 'backFields';
  return {
    key: MESSAGE_FIELD_KEY,
    label: m.header,
    value: m.body,
    changeMessage: m.changeMessage,
    // Solo el reverso muestra links; attributedValue reemplaza a value en pantalla.
    ...(linkable ? { attributedValue: `${escapeHtml(m.body)} <a href="${escapeHtml(m.link!)}">${escapeHtml(m.link!)}</a>` } : {}),
  };
}

/** Links de la plantilla como campos del reverso; attributedValue los vuelve tocables. */
function linkFields(t: Template, vars: Record<string, string>) {
  return (t.actions?.links ?? []).map((l, i) => {
    const href = render(l.url, vars);
    const label = render(l.label, vars);
    return { key: `pg.link.${i}`, label, value: href, attributedValue: `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>` };
  });
}

/**
 * Estilo poster (iOS/watchOS 27+): fondo a pantalla completa y hasta 2 acciones destacadas.
 * `posterGeneric` y su layout (1 header, 4 primary, 2 footer, back) salen de la guía de Apple
 * «Creating a poster generic pass». La clave de las acciones destacadas no está publicada en la
 * referencia de pass.json: `featuredActions` es una inferencia; si iOS no la reconoce la ignora.
 * Los iPhone anteriores usan el estilo clásico (storeCard/generic) que va en el mismo pass.json.
 */
function posterStyle(style: Record<string, unknown[] | undefined>) {
  const out: Record<string, unknown[]> = {};
  const header = style.headerFields?.slice(0, 1);
  const primary = [...(style.primaryFields ?? []), ...(style.secondaryFields ?? [])].slice(0, 4);
  const footer = style.auxiliaryFields?.slice(0, 2);
  if (header?.length) out.headerFields = header;
  if (primary.length) out.primaryFields = primary;
  if (footer?.length) out.footerFields = footer;
  if (style.backFields?.length) out.backFields = style.backFields;
  return out;
}

/** Recorta a un máximo de bytes UTF-8 sin cortar caracteres. */
export function truncateUtf8(s: string, max: number): string {
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = '';
  for (const ch of s) {
    if (enc.encode(out + ch).length > max) break;
    out += ch;
  }
  return out;
}

export function buildPassJson(t: Template, p: Pass, s: AppleSettings, origin: string, otp?: PassOtp): Record<string, unknown> {
  const vars = passVars(p);
  const style: Record<string, unknown> = {};
  for (const sec of SECTIONS) {
    if (t[sec].length) style[sec] = renderFields(t[sec], vars);
  }
  if (p.message) {
    const sec = p.message.placement;
    style[sec] = [...((style[sec] as unknown[] | undefined) ?? []), messageField(p.message)];
  }
  const links = linkFields(t, vars);
  if (links.length) style.backFields = [...((style.backFields as unknown[] | undefined) ?? []), ...links];
  const json: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: s.passTypeId,
    teamIdentifier: s.teamId,
    serialNumber: p.serial,
    organizationName: t.organizationName,
    description: t.description || t.name,
    logoText: render(t.logoText, vars) || undefined,
    foregroundColor: hexToRgb(t.colors.foreground),
    backgroundColor: hexToRgb(t.colors.background),
    labelColor: hexToRgb(t.colors.label),
    barcodes: otp
      ? [{ format: BARCODE[t.barcode.format], message: otpBarcodeValue(p.serial, otp.appleCode), messageEncoding: 'iso-8859-1', altText: p.serial }]
      : t.barcode.message
        ? [
            {
              format: BARCODE[t.barcode.format],
              message: render(t.barcode.message, vars),
              messageEncoding: 'iso-8859-1',
              ...(t.barcode.altText ? { altText: render(t.barcode.altText, vars) } : {}),
            },
          ]
        : undefined,
    [t.kind === 'loyalty' ? 'storeCard' : 'generic']: style,
    voided: p.voided || undefined,
    sharingProhibited: t.security?.noSharing || undefined,
    suppressStripShine: t.security?.noStripShine || undefined,
  };
  if (t.background?.poster) {
    json.posterGeneric = posterStyle(style as Record<string, unknown[] | undefined>);
    const featured = t.actions?.featured ?? [];
    if (featured.length) {
      json.featuredActions = featured.map((f) => ({ action: f.action, url: render(f.url, vars), ...(f.label ? { label: f.label } : {}) }));
    }
  }
  const actions = t.actions;
  if (actions?.appStoreIds.length) {
    json.associatedStoreIdentifiers = actions.appStoreIds;
    if (actions.appLaunchURL) json.appLaunchURL = render(actions.appLaunchURL, vars);
  }
  const loc = t.locations;
  if (loc?.points.length) {
    json.locations = loc.points.map((l) => ({
      latitude: l.latitude,
      longitude: l.longitude,
      ...(l.altitude !== undefined ? { altitude: l.altitude } : {}),
      ...(l.relevantText ? { relevantText: render(l.relevantText, vars) } : {}),
    }));
    if (loc.maxDistance) json.maxDistance = loc.maxDistance;
  }
  if (loc?.beacons.length) {
    json.beacons = loc.beacons.map((b) => ({ ...b, ...(b.relevantText ? { relevantText: render(b.relevantText, vars) } : {}) }));
  }
  // Apple exige la clave pública de la terminal; sin ella el pase sale sin NFC.
  if (t.nfc?.enabled && t.nfc.encryptionPublicKey) {
    json.nfc = {
      message: truncateUtf8(render(t.nfc.message, vars), NFC_MAX_BYTES),
      encryptionPublicKey: t.nfc.encryptionPublicKey,
      ...(t.nfc.requiresAuthentication ? { requiresAuthentication: true } : {}),
    };
  }
  // Apple solo acepta HTTPS; en desarrollo local el pase se emite sin actualizaciones.
  if (origin.startsWith('https://')) {
    json.webServiceURL = `${origin}/`;
    json.authenticationToken = p.authToken;
  }
  return JSON.parse(JSON.stringify(json));
}

/**
 * Traducciones del pase por idioma. Wallet busca cada texto de pass.json (labels, valores,
 * organizationName, description, logoText, relevantText…) como clave en {idioma}.lproj/pass.strings.
 */
export function appleStrings(t: Template, p: Pass): Map<string, [string, string][]> {
  const vars = passVars(p);
  const main = t.localization?.language || DEFAULT_LANGUAGE;
  const out = new Map<string, [string, string][]>();
  const add = (lang: string, key: string, value: string) => {
    if (!key || !value.trim() || lang === main) return;
    const list = out.get(lang) ?? [];
    if (!list.some(([k]) => k === key)) list.push([key, value]);
    out.set(lang, list);
  };
  for (const lang of translationLanguages(t)) {
    for (const [src, dst] of Object.entries(t.localization!.translations[lang])) add(lang, render(src, vars), render(dst, vars));
  }
  for (const tr of p.message?.translations ?? []) {
    add(tr.language, p.message!.header, tr.header);
    add(tr.language, p.message!.body, tr.body);
  }
  // El idioma principal va con un .strings vacío para que iOS no elija una traducción como base.
  if (out.size) out.set(main, []);
  return out;
}

/** Firma PKCS#7 detached del manifest con el certificado del Pass Type ID y el WWDR. */
export function signManifest(manifest: Uint8Array, s: AppleSettings): Uint8Array {
  const cert = forge.pki.certificateFromPem(s.certPem);
  const wwdr = forge.pki.certificateFromPem(s.wwdrPem);
  const key = forge.pki.privateKeyFromPem(s.keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(forge.util.binary.raw.encode(manifest));
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      // forge acepta Date aunque el tipo diga string
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  return forge.util.binary.raw.decode(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

/** Arma el .pkpass completo (zip con pass.json, imágenes, manifest y firma). */
export async function buildPkpass(
  t: Template,
  p: Pass,
  s: AppleSettings,
  origin: string,
  images: Partial<Record<ImageSlot, Uint8Array>>,
  otp?: PassOtp,
): Promise<Uint8Array<ArrayBuffer>> {
  const files: Record<string, Uint8Array> = {
    'pass.json': new TextEncoder().encode(JSON.stringify(buildPassJson(t, p, s, origin, otp))),
  };
  const icon = images.icon ?? images.logo ?? PLACEHOLDER_ICON;
  files['icon.png'] = icon;
  files['icon@2x.png'] = icon;
  if (images.logo) {
    files['logo.png'] = images.logo;
    files['logo@2x.png'] = images.logo;
  }
  // Fondo del estilo poster. Apple lo llama «Background artwork»; el nombre de archivo no está
  // documentado, así que va como background.png (nombre clásico) y artwork.png.
  if (images.background && t.background?.poster) {
    for (const name of ['background', 'artwork']) {
      files[`${name}.png`] = images.background;
      files[`${name}@2x.png`] = images.background;
    }
  }
  if (images.strip && t.kind === 'loyalty') {
    files['strip.png'] = images.strip;
    files['strip@2x.png'] = images.strip;
  }
  for (const [lang, entries] of appleStrings(t, p)) files[`${lang}.lproj/pass.strings`] = passStrings(entries);
  const manifest: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(files)) manifest[name] = await sha1Hex(bytes);
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  files['manifest.json'] = manifestBytes;
  files['signature'] = signManifest(manifestBytes, s);
  return zipSync(files) as Uint8Array<ArrayBuffer>;
}
