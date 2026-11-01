import { b64ToBytes } from '../crypto';

/**
 * Verificación de los callbacks de Google Wallet (protocolo ECv2SigningOnly, el mismo que
 * PaymentMethodTokenRecipient de Tink): la clave raíz de Google firma una clave intermedia,
 * y la intermedia firma el mensaje. Sender "GooglePayPasses", recipient = issuer ID.
 */
export const GOOGLE_KEYS_URL = 'https://pay.google.com/gp/m/issuer/keys';
const SENDER_ID = 'GooglePayPasses';
const PROTOCOL = 'ECv2SigningOnly';

export interface CallbackMessage {
  classId: string;
  objectId: string;
  eventType: 'save' | 'del';
  expTimeMillis: number;
  nonce: string;
}

interface SealedMessage {
  protocolVersion?: string;
  signature?: string;
  signedMessage?: string;
  intermediateSigningKey?: { signedKey?: string; signatures?: string[] };
}

interface RootKey {
  keyValue: string;
  protocolVersion: string;
  keyExpiration?: string;
}

const enc = new TextEncoder();

/** Concatenación con prefijo de largo de 4 bytes little-endian (formato de Tink). */
export function lengthPrefixed(...parts: string[]): Uint8Array {
  const chunks = parts.map((p) => enc.encode(p));
  const out = new Uint8Array(chunks.reduce((n, c) => n + 4 + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    new DataView(out.buffer).setUint32(o, c.length, true);
    out.set(c, o + 4);
    o += 4 + c.length;
  }
  return out;
}

/** Firma ECDSA DER → formato IEEE P1363 (r || s) que espera WebCrypto. */
export function derToP1363(der: Uint8Array, size = 32): Uint8Array {
  if (der[0] !== 0x30) throw new Error('Invalid DER signature');
  let i = 2;
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f);
  const read = () => {
    if (der[i] !== 0x02) throw new Error('Invalid DER signature');
    const len = der[i + 1];
    let v = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > size && v[0] === 0) v = v.slice(1);
    if (v.length > size) throw new Error('Invalid DER signature');
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  const r = read();
  const s = read();
  const sig = new Uint8Array(size * 2);
  sig.set(r);
  sig.set(s, size);
  return sig;
}

const importKey = (spkiB64: string) =>
  crypto.subtle.importKey('spki', b64ToBytes(spkiB64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);

async function verify(key: CryptoKey, signatureB64: string, data: Uint8Array): Promise<boolean> {
  try {
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToP1363(b64ToBytes(signatureB64)), data);
  } catch {
    return false;
  }
}

let cache: { keys: RootKey[]; at: number } | undefined;

/** Claves raíz de Google, cacheadas en memoria 1 h. */
export async function googleRootKeys(fetcher: typeof fetch = fetch): Promise<RootKey[]> {
  if (cache && Date.now() - cache.at < 3600_000) return cache.keys;
  const res = await fetcher(GOOGLE_KEYS_URL);
  if (!res.ok) throw new Error(`Could not fetch Google keys (${res.status})`);
  const keys = ((await res.json()) as { keys?: RootKey[] }).keys ?? [];
  cache = { keys, at: Date.now() };
  return keys;
}

export function resetGoogleKeysCache() {
  cache = undefined;
}

/** Verifica el mensaje sellado y devuelve su contenido; lanza si la firma o la vigencia no son válidas. */
export async function unsealGoogleCallback(body: string, issuerId: string, rootKeys: RootKey[], now = Date.now()): Promise<CallbackMessage> {
  const sealed = JSON.parse(body) as SealedMessage;
  if (sealed.protocolVersion !== PROTOCOL) throw new Error('Unsupported protocol');
  const signedKey = sealed.intermediateSigningKey?.signedKey;
  const keySignatures = sealed.intermediateSigningKey?.signatures ?? [];
  if (!signedKey || !keySignatures.length || !sealed.signature || !sealed.signedMessage) throw new Error('Malformed message');

  const roots = rootKeys.filter((k) => k.protocolVersion === PROTOCOL && (!k.keyExpiration || Number(k.keyExpiration) > now));
  const keyData = lengthPrefixed(SENDER_ID, PROTOCOL, signedKey);
  let trusted = false;
  for (const root of roots) {
    const key = await importKey(root.keyValue);
    for (const sig of keySignatures) if (await verify(key, sig, keyData)) trusted = true;
    if (trusted) break;
  }
  if (!trusted) throw new Error('Intermediate key is not signed by Google');

  const intermediate = JSON.parse(signedKey) as { keyValue: string; keyExpiration: string };
  if (Number(intermediate.keyExpiration) <= now) throw new Error('Intermediate key expired');
  const messageData = lengthPrefixed(SENDER_ID, issuerId, PROTOCOL, sealed.signedMessage);
  if (!(await verify(await importKey(intermediate.keyValue), sealed.signature, messageData))) throw new Error('Invalid message signature');

  const msg = JSON.parse(sealed.signedMessage) as CallbackMessage;
  if (Number(msg.expTimeMillis) <= now) throw new Error('Message expired');
  if (msg.eventType !== 'save' && msg.eventType !== 'del') throw new Error('Unknown event type');
  return msg;
}
