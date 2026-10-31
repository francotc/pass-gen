import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPassJson } from '../src/worker/lib/apple/pkpass';
import { buildObject } from '../src/worker/lib/google/wallet';
import { passOtp } from '../src/worker/lib/otp';
import { rotateAppleOtp } from '../src/worker/lib/rotate';
import { Store } from '../src/worker/lib/store';
import type { Pass } from '../src/worker/types';
import { appleSettings, generatePkcs8Pem, makeTemplate } from './helpers';

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const pass: Pass = {
  serial: 'S1', templateId: 't1', authToken: 'a'.repeat(32), holderName: 'Ana', data: {},
  createdAt: '', updatedAt: '2026-01-01T00:00:00.000Z', voided: false, google: { synced: false },
};
const schedule = {
  validFrom: '2026-11-01T00:00:00.000Z',
  expiresAt: '2027-11-01T00:00:00.000Z',
  relevantDates: [{ start: '2026-11-05T18:00:00.000Z', end: '2026-11-05T22:00:00.000Z' }, { start: '2026-12-24T09:00:00.000Z' }],
  notify: true,
};

afterEach(() => vi.restoreAllMocks());

describe('fechas', () => {
  it('Apple: expirationDate y relevantDates; el pase pisa la plantilla', () => {
    const json = buildPassJson(makeTemplate({ schedule }), pass, appleSettings(), 'https://x.dev');
    expect(json.expirationDate).toBe('2027-11-01T00:00:00.000Z');
    expect(json.relevantDates).toEqual([
      { startDate: '2026-11-05T18:00:00.000Z', endDate: '2026-11-05T22:00:00.000Z' },
      { date: '2026-12-24T09:00:00.000Z' },
    ]);
    const own = buildPassJson(makeTemplate({ schedule }), { ...pass, expiresAt: '2026-12-31T00:00:00.000Z' }, appleSettings(), 'https://x.dev');
    expect(own.expirationDate).toBe('2026-12-31T00:00:00.000Z');
  });

  it('Google: validTimeInterval y avisos solo en Generic', () => {
    const loyalty = buildObject(makeTemplate({ schedule }), pass, '338', {});
    expect(loyalty.validTimeInterval).toEqual({ start: { date: '2026-11-01T00:00:00.000Z' }, end: { date: '2027-11-01T00:00:00.000Z' } });
    expect(loyalty).not.toHaveProperty('notifications');
    const generic = buildObject(makeTemplate({ schedule, kind: 'generic' }), pass, '338', {});
    expect(generic.notifications).toEqual({ upcomingNotification: { enableNotification: true }, expiryNotification: { enableNotification: true } });
  });
});

describe('OTP en los pases', () => {
  it('Apple: SERIAL.CÓDIGO con el código del día; Google: rotatingBarcode TOTP sin barcode estático', async () => {
    const t = makeTemplate({ otp: { enabled: true, googlePeriodSeconds: 60 } });
    const otp = (await passOtp(KEY, t, 'S1'))!;
    expect(otp.keyHex).toMatch(/^[0-9a-f]{40}$/);
    const apple = buildPassJson(t, pass, appleSettings(), 'https://x.dev', otp);
    expect(apple.barcodes).toEqual([{ format: 'PKBarcodeFormatQR', message: `S1.${otp.appleCode}`, messageEncoding: 'iso-8859-1', altText: 'S1' }]);

    const google = buildObject(t, pass, '338', {}, otp);
    expect(google).not.toHaveProperty('barcode');
    expect(google.rotatingBarcode).toEqual({
      type: 'QR_CODE',
      valuePattern: 'S1.{totp_value_0}',
      alternateText: 'S1',
      totpDetails: { periodMillis: '60000', algorithm: 'TOTP_SHA1', parameters: [{ key: otp.keyHex, valueLength: 8 }] },
    });
    expect(await passOtp(KEY, makeTemplate(), 'S1')).toBeUndefined();
  });

  it('cron: marca como actualizados solo los pases con OTP activos y hace push', async () => {
    const keys = await env.PASSGEN.list();
    await Promise.all(keys.keys.map((k) => env.PASSGEN.delete(k.name)));
    const store = new Store(env.PASSGEN, env.ENCRYPTION_KEY);
    const { pem } = await generatePkcs8Pem('ES256');
    await store.putAppleSettings({ ...appleSettings(), apnsKeyId: 'K', apnsKeyPem: pem });
    await store.putTemplate(makeTemplate({ id: 'otp', otp: { enabled: true, googlePeriodSeconds: 30 } }));
    await store.putTemplate(makeTemplate({ id: 'plain' }));
    await store.putPass({ ...pass, serial: 'A', templateId: 'otp' });
    await store.putPass({ ...pass, serial: 'B', templateId: 'otp', voided: true });
    await store.putPass({ ...pass, serial: 'C', templateId: 'plain' });
    await store.register('dev1', 'pass.test', 'A', 'tokA');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    expect(await rotateAppleOtp(env)).toEqual({ passes: 1, sent: 1, failed: 0 });
    expect(String(spy.mock.calls[0][0])).toBe('https://api.push.apple.com/3/device/tokA');
    expect((await store.getPass('A'))!.updatedAt).not.toBe(pass.updatedAt);
    expect((await store.getPass('B'))!.updatedAt).toBe(pass.updatedAt);
    expect((await store.getPass('C'))!.updatedAt).toBe(pass.updatedAt);
  });
});
