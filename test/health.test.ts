import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('health', () => {
  it('responde ok', async () => {
    const res = await exports.default.fetch('https://x/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
