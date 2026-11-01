import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToB64 } from '../src/worker/lib/crypto';
import { derToP1363, lengthPrefixed, resetGoogleKeysCache, unsealGoogleCallback } from '../src/worker/lib/google/callback';
import { buildClass } from '../src/worker/lib/google/wallet';
import type { Pass, Template } from '../src/worker/types';
import { generatePkcs8Pem, makeTemplate } from './helpers';

const BASE = 'https://passes.example.com';
const call = (path: string, init?: RequestInit) => exports.default.fetch(BASE + path, init);
const json = (path: string, method: string, body: unknown) =>
  call(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const { id: _id, createdAt: _c, updatedAt: _u, ...templateInput } = makeTemplate();

/** r || s → DER, como firma Google. */
function p1363ToDer(sig: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.slice(i);
    if (v[0] & 0x80) v = new Uint8Array([0, ...v]);
    return [0x02, v.length, ...v];
  };
  const body = [...int(sig.slice(0, 32)), ...int(sig.slice(32))];
  return new Uint8Array([0x30, body.length, ...body]);
}

const gen = () => crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
const spki = async (k: CryptoKey) => bytesToB64(new Uint8Array((await crypto.subtle.exportKey('spki', k)) as ArrayBuffer));
const sign = async (k: CryptoKey, data: Uint8Array) =>
  bytesToB64(p1363ToDer(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, data))));

async function sealed(issuerId: string, message: object, opts: { tamper?: boolean; keyExp?: number } = {}) {
  const root = await gen();
  const inter = await gen();
  const signedKey = JSON.stringify({ keyValue: await spki(inter.publicKey), keyExpiration: String(opts.keyExp ?? Date.now() + 3600_000) });
  const signedMessage = JSON.stringify(message);
  const body = {
    protocolVersion: 'ECv2SigningOnly',
    intermediateSigningKey: { signedKey, signatures: [await sign(root.privateKey, lengthPrefixed('GooglePayPasses', 'ECv2SigningOnly', signedKey))] },
    signedMessage: opts.tamper ? signedMessage.replace('save', 'del') : signedMessage,
    signature: await sign(inter.privateKey, lengthPrefixed('GooglePayPasses', issuerId, 'ECv2SigningOnly', signedMessage)),
  };
  return { body: JSON.stringify(body), keys: [{ keyValue: await spki(root.publicKey), protocolVersion: 'ECv2SigningOnly' }] };
}

const msg = (objectId: string, eventType: 'save' | 'del', nonce = crypto.randomUUID()) => ({
  classId: '338.tpl',
  objectId,
  eventType,
  expTimeMillis: Date.now() + 60_000,
  count: 1,
  nonce,
});

describe('verificación del callback de Google', () => {
  it('convierte DER a P1363', () => {
    const sig = new Uint8Array(64).fill(1);
    sig[0] = 0x80; // fuerza el byte 0x00 de signo
    expect(derToP1363(p1363ToDer(sig))).toEqual(sig);
  });

  it('acepta un mensaje firmado y rechaza alteraciones, otro issuer o claves vencidas', async () => {
    const m = msg('338.A1', 'save');
    const ok = await sealed('338', m);
    expect(await unsealGoogleCallback(ok.body, '338', ok.keys)).toMatchObject({ objectId: '338.A1', eventType: 'save' });
    await expect(unsealGoogleCallback(ok.body, '999', ok.keys)).rejects.toThrow('Invalid message signature');
    const other = await sealed('338', m);
    await expect(unsealGoogleCallback(ok.body, '338', other.keys)).rejects.toThrow('not signed by Google');
    const t = await sealed('338', m, { tamper: true });
    await expect(unsealGoogleCallback(t.body, '338', t.keys)).rejects.toThrow('Invalid message signature');
    const exp = await sealed('338', m, { keyExp: Date.now() - 1 });
    await expect(unsealGoogleCallback(exp.body, '338', exp.keys)).rejects.toThrow('expired');
  });

  it('la clase declara la URL de callback', () => {
    const cls = buildClass(makeTemplate(), '338', {}, 'https://x/public/google/callback');
    expect(cls.callbackOptions).toEqual({ url: 'https://x/public/google/callback' });
    expect(buildClass(makeTemplate(), '338', {}).callbackOptions).toBeUndefined();
  });
});

describe('estadísticas de instalación', () => {
  beforeEach(async () => {
    const keys = await env.PASSGEN.list();
    await Promise.all(keys.keys.map((k) => env.PASSGEN.delete(k.name)));
    resetGoogleKeysCache();
  });
  afterEach(() => vi.restoreAllMocks());

  it('cuenta guardados y eliminaciones de Google, sin duplicar nonces', async () => {
    const { pem } = await generatePkcs8Pem('RS256');
    await json('/api/settings/google', 'PUT', { issuerId: '338', serviceAccount: { client_email: 'sa@x', private_key: pem } });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('oauth2')) return Response.json({ access_token: 'tok' });
      return init?.method ? Response.json({}) : new Response('', { status: 404 });
    });
    const tpl = (await (await json('/api/templates', 'POST', templateInput)).json()) as Template;
    const pass = ((await (await json('/api/passes', 'POST', { templateId: tpl.id, holderName: 'Ana', data: {} })).json()) as { pass: Pass }).pass;
    const updatedAt = (await env.PASSGEN.get<Pass>(`pass:${pass.serial}`, 'json'))!.updatedAt;

    const save = await sealed('338', msg(`338.${pass.serial}`, 'save', 'n1'));
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes('issuer/keys') ? Response.json({ keys: save.keys }) : new Response('', { status: 404 }),
    );
    const post = (body: string) => call('/public/google/callback', { method: 'POST', body });
    expect((await post(save.body)).status).toBe(200);
    expect((await post(save.body)).status).toBe(200); // reintento: mismo nonce
    expect((await post('{"protocolVersion":"ECv2SigningOnly"}')).status).toBe(400);

    let stored = (await env.PASSGEN.get<Pass>(`pass:${pass.serial}`, 'json'))!;
    expect(stored.installs).toMatchObject({ googleSaved: true, googleSaves: 1, googleDeletes: 0 });
    expect(stored.updatedAt).toBe(updatedAt);
    expect(await (await call('/api/stats')).json()).toEqual({ passes: 1, active: 1, installed: 1, apple: { passes: 0, devices: 0 }, google: { passes: 1 } });

    resetGoogleKeysCache();
    const del = await sealed('338', msg(`338.${pass.serial}`, 'del', 'n2'));
    vi.mocked(fetch).mockImplementation(async () => Response.json({ keys: del.keys }));
    expect((await post(del.body)).status).toBe(200);
    stored = (await env.PASSGEN.get<Pass>(`pass:${pass.serial}`, 'json'))!;
    expect(stored.installs).toMatchObject({ googleSaved: false, googleSaves: 1, googleDeletes: 1 });
    expect(stored.installs!.events.map((e) => e.type)).toEqual(['removed', 'added']);
  });
});
