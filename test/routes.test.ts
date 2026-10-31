import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { unzipSync } from 'fflate';
import forge from 'node-forge';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Pass, Template } from '../src/worker/types';
import { generatePkcs8Pem, makeTemplate, selfSignedCert } from './helpers';

const BASE = 'https://passes.example.com';
const call = (path: string, init?: RequestInit) => exports.default.fetch(BASE + path, init);
const json = (path: string, method: string, body: unknown) =>
  call(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const { id: _id, createdAt: _c, updatedAt: _u, ...templateInput } = makeTemplate();

async function setupApple() {
  const c = selfSignedCert();
  const p12 = forge.pkcs12.toPkcs12Asn1(c.keys.privateKey, [c.cert], 'pw', { algorithm: '3des' });
  const der = forge.util.binary.raw.decode(forge.asn1.toDer(p12).getBytes());
  const form = new FormData();
  form.set('p12', new File([der], 'cert.p12'));
  form.set('p12Password', 'pw');
  form.set('wwdr', new File([c.certPem], 'wwdr.pem'));
  form.set('teamId', 'TEAM123');
  form.set('passTypeId', 'pass.test');
  return call('/api/settings/apple', { method: 'PUT', body: form });
}

async function issue(): Promise<{ tpl: Template; pass: Pass }> {
  const tpl = (await (await json('/api/templates', 'POST', templateInput)).json()) as Template;
  const res = await json('/api/passes', 'POST', { templateId: tpl.id, holderName: 'Ana', data: { stamps: 2 } });
  expect(res.status).toBe(201);
  return { tpl, pass: ((await res.json()) as { pass: Pass }).pass };
}

beforeEach(async () => {
  const keys = await env.PASSGEN.list();
  await Promise.all(keys.keys.map((k) => env.PASSGEN.delete(k.name)));
});

describe('settings', () => {
  it('guarda Apple desde .p12 sin exponer claves', async () => {
    expect((await setupApple()).status).toBe(200);
    const status = await (await call('/api/settings')).json();
    expect(status).toMatchObject({ apple: { teamId: 'TEAM123', passTypeId: 'pass.test', apns: false }, google: null });
    expect(JSON.stringify(status)).not.toContain('PRIVATE');
  });

  it('credenciales ilegibles (otra ENCRYPTION_KEY) se tratan como no configuradas', async () => {
    await env.PASSGEN.put('settings:apple', 'AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA');
    expect(await (await call('/api/settings')).json()).toMatchObject({ apple: null });
    expect((await setupApple()).status).toBe(200);
  });

  it('valida Google', async () => {
    expect((await json('/api/settings/google', 'PUT', { issuerId: 'x', serviceAccount: {} })).status).toBe(400);
    const { pem } = await generatePkcs8Pem('RS256');
    const ok = await json('/api/settings/google', 'PUT', { issuerId: '338', serviceAccount: JSON.stringify({ client_email: 'sa@x', private_key: pem }) });
    expect(ok.status).toBe(200);
  });
});

describe('plantillas y pases', () => {
  it('valida y hace CRUD', async () => {
    expect((await json('/api/templates', 'POST', { ...templateInput, colors: { background: 'rojo' } })).status).toBe(400);
    const { tpl, pass } = await issue();
    expect(pass).toMatchObject({ holderName: 'Ana', data: { stamps: '2' }, templateId: tpl.id });
    expect(await (await call('/api/templates')).json()).toHaveLength(1);
    expect((await call(`/api/templates/${tpl.id}`, { method: 'DELETE' })).status).toBe(409);

    const upd = await json(`/api/passes/${pass.serial}`, 'PUT', { data: { stamps: '3' } });
    const body = (await upd.json()) as { pass: Pass; sync: unknown };
    expect(body.pass.data.stamps).toBe('3');
    expect(body.pass.updatedAt > pass.updatedAt || body.pass.updatedAt === pass.updatedAt).toBe(true);
    expect(body.sync).toMatchObject({ apple: { skipped: 'Apple not configured' } });
  });

  it('valida ubicaciones', async () => {
    const post = (locations: unknown) => json('/api/templates', 'POST', { ...templateInput, locations });
    const err = async (res: Response) => ((await res.json()) as { error: string }).error;
    expect(await err(await post({ points: [{ latitude: 91, longitude: 0 }] }))).toBe('Location 1: latitude must be between -90 and 90');
    expect(await err(await post({ points: Array.from({ length: 11 }, () => ({ latitude: 0, longitude: 0 })) }))).toBe('Up to 10 locations are allowed');
    expect(await err(await post({ beacons: [{ proximityUUID: 'nope' }] }))).toBe('Beacon 1: proximity UUID must be a UUID');
    expect(await err(await post({ beacons: [{ proximityUUID: 'e2c56db5-dffb-48d2-b060-d0f5a71096e0', major: 1.5 }] }))).toBe('Beacon 1: major must be an integer');
    const ok = await post({ points: [{ latitude: '47.5', longitude: '7.5', name: ' Shop ' }], maxDistance: 200, beacons: [{ proximityUUID: 'e2c56db5-dffb-48d2-b060-d0f5a71096e0' }] });
    expect(((await ok.json()) as Template).locations).toEqual({
      points: [{ name: 'Shop', latitude: 47.5, longitude: 7.5 }],
      beacons: [{ proximityUUID: 'E2C56DB5-DFFB-48D2-B060-D0F5A71096E0' }],
      maxDistance: 200,
    });
  });

  it('valida NFC', async () => {
    const bad = await json('/api/templates', 'POST', { ...templateInput, nfc: { enabled: true, message: 'x'.repeat(65) } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'NFC: the message exceeds 64 bytes' });
    expect((await json('/api/templates', 'POST', { ...templateInput, nfc: { enabled: true, message: 'x', encryptionPublicKey: 'abc' } })).status).toBe(400);
    const ok = await json('/api/templates', 'POST', { ...templateInput, nfc: { enabled: true, message: '{{serial}}' } });
    expect(((await ok.json()) as Template).nfc).toEqual({ enabled: true, message: '{{serial}}' });
  });

  it('descarga pkpass', async () => {
    await setupApple();
    const { pass } = await issue();
    const res = await call(`/api/passes/${pass.serial}/pkpass`);
    expect(res.headers.get('content-type')).toBe('application/vnd.apple.pkpass');
    const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const pj = JSON.parse(new TextDecoder().decode(zip['pass.json']));
    expect(pj).toMatchObject({ serialNumber: pass.serial, webServiceURL: `${BASE}/`, authenticationToken: pass.authToken });

    const pub = await call(`/public/passes/${pass.serial}/${pass.authToken}.pkpass`);
    expect(pub.status).toBe(200);
    expect(pub.headers.get('content-type')).toBe('application/vnd.apple.pkpass');
    expect((await call(`/public/passes/${pass.serial}/otro-token`)).status).toBe(404);
  });

  it('sube imágenes PNG', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.set('file', new File([png], 'a.png'));
    const res = await call('/api/images', { method: 'POST', body: form });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await call(`/public/images/${id}`)).headers.get('content-type')).toBe('image/png');
    const bad = new FormData();
    bad.set('file', new File(['hola'], 'a.txt'));
    expect((await call('/api/images', { method: 'POST', body: bad })).status).toBe(400);
  });
});

describe('web service Apple', () => {
  it('registro, consulta de actualizados, descarga y baja', async () => {
    await setupApple();
    const { pass } = await issue();
    const auth = { authorization: `ApplePass ${pass.authToken}`, 'content-type': 'application/json' };
    const reg = `/v1/devices/dev1/registrations/pass.test/${pass.serial}`;

    expect((await call(reg, { method: 'POST', headers: { ...auth, authorization: 'ApplePass mal' }, body: '{"pushToken":"p"}' })).status).toBe(401);
    expect((await call(reg, { method: 'POST', headers: auth, body: '{"pushToken":"p"}' })).status).toBe(201);
    expect((await call(reg, { method: 'POST', headers: auth, body: '{"pushToken":"p"}' })).status).toBe(200);

    const list = await call('/v1/devices/dev1/registrations/pass.test');
    const body = (await list.json()) as { serialNumbers: string[]; lastUpdated: string };
    expect(body.serialNumbers).toEqual([pass.serial]);
    expect((await call(`/v1/devices/dev1/registrations/pass.test?passesUpdatedSince=${body.lastUpdated}`)).status).toBe(204);

    const get = await call(`/v1/passes/pass.test/${pass.serial}`, { headers: auth });
    expect(get.status).toBe(200);
    const lm = get.headers.get('last-modified')!;
    expect((await call(`/v1/passes/pass.test/${pass.serial}`, { headers: { ...auth, 'if-modified-since': lm } })).status).toBe(304);

    expect((await call(reg, { method: 'DELETE', headers: auth })).status).toBe(200);
    expect((await call('/v1/devices/dev1/registrations/pass.test')).status).toBe(204);
    expect((await call('/v1/log', { method: 'POST', body: '{"logs":["x"]}' })).status).toBe(200);
  });
});

describe('front', () => {
  it('delega las rutas del SPA a Static Assets', async () => {
    const res = await call('/plantillas', { headers: { 'sec-fetch-mode': 'navigate' } });
    expect(res.headers.get('content-type') ?? '').not.toContain('application/json');
    expect(res.status).toBeLessThan(500);
  });
});
