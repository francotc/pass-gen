import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { b64urlToBytes, decryptJson, encryptJson, pemToDer, signJwt } from '../src/worker/lib/crypto';
import { render } from '../src/worker/lib/render';
import { Store } from '../src/worker/lib/store';
import type { Pass, Template } from '../src/worker/types';
import { generatePkcs8Pem, makeTemplate } from './helpers';

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

describe('crypto', () => {
  it('cifra y descifra JSON', async () => {
    const enc = await encryptJson(KEY, { a: 1, s: 'secreto' });
    expect(enc).not.toContain('secreto');
    expect(await decryptJson(KEY, enc)).toEqual({ a: 1, s: 'secreto' });
  });

  it.each(['RS256', 'ES256'] as const)('firma JWT %s verificable', async (alg) => {
    const { pem, publicKey } = await generatePkcs8Pem(alg);
    const jwt = await signJwt(alg, pem, { kid: 'k1' }, { iss: 'me' });
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64urlToBytes(h)))).toMatchObject({ alg, kid: 'k1' });
    const ok = await crypto.subtle.verify(
      alg === 'RS256' ? 'RSASSA-PKCS1-v1_5' : { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      b64urlToBytes(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(ok).toBe(true);
    expect(pemToDer(pem).length).toBeGreaterThan(32);
  });
});

describe('render', () => {
  it('reemplaza placeholders y deja vacío lo faltante', () => {
    expect(render('Hola {{holderName}}, {{ stamps }}/10 {{nada}}', { holderName: 'Ana', stamps: '7' })).toBe('Hola Ana, 7/10 ');
  });
});

describe('store', () => {
  const store = () => new Store(env.PASSGEN, KEY);

  it('guarda settings cifrados', async () => {
    const s = store();
    await s.putGoogleSettings({ issuerId: '1', clientEmail: 'a@b', privateKey: 'PK' });
    expect(await env.PASSGEN.get('settings:google')).not.toContain('PK');
    expect(await s.getGoogleSettings()).toEqual({ issuerId: '1', clientEmail: 'a@b', privateKey: 'PK' });
  });

  it('CRUD de plantillas y pases', async () => {
    const s = store();
    const t: Template = makeTemplate({ id: 't1', name: 'Café' });
    await s.putTemplate(t);
    expect(await s.listTemplates()).toEqual([{ id: 't1', name: 'Café', kind: 'loyalty', updatedAt: t.updatedAt }]);
    expect(await s.getTemplate('t1')).toEqual(t);

    const p: Pass = {
      serial: 's1', templateId: 't1', authToken: 'tok', holderName: 'Ana', data: {},
      createdAt: 'x', updatedAt: 'y', voided: false, google: { synced: false },
    };
    await s.putPass(p);
    expect((await s.listPasses())[0]).toMatchObject({ serial: 's1', holderName: 'Ana' });
    await s.deleteTemplate('t1');
    expect(await s.getTemplate('t1')).toBeNull();
  });

  it('registra dispositivos', async () => {
    const s = store();
    expect(await s.register('d1', 'pass.x', 's1', 'push1')).toBe(true);
    expect(await s.register('d1', 'pass.x', 's1', 'push1')).toBe(false);
    await s.register('d2', 'pass.x', 's1', 'push2');
    expect(await s.devicesForPass('pass.x', 's1')).toHaveLength(2);
    expect(await s.serialsForDevice('d1', 'pass.x')).toEqual(['s1']);
    await s.unregister('d1', 'pass.x', 's1');
    expect(await s.serialsForDevice('d1', 'pass.x')).toEqual([]);
  });
});
