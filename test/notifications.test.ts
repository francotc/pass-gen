import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPassJson } from '../src/worker/lib/apple/pkpass';
import { upsert } from '../src/worker/lib/google/wallet';
import { Store } from '../src/worker/lib/store';
import { parseNotificationInput } from '../src/worker/lib/validate';
import type { NotificationRecord, Pass } from '../src/worker/types';
import { appleSettings, generatePkcs8Pem, makeTemplate } from './helpers';

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const BASE = 'https://passes.example.com';
const store = () => new Store(env.PASSGEN, KEY);
const post = (path: string, body: unknown) =>
  exports.default.fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const makePass = (serial: string, synced = true): Pass => ({
  serial, templateId: 't1', authToken: 'tok', holderName: 'Ana', data: { stamps: '3' },
  createdAt: '', updatedAt: '2026-01-01T00:00:00.000Z', voided: false,
  google: synced ? { objectId: `338.${serial}`, synced: true } : { synced: false },
});

const base = {
  target: { type: 'pass', serial: 'S1' },
  header: 'Hi {{holderName}}',
  body: 'You have {{stamps}} stamps',
  apple: { enabled: true },
  google: { enabled: true },
};

beforeEach(async () => {
  const keys = await env.PASSGEN.list();
  await Promise.all(keys.keys.map((k) => env.PASSGEN.delete(k.name)));
});
afterEach(() => vi.restoreAllMocks());

describe('validación', () => {
  it('aplica valores por defecto', () => {
    expect(parseNotificationInput(base)).toMatchObject({
      apple: { enabled: true, placement: 'backFields', changeMessage: '%@' },
      google: { enabled: true, notify: true, scope: 'object' },
      translations: [],
    });
  });

  it.each([
    [{ ...base, apple: { enabled: false }, google: { enabled: false } }, 'Enable Apple, Google or both'],
    [{ ...base, apple: { enabled: true, changeMessage: 'sin marcador' } }, 'must include %@'],
    [{ ...base, google: { enabled: true, scope: 'class' } }, 'require a template target'],
    [{ ...base, target: { type: 'template', templateId: 't1' }, google: { enabled: true, scope: 'class' } }, 'cannot use placeholders'],
    [{ ...base, link: 'javascript:alert(1)' }, 'http(s) URL'],
    [{ ...base, translations: [{ language: 'no válido', header: 'a', body: 'b' }] }, 'invalid language tag'],
    [{ ...base, google: { enabled: true, displayStart: '2026-02-01', displayEnd: '2026-01-01' } }, 'after start'],
  ])('rechaza entradas inválidas %#', (input, msg) => {
    expect(() => parseNotificationInput(input)).toThrow(msg);
  });
});

describe('Apple', () => {
  it('agrega el campo de mensaje con changeMessage y link en el reverso', () => {
    const pass: Pass = {
      ...makePass('S1'),
      message: { notificationId: 'n', header: 'News', body: 'Double <stamps>', link: 'https://x.dev/a?b=1&c=2', placement: 'backFields', changeMessage: 'News: %@', sentAt: '' },
    };
    const json = buildPassJson(makeTemplate(), pass, appleSettings(), BASE) as { storeCard: { backFields: Record<string, string>[] } };
    expect(json.storeCard.backFields.at(-1)).toEqual({
      key: 'pg.message',
      label: 'News',
      value: 'Double <stamps>',
      changeMessage: 'News: %@',
      attributedValue: 'Double &lt;stamps&gt; <a href="https://x.dev/a?b=1&amp;c=2">https://x.dev/a?b=1&amp;c=2</a>',
    });
  });
});

describe('envío', () => {
  async function setup() {
    const s = store();
    const { pem: p8 } = await generatePkcs8Pem('ES256');
    const { pem: sa } = await generatePkcs8Pem('RS256');
    await s.putAppleSettings({ ...appleSettings(), apnsKeyId: 'K', apnsKeyPem: p8 });
    await s.putGoogleSettings({ issuerId: '338', clientEmail: 'sa@x', privateKey: sa });
    await s.putTemplate(makeTemplate());
    await s.putPass(makePass('S1'));
    await s.putPass(makePass('S2', false));
    await s.putPass({ ...makePass('S3'), voided: true });
    await s.register('dev1', 'pass.test', 'S1', 'push1');
    return s;
  }

  function mockFetch() {
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body && typeof init.body === 'string' && init.body !== '{}' ? JSON.parse(init.body) : init?.body });
      if (url.includes('oauth2')) return Response.json({ access_token: 'tok' });
      if (url.includes('/S2/addMessage') || url.endsWith('338.S2/addMessage')) return Response.json({ error: { message: 'x' } }, { status: 500 });
      if (url.includes('walletobjects')) return method === 'GET' ? new Response('', { status: 404 }) : Response.json({});
      return new Response(null, { status: 200 });
    });
    return calls;
  }

  it('a un pase: actualiza Apple, hace push y agrega el mensaje en Google', async () => {
    const s = await setup();
    const calls = mockFetch();
    const res = await post('/api/notifications', {
      ...base,
      link: 'https://x.dev',
      translations: [{ language: 'es', header: 'Hola {{holderName}}', body: 'Tenés {{stamps}} sellos' }],
      apple: { enabled: true, changeMessage: '{{header}}: %@' },
      google: { enabled: true, displayStart: '2026-11-01T10:00:00Z', displayEnd: '2026-11-08T10:00:00Z' },
    });
    expect(res.status).toBe(201);
    const rec = (await res.json()) as NotificationRecord;
    expect(rec.result).toEqual({ passes: 1, apple: { updated: 1, sent: 1, failed: 0 }, google: { sent: 1, failed: 0, errors: [] } });

    const pass = (await s.getPass('S1'))!;
    expect(pass.message).toMatchObject({ header: 'Hi Ana', body: 'You have 3 stamps', changeMessage: 'Hi Ana: %@', placement: 'backFields' });
    expect(pass.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');

    expect(calls.some((c) => c.url === 'https://api.push.apple.com/3/device/push1')).toBe(true);
    const add = calls.find((c) => c.url.endsWith('/loyaltyObject/338.S1/addMessage'))!;
    expect(add.body).toEqual({
      message: {
        id: rec.id,
        header: 'Hi Ana',
        body: 'You have 3 stamps\nhttps://x.dev',
        messageType: 'TEXT_AND_NOTIFY',
        localizedHeader: { defaultValue: { language: 'en', value: 'Hi Ana' }, translatedValues: [{ language: 'es', value: 'Hola Ana' }] },
        localizedBody: {
          defaultValue: { language: 'en', value: 'You have 3 stamps\nhttps://x.dev' },
          translatedValues: [{ language: 'es', value: 'Tenés 3 sellos\nhttps://x.dev' }],
        },
        displayInterval: { start: { date: '2026-11-01T10:00:00.000Z' }, end: { date: '2026-11-08T10:00:00.000Z' } },
      },
    });

    const list = await (await exports.default.fetch(BASE + '/api/notifications')).json();
    expect(list).toEqual([expect.objectContaining({ id: rec.id, header: 'Hi {{holderName}}', passes: 1, failed: 0 })]);
  });

  it('a una plantilla: omite anulados y reporta pases sin sincronizar', async () => {
    await setup();
    mockFetch();
    const rec = (await (
      await post('/api/notifications', { ...base, target: { type: 'template', templateId: 't1' }, apple: { enabled: false }, google: { enabled: true, notify: false } })
    ).json()) as NotificationRecord;
    expect(rec.result.passes).toBe(2);
    expect(rec.result.google).toEqual({ sent: 1, failed: 1, errors: ['S2: not synced with Google'] });
  });

  it('a la class de Google: un solo mensaje para todos', async () => {
    await setup();
    const calls = mockFetch();
    const rec = (await (
      await post('/api/notifications', {
        ...base,
        header: 'Closed today',
        body: 'See you tomorrow',
        target: { type: 'template', templateId: 't1' },
        apple: { enabled: false },
        google: { enabled: true, scope: 'class', notify: false },
      })
    ).json()) as NotificationRecord;
    expect(rec.result.google).toEqual({ sent: 1, failed: 0, errors: [] });
    const add = calls.find((c) => c.url.endsWith('/loyaltyClass/338.t1/addMessage'))!;
    expect(add.body).toMatchObject({ message: { header: 'Closed today', messageType: 'TEXT' } });
  });
});

describe('Google', () => {
  it('upsert conserva los mensajes existentes al hacer PUT', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ id: '1.a', messages: [{ id: 'm1' }] }))
      .mockResolvedValueOnce(Response.json({}));
    await upsert('t', 'loyaltyObject', { id: '1.a', state: 'ACTIVE' });
    expect(JSON.parse(String(spy.mock.calls[1][1]!.body))).toEqual({ id: '1.a', state: 'ACTIVE', messages: [{ id: 'm1' }] });
  });

  it('notify en la edición pide notificación de cambio de campo', async () => {
    const s = store();
    const { pem: sa } = await generatePkcs8Pem('RS256');
    await s.putGoogleSettings({ issuerId: '338', clientEmail: 'sa@x', privateKey: sa });
    await s.putTemplate(makeTemplate());
    await s.putPass(makePass('S1'));
    const calls = mockFetchSimple();
    await exports.default.fetch(BASE + '/api/passes/S1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { stamps: '4' }, notify: true }),
    });
    const obj = calls.find((c) => c.method === 'POST' && c.url.endsWith('/loyaltyObject'))!;
    expect(obj.body).toMatchObject({ notifyPreference: 'NOTIFY_ON_UPDATE', loyaltyPoints: { balance: { string: '4 / 10' } } });
  });
});

function mockFetchSimple() {
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: typeof init?.body === 'string' ? JSON.parse(init.body || '{}') : {} });
    if (url.includes('oauth2')) return Response.json({ access_token: 'tok' });
    return method === 'GET' ? new Response('', { status: 404 }) : Response.json({});
  });
  return calls;
}
