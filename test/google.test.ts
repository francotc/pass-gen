import { afterEach, describe, expect, it, vi } from 'vitest';
import { b64urlToBytes } from '../src/worker/lib/crypto';
import { buildClass, buildObject, getAccessToken, saveLink, upsert } from '../src/worker/lib/google/wallet';
import type { Pass } from '../src/worker/types';
import { generatePkcs8Pem, makeTemplate } from './helpers';

const pass: Pass = {
  serial: 'S1', templateId: 't1', authToken: 'x', holderName: 'Ana', data: { stamps: '7' },
  createdAt: '', updatedAt: '', voided: false, google: { synced: false },
};

const decode = (jwt: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(jwt.split('.')[1])));

afterEach(() => vi.restoreAllMocks());

describe('mapeo', () => {
  it('loyalty: puntos, módulos y barcode', () => {
    const obj = buildObject(makeTemplate(), pass, '338', { hero: 'https://x/h.png' });
    expect(obj).toMatchObject({
      id: '338.S1',
      classId: '338.t1',
      state: 'ACTIVE',
      accountName: 'Ana',
      loyaltyPoints: { label: 'SELLOS', balance: { string: '7 / 10' } },
      barcode: { type: 'QR_CODE', value: 'S1' },
      heroImage: { sourceUri: { uri: 'https://x/h.png' } },
      textModulesData: [
        { id: 'member', header: 'MIEMBRO', body: 'Ana' },
        { id: 'terms', header: 'Términos', body: 'Válido en local' },
      ],
    });
  });

  it('generic: cardTitle y header', () => {
    const obj = buildObject(makeTemplate({ kind: 'generic' }), { ...pass, voided: true }, '338', {});
    expect(obj).toMatchObject({ cardTitle: { defaultValue: { value: 'Café Central' } }, header: { defaultValue: { value: '7 / 10' } }, state: 'INACTIVE' });
    expect(buildClass(makeTemplate({ kind: 'generic' }), '338', {})).toEqual({ id: '338.t1' });
  });

  it('loyalty class', () => {
    expect(buildClass(makeTemplate(), '338', { logo: 'https://x/l.png' })).toMatchObject({
      id: '338.t1', programName: 'Sellos', issuerName: 'Café Central', programLogo: { sourceUri: { uri: 'https://x/l.png' } },
    });
  });
});

describe('API', () => {
  it('obtiene token OAuth con JWT bearer', async () => {
    const { pem } = await generatePkcs8Pem('RS256');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ access_token: 'tok' }));
    expect(await getAccessToken({ issuerId: '1', clientEmail: 'sa@x.iam', privateKey: pem })).toBe('tok');
    const body = new URLSearchParams(String(spy.mock.calls[0][1]!.body));
    expect(decode(body.get('assertion')!)).toMatchObject({ iss: 'sa@x.iam', aud: 'https://oauth2.googleapis.com/token' });
  });

  it('upsert: POST si no existe, PUT si existe', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({}));
    await upsert('t', 'loyaltyObject', { id: '1.a' });
    await upsert('t', 'loyaltyObject', { id: '1.a' });
    expect(spy.mock.calls.map((c) => [c[1]?.method ?? 'GET', String(c[0]).split('/v1/')[1]])).toEqual([
      ['GET', 'loyaltyObject/1.a'], ['POST', 'loyaltyObject'], ['GET', 'loyaltyObject/1.a'], ['PUT', 'loyaltyObject/1.a'],
    ]);
  });

  it('upsert propaga errores', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { message: 'bad' } }, { status: 403 }));
    await expect(upsert('t', 'loyaltyClass', { id: '1.a' })).rejects.toThrow('Google Wallet 403: bad');
  });

  it('save link', async () => {
    const { pem } = await generatePkcs8Pem('RS256');
    const link = await saveLink({ issuerId: '1', clientEmail: 'sa@x', privateKey: pem }, 'loyalty', '1.S1', ['https://a.dev']);
    expect(link).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);
    expect(decode(link.split('/save/')[1])).toMatchObject({ aud: 'google', typ: 'savetowallet', payload: { loyaltyObjects: [{ id: '1.S1' }] } });
  });
});
