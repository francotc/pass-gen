import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { appleStrings, buildPkpass } from '../src/worker/lib/apple/pkpass';
import { buildClass, buildObject } from '../src/worker/lib/google/wallet';
import { i18n, passStrings } from '../src/worker/lib/i18n';
import { parseTemplateInput, ValidationError } from '../src/worker/lib/validate';
import type { Pass } from '../src/worker/types';
import { appleSettings, makeTemplate } from './helpers';

const pass: Pass = {
  serial: 'ABC123', templateId: 't1', authToken: 'a'.repeat(32), holderName: 'Ana',
  data: { stamps: '7' }, createdAt: '', updatedAt: '', voided: false, google: { synced: false },
};

const tpl = makeTemplate({
  localization: {
    language: 'es',
    translations: {
      en: { SELLOS: 'STAMPS', '{{stamps}} / 10': '{{stamps}} of 10', Términos: 'Terms', Sellos: 'Stamps', 'Café Central': 'Central Coffee' },
      'pt-BR': { SELLOS: 'SELOS', Términos: '' },
    },
  },
});

const decode = (b: Uint8Array) => new TextDecoder('utf-16le').decode(b.slice(2));

describe('traducciones', () => {
  it('resuelve traducciones renderizadas y omite las vacías', () => {
    const L = i18n(tpl, { stamps: '7' });
    expect(L.tr('{{stamps}} / 10')).toEqual([{ language: 'en', value: '7 of 10' }]);
    expect(L.tr('Términos')).toEqual([{ language: 'en', value: 'Terms' }]);
    expect(L.ls('SELLOS')).toEqual({
      defaultValue: { language: 'es', value: 'SELLOS' },
      translatedValues: [{ language: 'en', value: 'STAMPS' }, { language: 'pt-BR', value: 'SELOS' }],
    });
  });

  it('pass.strings en UTF-16LE con BOM y escapes', () => {
    const b = passStrings([['a "b"', 'línea\nnueva']]);
    expect([b[0], b[1]]).toEqual([0xff, 0xfe]);
    expect(decode(b)).toBe('"a \\"b\\"" = "línea\\nnueva";\n');
  });

  it('Apple: un .lproj por idioma, con el principal vacío', async () => {
    const strings = appleStrings(tpl, pass);
    expect([...strings.keys()].sort()).toEqual(['en', 'es', 'pt-BR']);
    expect(strings.get('en')).toContainEqual(['7 / 10', '7 of 10']);
    expect(strings.get('es')).toEqual([]);
    const files = unzipSync(await buildPkpass(tpl, pass, appleSettings(), 'https://x', {}));
    expect(decode(files['en.lproj/pass.strings'])).toContain('"SELLOS" = "STAMPS";');
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    expect(manifest['pt-BR.lproj/pass.strings']).toBeTruthy();
    // Sin traducciones el pase no cambia.
    expect(appleStrings(makeTemplate(), pass).size).toBe(0);
  });

  it('Apple: incluye las traducciones del mensaje', () => {
    const p = { ...pass, message: { notificationId: 'n', header: 'Hola', body: 'Cuerpo', placement: 'backFields' as const, changeMessage: '%@', sentAt: '', translations: [{ language: 'de', header: 'Hallo', body: 'Text' }] } };
    expect(appleStrings(makeTemplate(), p).get('de')).toEqual([['Hola', 'Hallo'], ['Cuerpo', 'Text']]);
  });

  it('Google: idioma principal y translatedValues en clase y objeto', () => {
    const cls = buildClass(tpl, '338', {});
    expect(cls.localizedProgramName).toEqual({ defaultValue: { language: 'es', value: 'Sellos' }, translatedValues: [{ language: 'en', value: 'Stamps' }] });
    expect(cls.localizedIssuerName).toMatchObject({ translatedValues: [{ language: 'en', value: 'Central Coffee' }] });
    const obj = buildObject(tpl, pass, '338', {}) as { loyaltyPoints: { localizedLabel: unknown }; textModulesData: { id: string; localizedHeader?: unknown }[] };
    expect(obj.loyaltyPoints.localizedLabel).toMatchObject({ translatedValues: [{ language: 'en', value: 'STAMPS' }, { language: 'pt-BR', value: 'SELOS' }] });
    expect(obj.textModulesData.find((m) => m.id === 'terms')?.localizedHeader).toMatchObject({ translatedValues: [{ language: 'en', value: 'Terms' }] });
    expect(obj.textModulesData.find((m) => m.id === 'member')?.localizedHeader).toBeUndefined();
    const generic = buildObject({ ...tpl, kind: 'generic' }, pass, '338', {}) as { header: unknown };
    expect(generic.header).toEqual({ defaultValue: { language: 'es', value: '7 / 10' }, translatedValues: [{ language: 'en', value: '7 of 10' }] });
  });

  it('valida idiomas y descarta el principal', () => {
    const { id: _i, createdAt: _c, updatedAt: _u, ...input } = makeTemplate();
    const ok = parseTemplateInput({ ...input, localization: { language: 'es', translations: { es: { a: 'b' }, en: { ' SELLOS ': 'STAMPS' } } } });
    expect(ok.localization).toEqual({ language: 'es', translations: { en: { SELLOS: 'STAMPS' } } });
    expect(() => parseTemplateInput({ ...input, localization: { language: 'es', translations: { 'not a tag': {} } } })).toThrow(ValidationError);
  });
});
