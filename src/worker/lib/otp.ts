import type { OtpSettings } from '../types';
import { b64ToBytes } from './crypto';

/** Apple: el código cambia cada 24 h (alineado a medianoche UTC) y se acepta el actual y el anterior (48 h). */
export const APPLE_OTP_STEP_SECONDS = 86400;
export const OTP_DIGITS = 8;

const enc = new TextEncoder();

const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/**
 * Secreto TOTP de un pase, derivado de ENCRYPTION_KEY con HMAC-SHA256 (no se guarda).
 * Cambiar ENCRYPTION_KEY invalida los códigos de todos los pases.
 */
export async function otpSecret(encryptionKey: string, serial: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', b64ToBytes(encryptionKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`otp:${serial}`)));
  // 20 bytes: largo recomendado para TOTP con SHA-1 (RFC 4226).
  return mac.slice(0, 20);
}

export const otpSecretHex = async (encryptionKey: string, serial: string) => toHex(await otpSecret(encryptionKey, serial));

/** HOTP (RFC 4226) con HMAC-SHA1. */
export async function hotp(secret: Uint8Array, counter: number, digits = OTP_DIGITS): Promise<string> {
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** TOTP (RFC 6238): contador = floor(t / paso). */
export const totp = (secret: Uint8Array, stepSeconds: number, nowMs = Date.now(), digits = OTP_DIGITS) =>
  hotp(secret, Math.floor(nowMs / 1000 / stepSeconds), digits);

/** Valor del código de barras: SERIAL.CÓDIGO. */
export const otpBarcodeValue = (serial: string, code: string) => `${serial}.${code}`;

export function parseOtpBarcode(value: string): { serial: string; code: string } | null {
  const m = /^([A-Za-z0-9_-]{1,64})\.(\d{6,10})$/.exec(value.trim());
  return m ? { serial: m[1], code: m[2] } : null;
}

export type OtpMatch = { valid: true; platform: 'apple' | 'google' } | { valid: false };

/**
 * Verifica un código contra las dos ventanas:
 * - Google: paso `googlePeriodSeconds`, tolera ±1 paso por desfase de reloj.
 * - Apple: paso 24 h, acepta el día actual y el anterior.
 */
export async function verifyOtp(secret: Uint8Array, code: string, googlePeriodSeconds: number, nowMs = Date.now()): Promise<OtpMatch> {
  const g = Math.floor(nowMs / 1000 / googlePeriodSeconds);
  for (const c of [g, g - 1, g + 1]) if ((await hotp(secret, c)) === code) return { valid: true, platform: 'google' };
  const a = Math.floor(nowMs / 1000 / APPLE_OTP_STEP_SECONDS);
  for (const c of [a, a - 1]) if ((await hotp(secret, c)) === code) return { valid: true, platform: 'apple' };
  return { valid: false };
}

export interface PassOtp {
  /** Código de Apple vigente (paso de 24 h). */
  appleCode: string;
  /** Secreto en hex para el rotatingBarcode de Google. */
  keyHex: string;
}

/** Datos OTP para armar el pase; undefined si la plantilla no usa OTP. */
export async function passOtp(encryptionKey: string, t: { otp?: OtpSettings }, serial: string, nowMs = Date.now()): Promise<PassOtp | undefined> {
  if (!t.otp?.enabled) return undefined;
  const secret = await otpSecret(encryptionKey, serial);
  return { appleCode: await totp(secret, APPLE_OTP_STEP_SECONDS, nowMs), keyHex: toHex(secret) };
}
