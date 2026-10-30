import { zipSync } from 'fflate';
import forge from 'node-forge';
import { NFC_MAX_BYTES, type AppleSettings, type BarcodeFormat, type Field, type FieldSection, type ImageSlot, type Pass, type PassMessage, type Template } from '../../types';
import { b64ToBytes, sha1Hex } from '../crypto';
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

export function buildPassJson(t: Template, p: Pass, s: AppleSettings, origin: string): Record<string, unknown> {
  const vars = passVars(p);
  const style: Record<string, unknown> = {};
  for (const sec of SECTIONS) {
    if (t[sec].length) style[sec] = renderFields(t[sec], vars);
  }
  if (p.message) {
    const sec = p.message.placement;
    style[sec] = [...((style[sec] as unknown[] | undefined) ?? []), messageField(p.message)];
  }
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
    barcodes: t.barcode.message
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
  };
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
): Promise<Uint8Array<ArrayBuffer>> {
  const files: Record<string, Uint8Array> = {
    'pass.json': new TextEncoder().encode(JSON.stringify(buildPassJson(t, p, s, origin))),
  };
  const icon = images.icon ?? images.logo ?? PLACEHOLDER_ICON;
  files['icon.png'] = icon;
  files['icon@2x.png'] = icon;
  if (images.logo) {
    files['logo.png'] = images.logo;
    files['logo@2x.png'] = images.logo;
  }
  if (images.strip && t.kind === 'loyalty') {
    files['strip.png'] = images.strip;
    files['strip@2x.png'] = images.strip;
  }
  const manifest: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(files)) manifest[name] = await sha1Hex(bytes);
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  files['manifest.json'] = manifestBytes;
  files['signature'] = signManifest(manifestBytes, s);
  return zipSync(files) as Uint8Array<ArrayBuffer>;
}
