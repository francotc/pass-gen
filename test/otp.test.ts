import { describe, expect, it } from 'vitest';
import { hotp, otpBarcodeValue, otpSecret, parseOtpBarcode, totp, verifyOtp } from '../src/worker/lib/otp';

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const RFC_SECRET = new TextEncoder().encode('12345678901234567890');

describe('OTP', () => {
  it('cumple los vectores de RFC 4226 y RFC 6238 (SHA-1)', async () => {
    expect(await hotp(RFC_SECRET, 0, 6)).toBe('755224');
    expect(await hotp(RFC_SECRET, 9, 6)).toBe('520489');
    expect(await totp(RFC_SECRET, 30, 59_000, 8)).toBe('94287082');
    expect(await totp(RFC_SECRET, 30, 1111111109_000, 8)).toBe('07081804');
  });

  it('deriva un secreto estable por pase', async () => {
    const a = await otpSecret(KEY, 'S1');
    expect(a).toHaveLength(20);
    expect(await otpSecret(KEY, 'S1')).toEqual(a);
    expect(await otpSecret(KEY, 'S2')).not.toEqual(a);
  });

  it('Apple: válido el día actual y el anterior (48 h), no antes', async () => {
    const secret = await otpSecret(KEY, 'S1');
    const day = 86400_000;
    const issued = Date.UTC(2026, 9, 31, 10, 0);
    const code = await totp(secret, 86400, issued);
    expect(await verifyOtp(secret, code, 30, issued + 13 * 3600_000)).toEqual({ valid: true, platform: 'apple' });
    expect(await verifyOtp(secret, code, 30, issued + day)).toEqual({ valid: true, platform: 'apple' });
    expect(await verifyOtp(secret, code, 30, issued + 2 * day)).toEqual({ valid: false });
  });

  it('Google: tolera ±1 período', async () => {
    const secret = await otpSecret(KEY, 'S1');
    const now = Date.UTC(2026, 9, 31, 10, 0, 15);
    const code = await totp(secret, 30, now);
    expect(await verifyOtp(secret, code, 30, now + 30_000)).toEqual({ valid: true, platform: 'google' });
    expect(await verifyOtp(secret, code, 30, now + 120_000)).toEqual({ valid: false });
  });

  it('formato SERIAL.CÓDIGO', () => {
    expect(otpBarcodeValue('S1', '01234567')).toBe('S1.01234567');
    expect(parseOtpBarcode(' S1.01234567 ')).toEqual({ serial: 'S1', code: '01234567' });
    expect(parseOtpBarcode('S1-01234567')).toBeNull();
  });
});
