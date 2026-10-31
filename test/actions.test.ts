import { unzipSync } from 'fflate';
import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { buildPassJson, buildPkpass } from '../src/worker/lib/apple/pkpass';
import { buildClass, buildObject } from '../src/worker/lib/google/wallet';
import type { ActionSettings, Pass, Template } from '../src/worker/types';
import { appleSettings, makeTemplate } from './helpers';

const pass: Pass = {
  serial: 'S1', templateId: 't1', authToken: 'a'.repeat(32), holderName: 'Ana', data: { stamps: '7' },
  createdAt: '', updatedAt: '', voided: false, google: { synced: false },
};

const actions: ActionSettings = {
  links: [
    { label: 'Our menu', url: 'https://cafe.dev/menu?m={{serial}}' },
    { label: 'Call us', url: 'tel:+41611234567' },
  ],
  button: { label: 'Order now', url: 'https://cafe.dev/order?m={{serial}}', androidPackage: 'dev.cafe.app' },
  modules: [
    { header: 'Double stamps', body: 'Every Monday', url: 'https://cafe.dev/promo', imageId: 'img1', displayEnd: '2026-12-31T00:00:00.000Z' },
  ],
  featured: [{ action: 'membershipBenefits', url: 'https://cafe.dev/benefits', label: 'Benefits' }],
  appLaunchURL: 'cafe://card/{{serial}}',
  appStoreIds: [123456789],
};

describe('Apple', () => {
  it('links en el reverso con attributedValue y app asociada', () => {
    const json = buildPassJson(makeTemplate({ actions }), pass, appleSettings(), 'https://x.dev') as Record<string, any>;
    expect(json.storeCard.backFields.slice(-2)).toEqual([
      { key: 'pg.link.0', label: 'Our menu', value: 'https://cafe.dev/menu?m=S1', attributedValue: '<a href="https://cafe.dev/menu?m=S1">Our menu</a>' },
      { key: 'pg.link.1', label: 'Call us', value: 'tel:+41611234567', attributedValue: '<a href="tel:+41611234567">Call us</a>' },
    ]);
    expect(json).toMatchObject({ associatedStoreIdentifiers: [123456789], appLaunchURL: 'cafe://card/S1' });
    expect(json).not.toHaveProperty('posterGeneric');
    expect(json).not.toHaveProperty('featuredActions');
  });

  it('poster: posterGeneric con layout acotado, acciones destacadas y fallback clásico', () => {
    const t: Template = makeTemplate({
      actions,
      background: { poster: true },
      headerFields: [{ key: 'h1', label: 'A', value: '1' }, { key: 'h2', label: 'B', value: '2' }],
      primaryFields: [{ key: 'p1', label: 'P', value: 'p' }],
      secondaryFields: [1, 2, 3, 4].map((n) => ({ key: `s${n}`, label: 'S', value: `${n}` })),
      auxiliaryFields: [1, 2, 3].map((n) => ({ key: `a${n}`, label: 'X', value: `${n}` })),
    });
    const json = buildPassJson(t, pass, appleSettings(), 'https://x.dev') as Record<string, any>;
    expect(json.storeCard).toBeDefined();
    expect(json.posterGeneric.headerFields.map((f: any) => f.key)).toEqual(['h1']);
    expect(json.posterGeneric.primaryFields.map((f: any) => f.key)).toEqual(['p1', 's1', 's2', 's3']);
    expect(json.posterGeneric.footerFields.map((f: any) => f.key)).toEqual(['a1', 'a2']);
    expect(json.posterGeneric.backFields.at(-1).key).toBe('pg.link.1');
    expect(json.featuredActions).toEqual([{ action: 'membershipBenefits', url: 'https://cafe.dev/benefits', label: 'Benefits' }]);
  });

  it('poster con imagen: background y artwork en el .pkpass', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const t = makeTemplate({ background: { poster: true }, images: { background: 'bg' } });
    const zip = unzipSync(await buildPkpass(t, pass, appleSettings(), 'https://x.dev', { background: png }));
    expect(Object.keys(zip)).toEqual(expect.arrayContaining(['background.png', 'background@2x.png', 'artwork.png', 'artwork@2x.png']));
    const plain = unzipSync(await buildPkpass(makeTemplate({ images: { background: 'bg' } }), pass, appleSettings(), 'https://x.dev', { background: png }));
    expect(Object.keys(plain)).not.toContain('background.png');
  });
});

describe('Google', () => {
  const images = { background: 'https://x.dev/public/images/bg', byId: (id: string) => `https://x.dev/public/images/${id}` };

  it('object: links, botón y módulos con placeholders', () => {
    const obj = buildObject(makeTemplate({ actions }), pass, '338', images) as Record<string, any>;
    expect(obj.linksModuleData).toEqual({
      uris: [
        { id: 'link0', uri: 'https://cafe.dev/menu?m=S1', description: 'Our menu' },
        { id: 'link1', uri: 'tel:+41611234567', description: 'Call us' },
      ],
    });
    expect(obj.appLinkData).toEqual({
      displayText: { defaultValue: { language: 'en', value: 'Order now' } },
      webAppLinkInfo: { appTarget: { targetUri: { uri: 'https://cafe.dev/order?m=S1', description: 'Order now' } } },
      androidAppLinkInfo: { appTarget: { packageName: 'dev.cafe.app' } },
    });
    expect(obj.valueAddedModuleData).toEqual([
      {
        header: { defaultValue: { language: 'en', value: 'Double stamps' } },
        body: { defaultValue: { language: 'en', value: 'Every Monday' } },
        uri: 'https://cafe.dev/promo',
        image: { sourceUri: { uri: 'https://x.dev/public/images/img1' }, contentDescription: { defaultValue: { language: 'en', value: 'Double stamps' } } },
        sortIndex: 0,
        viewConstraints: { displayInterval: { end: { date: '2026-12-31T00:00:00.000Z' } } },
      },
    ]);
  });

  it('class: imagen de fondo como imageModulesData', () => {
    expect(buildClass(makeTemplate(), '338', images)).toMatchObject({
      imageModulesData: [{ id: 'background', mainImage: { sourceUri: { uri: 'https://x.dev/public/images/bg' } } }],
    });
    expect(buildClass(makeTemplate(), '338', {})).not.toHaveProperty('imageModulesData');
  });
});

describe('validación', () => {
  const { id: _i, createdAt: _c, updatedAt: _u, ...input } = makeTemplate();
  const post = (body: unknown) =>
    exports.default.fetch('https://x.dev/api/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const err = async (actionsInput: unknown) => ((await (await post({ ...input, actions: actionsInput })).json()) as { error?: string }).error;

  it.each([
    [{ links: [{ label: 'x', url: 'javascript:alert(1)' }] }, 'Link 1: URL must start with http(s)://, tel:, mailto: or geo:'],
    [{ links: [{ label: '', url: 'https://a.dev' }] }, 'Link 1: label is required'],
    [{ button: { label: 'Go', url: 'tel:123' } }, 'Button: URL must start with http(s)://'],
    [{ button: { label: 'Go', url: 'https://a.dev', androidPackage: 'nope' } }, 'Button: invalid Android package name'],
    [{ modules: [{ header: '', body: '' }] }, 'Module 1: header or text is required'],
    [{ featured: [{ action: 'dance', url: 'https://a.dev' }] }, 'Featured action 1: invalid action'],
    [{ featured: [1, 2, 3].map(() => ({ action: 'shop', url: 'https://a.dev' })) }, 'Up to 2 featured actions are allowed'],
    [{ appLaunchURL: 'cafe://x' }, 'App launch URL requires an App Store id'],
    [{ appStoreIds: ['abc'] }, 'App Store ids must be positive integers'],
  ])('rechaza %#', async (a, msg) => {
    expect(await err(a)).toBe(msg);
  });

  it('acepta y normaliza', async () => {
    const res = await post({ ...input, background: { poster: true }, actions: { button: { label: ' Order ', url: 'https://a.dev' }, appStoreIds: ['42'] } });
    const t = (await res.json()) as Template;
    expect(t.background).toEqual({ poster: true });
    expect(t.actions).toEqual({ links: [], modules: [], featured: [], appStoreIds: [42], button: { label: 'Order', url: 'https://a.dev' } });
  });
});
