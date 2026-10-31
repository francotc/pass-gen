import forge from 'node-forge';
import { bytesToB64 } from '../src/worker/lib/crypto';
import type { AppleSettings, Template } from '../src/worker/types';

export async function generatePkcs8Pem(alg: 'RS256' | 'ES256') {
  const pair = (await crypto.subtle.generateKey(
    alg === 'RS256'
      ? { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  const pem = `-----BEGIN PRIVATE KEY-----\n${bytesToB64(der).match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
  return { pem, publicKey: pair.publicKey };
}

/** Certificado autofirmado de prueba (hace de Pass Type ID y de WWDR). */
export function selfSignedCert(cn = 'Pass Type ID: pass.test') {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01');
  cert.validity.notAfter = new Date('2027-01-01');
  const attrs = [{ name: 'commonName', value: cn }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    cert,
    keys,
  };
}

export function appleSettings(): AppleSettings {
  const c = selfSignedCert();
  return { teamId: 'TEAM123', passTypeId: 'pass.test', certPem: c.certPem, keyPem: c.keyPem, wwdrPem: c.certPem };
}

export function makeTemplate(over: Partial<Template> = {}): Template {
  return {
    id: 't1',
    name: 'Café',
    kind: 'loyalty',
    organizationName: 'Café Central',
    description: 'Tarjeta de sellos',
    logoText: 'Café Central',
    colors: { background: '#171717', foreground: '#ffffff', label: '#a3a3a3' },
    images: {},
    barcode: { format: 'QR', message: '{{serial}}', altText: '{{serial}}' },
    headerFields: [{ key: 'stamps', label: 'SELLOS', value: '{{stamps}} / 10' }],
    primaryFields: [],
    secondaryFields: [{ key: 'member', label: 'MIEMBRO', value: '{{holderName}}' }],
    auxiliaryFields: [],
    backFields: [{ key: 'terms', label: 'Términos', value: 'Válido en local' }],
    google: { programName: 'Sellos' },
    nfc: { enabled: false, message: '' },
    locations: { points: [], beacons: [] },
    actions: { links: [], modules: [], featured: [], appStoreIds: [] },
    background: { poster: false },
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
    ...over,
  };
}
