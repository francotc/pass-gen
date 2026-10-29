import forge from 'node-forge';

const toBinary = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
};

const asText = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** Extrae certificado y clave privada de un .p12 exportado del llavero. */
export function parseP12(der: Uint8Array, password: string): { certPem: string; keyPem: string } {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(toBinary(der)), password);
  const cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]?.cert;
  const key =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]?.key;
  if (!cert || !key) throw new Error('El .p12 no contiene certificado y clave privada');
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(key) };
}

/** Acepta un certificado en PEM o DER (.cer) y lo devuelve en PEM. */
export function certToPem(bytes: Uint8Array): string {
  const text = asText(bytes);
  if (text.includes('-----BEGIN CERTIFICATE-----')) {
    forge.pki.certificateFromPem(text);
    return text.trim() + '\n';
  }
  return forge.pki.certificateToPem(forge.pki.certificateFromAsn1(forge.asn1.fromDer(toBinary(bytes))));
}

export function certInfo(pem: string): { subject: string; notAfter: string } {
  const cert = forge.pki.certificateFromPem(pem);
  const cn = cert.subject.getField('CN')?.value as string | undefined;
  return { subject: cn ?? cert.subject.attributes.map((a) => `${a.shortName}=${a.value}`).join(', '), notAfter: cert.validity.notAfter.toISOString() };
}

/** Lee el UID (Pass Type ID) y OU (Team ID) del certificado, si están. */
export function passIdsFromCert(pem: string): { passTypeId?: string; teamId?: string } {
  const cert = forge.pki.certificateFromPem(pem);
  return {
    passTypeId: cert.subject.getField({ type: '0.9.2342.19200300.100.1.1' })?.value as string | undefined,
    teamId: cert.subject.getField('OU')?.value as string | undefined,
  };
}
