import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pushUpdate } from '../src/worker/lib/apple/apns';
import { b64urlToBytes } from '../src/worker/lib/crypto';
import { Store } from '../src/worker/lib/store';
import { publishTemplate, syncPass } from '../src/worker/lib/sync';
import type { Pass } from '../src/worker/types';
import { appleSettings, generatePkcs8Pem, makeTemplate } from './helpers';

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

afterEach(() => vi.restoreAllMocks());

const makePass = (serial: string): Pass => ({
  serial, templateId: 't1', authToken: 'x', holderName: 'Ana', data: { stamps: '3' },
  createdAt: '', updatedAt: '2026-01-01T00:00:00.000Z', voided: false, google: { synced: false },
});

describe('APNs', () => {
  it('usa JWT ES256 con topic = passTypeId y marca tokens inválidos', async () => {
    const { pem } = await generatePkcs8Pem('ES256');
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ reason: 'Unregistered' }, { status: 410 }));
    const res = await pushUpdate({ ...appleSettings(), apnsKeyId: 'KID', apnsKeyPem: pem }, ['tok1', 'tok2']);
    expect(res).toMatchObject({ sent: 1, failed: 1, invalid: ['tok2'] });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('https://api.push.apple.com/3/device/tok1');
    const headers = init!.headers as Record<string, string>;
    expect(headers['apns-topic']).toBe('pass.test');
    const jwtHeader = JSON.parse(new TextDecoder().decode(b64urlToBytes(headers.authorization.split(' ')[1].split('.')[0])));
    expect(jwtHeader).toMatchObject({ alg: 'ES256', kid: 'KID' });
    expect(init!.body).toBe('{}');
  });

  it('prefiere el binding mTLS', async () => {
    const mtls = { fetch: vi.fn().mockResolvedValue(new Response(null, { status: 200 })) } as unknown as Fetcher;
    const res = await pushUpdate(appleSettings(), ['t'], { mtls });
    expect(res.sent).toBe(1);
    expect(mtls.fetch).toHaveBeenCalledOnce();
  });

  it('sin credenciales de push falla claro', async () => {
    await expect(pushUpdate(appleSettings(), ['t'])).rejects.toThrow('Falta configurar');
  });
});

describe('sync', () => {
  it('sincroniza Google, avisa a Apple y limpia registros inválidos', async () => {
    const store = new Store(env.PASSGEN, KEY);
    const { pem: p8 } = await generatePkcs8Pem('ES256');
    const { pem: sa } = await generatePkcs8Pem('RS256');
    await store.putAppleSettings({ ...appleSettings(), apnsKeyId: 'K', apnsKeyPem: p8 });
    await store.putGoogleSettings({ issuerId: '338', clientEmail: 'sa@x', privateKey: sa });
    await store.putTemplate(makeTemplate());
    await store.putPass(makePass('S1'));
    await store.register('dev1', 'pass.test', 'S1', 'good');
    await store.register('dev2', 'pass.test', 'S1', 'bad');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('oauth2')) return Response.json({ access_token: 'tok' });
      if (url.includes('walletobjects')) return init?.method ? Response.json({}) : new Response('', { status: 404 });
      if (url.endsWith('/bad')) return Response.json({ reason: 'BadDeviceToken' }, { status: 400 });
      return new Response(null, { status: 200 });
    });

    const ctx = { env, store, origin: 'https://passes.example.com' };
    const res = await syncPass(ctx, 'S1');
    expect(res.google).toEqual({ ok: true });
    expect(res.apple).toMatchObject({ sent: 1, failed: 1 });
    expect((await store.getPass('S1'))!.google).toEqual({ objectId: '338.S1', synced: true });
    expect(await store.devicesForPass('pass.test', 'S1')).toEqual([{ deviceId: 'dev1', pushToken: 'good' }]);

    const pub = await publishTemplate(ctx, 't1');
    expect(pub.passes).toBe(1);
    expect((await store.getPass('S1'))!.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('sin settings informa skipped', async () => {
    const store = new Store(env.PASSGEN, KEY);
    await env.PASSGEN.delete('settings:apple');
    await env.PASSGEN.delete('settings:google');
    await store.putTemplate(makeTemplate());
    await store.putPass(makePass('S2'));
    const res = await syncPass({ env, store, origin: 'https://x' }, 'S2');
    expect(res).toMatchObject({ apple: { skipped: 'Apple no configurado' }, google: { skipped: 'Google no configurado' } });
  });
});
