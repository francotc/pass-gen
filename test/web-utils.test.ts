import { describe, expect, it } from 'vitest';
import { syncMessage } from '../src/web/app/core/sync-message';
import { newTemplate, placeholderKeys } from '../src/web/app/core/template-utils';

describe('utilidades del front', () => {
  it('detecta placeholders sin incluir los reservados', () => {
    const t = newTemplate();
    t.backFields.push({ key: 'x', label: '{{tier}}', value: '{{holderName}} {{serial}}' });
    expect(placeholderKeys(t).sort()).toEqual(['reward', 'stamps', 'tier']);
  });

  it('resume la sincronización', () => {
    expect(syncMessage({ apple: { sent: 2, failed: 0 }, google: { ok: true } })).toEqual({
      ok: true,
      text: 'Google updated · Apple: 2 device(s) notified',
    });
    expect(syncMessage({ apple: { sent: 0, failed: 0, skipped: 'Apple not configured' }, google: { ok: false, error: 'boom' } })).toEqual({
      ok: false,
      text: 'Google: boom · Apple not configured',
    });
  });
});

import { applyBrand, brandFromTemplate, deriveBrand, slugKey } from '../src/web/app/core/brand';
import { contrast, labelOn, mix, textOn } from '../src/web/app/core/color';

describe('marca', () => {
  it('genera identidad, colores con contraste y texto del código', () => {
    const t = newTemplate();
    t.brand = { businessName: 'Café Central', programName: 'Sellos', color: '#1e3a8a', overrides: [] };
    t.barcode.message = '{{serial}}';
    applyBrand(t);
    expect(t).toMatchObject({
      organizationName: 'Café Central',
      logoText: 'Café Central',
      description: 'Sellos · Café Central',
      google: { issuerName: 'Café Central', programName: 'Sellos' },
      colors: { background: '#1e3a8a', foreground: '#ffffff' },
      barcode: { altText: '{{serial}}' },
    });
    expect(contrast(t.colors.label, t.colors.background)).toBeGreaterThanOrEqual(3);
  });

  it('respeta los valores personalizados', () => {
    const t = newTemplate();
    t.brand = { businessName: 'A', programName: 'B', color: '#ffffff', overrides: ['logoText', 'foreground'] };
    t.logoText = 'Custom';
    t.colors.foreground = '#ff0000';
    applyBrand(t);
    expect(t.logoText).toBe('Custom');
    expect(t.colors.foreground).toBe('#ff0000');
    expect(t.organizationName).toBe('A');
  });

  it('reconstruye la marca de plantillas viejas y detecta lo personalizado', () => {
    const t = newTemplate();
    delete t.brand;
    t.organizationName = 'Shop';
    t.logoText = 'SHOP!';
    t.google.programName = 'Points';
    t.colors = { background: '#ffffff', foreground: '#0a0a0a', label: '#00ff00' };
    const b = brandFromTemplate(t);
    expect(b).toMatchObject({ businessName: 'Shop', programName: 'Points', color: '#ffffff' });
    expect(b.overrides).toEqual(expect.arrayContaining(['logoText', 'label', 'description', 'issuerName']));
    expect(b.overrides).not.toContain('foreground');
    expect(deriveBrand(t, b).foreground).toBe('#0a0a0a');
  });

  it('colores: texto por contraste, etiqueta ≥ 3:1, mezcla', () => {
    expect(textOn('#ffffff')).toBe('#0a0a0a');
    expect(textOn('#111111')).toBe('#ffffff');
    for (const bg of ['#ffffff', '#171717', '#1e3a8a', '#f59e0b', '#22c55e']) expect(contrast(labelOn(bg), bg)).toBeGreaterThanOrEqual(3);
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('clave desde la etiqueta', () => {
    expect(slugKey('Próximo premio')).toBe('proximo_premio');
    expect(slugKey('  ')).toBe('field');
  });
});
