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
