import { unzipSync } from 'fflate';
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { certInfo, certToPem, parseP12 } from '../src/worker/lib/apple/certs';
import { buildPassJson, buildPkpass, hexToRgb, truncateUtf8 } from '../src/worker/lib/apple/pkpass';
import { sha1Hex } from '../src/worker/lib/crypto';
import type { Pass } from '../src/worker/types';
import { appleSettings, makeTemplate, selfSignedCert } from './helpers';

const pass: Pass = {
  serial: 'ABC123', templateId: 't1', authToken: 'a'.repeat(32), holderName: 'Ana Pérez',
  data: { stamps: '7' }, createdAt: '', updatedAt: '', voided: false, google: { synced: false },
};

describe('pass.json', () => {
  it('loyalty → storeCard con placeholders y web service', () => {
    const json = buildPassJson(makeTemplate(), pass, appleSettings(), 'https://passes.example.com');
    expect(json).toMatchObject({
      formatVersion: 1,
      passTypeIdentifier: 'pass.test',
      teamIdentifier: 'TEAM123',
      serialNumber: 'ABC123',
      backgroundColor: 'rgb(23, 23, 23)',
      webServiceURL: 'https://passes.example.com/',
      authenticationToken: 'a'.repeat(32),
      barcodes: [{ format: 'PKBarcodeFormatQR', message: 'ABC123' }],
      storeCard: {
        headerFields: [{ key: 'stamps', label: 'SELLOS', value: '7 / 10' }],
        secondaryFields: [{ key: 'member', value: 'Ana Pérez' }],
      },
    });
    expect(json).not.toHaveProperty('storeCard.primaryFields');
  });

  it('generic y sin web service en http', () => {
    const json = buildPassJson(makeTemplate({ kind: 'generic' }), pass, appleSettings(), 'http://localhost:8787');
    expect(json).toHaveProperty('generic');
    expect(json).not.toHaveProperty('webServiceURL');
  });

  it('hexToRgb admite forma corta', () => {
    expect(hexToRgb('#fff')).toBe('rgb(255, 255, 255)');
  });
});

describe('pkpass', () => {
  it('contiene manifest con SHA-1 correctos y firma detached', async () => {
    const zip = unzipSync(await buildPkpass(makeTemplate(), pass, appleSettings(), 'https://x.dev', {}));
    expect(Object.keys(zip).sort()).toEqual(['icon.png', 'icon@2x.png', 'manifest.json', 'pass.json', 'signature']);
    const manifest = JSON.parse(new TextDecoder().decode(zip['manifest.json']));
    for (const [name, hash] of Object.entries(manifest)) expect(await sha1Hex(zip[name])).toBe(hash);

    const p7 = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(forge.util.binary.raw.encode(zip['signature'])),
    ) as forge.pkcs7.PkcsSignedData & { rawCapture: { content?: unknown } };
    expect(p7.certificates).toHaveLength(2);
    expect(p7.rawCapture.content).toBeUndefined();
  });
});

describe('certs', () => {
  it('parsea .p12 y DER', () => {
    const c = selfSignedCert('Pass Type ID: pass.demo');
    const p12 = forge.pkcs12.toPkcs12Asn1(c.keys.privateKey, [c.cert], 'secret', { algorithm: '3des' });
    const der = forge.util.binary.raw.decode(forge.asn1.toDer(p12).getBytes());
    const out = parseP12(der, 'secret');
    expect(certInfo(out.certPem).subject).toBe('Pass Type ID: pass.demo');
    expect(() => parseP12(der, 'mal')).toThrow();

    const cerDer = forge.util.binary.raw.decode(forge.asn1.toDer(forge.pki.certificateToAsn1(c.cert)).getBytes());
    expect(certToPem(cerDer)).toContain('BEGIN CERTIFICATE');
    expect(certInfo(c.certPem).notAfter).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('NFC', () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(91).fill(7)));

  it('agrega el diccionario nfc con mensaje renderizado y recortado a 64 bytes', () => {
    const t = makeTemplate({ nfc: { enabled: true, message: 'ID:{{serial}}:{{long}}', encryptionPublicKey: key, requiresAuthentication: true } });
    const json = buildPassJson(t, { ...pass, data: { long: 'x'.repeat(100) } }, appleSettings(), 'https://x.dev');
    const nfc = json.nfc as { message: string; encryptionPublicKey: string; requiresAuthentication: boolean };
    expect(nfc.message.startsWith('ID:ABC123:')).toBe(true);
    expect(new TextEncoder().encode(nfc.message).length).toBe(64);
    expect(nfc).toMatchObject({ encryptionPublicKey: key, requiresAuthentication: true });
  });

  it('sin clave pública o deshabilitado no agrega nfc', () => {
    expect(buildPassJson(makeTemplate({ nfc: { enabled: true, message: 'x' } }), pass, appleSettings(), 'https://x.dev')).not.toHaveProperty('nfc');
    expect(buildPassJson(makeTemplate(), pass, appleSettings(), 'https://x.dev')).not.toHaveProperty('nfc');
  });

  it('truncateUtf8 no corta caracteres multibyte', () => {
    expect(truncateUtf8('ñññ', 5)).toBe('ññ');
  });
});
