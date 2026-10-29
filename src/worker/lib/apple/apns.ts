import type { AppleSettings } from '../../types';
import { signJwt } from '../crypto';

const APNS = 'https://api.push.apple.com/3/device/';

export interface PushResult {
  sent: number;
  failed: number;
  /** Tokens que APNs rechazó como inválidos; hay que borrar sus registros. */
  invalid: string[];
  errors: string[];
}

export interface PushTransport {
  /** Binding mtls_certificates con el certificado del Pass Type ID (vía oficial de Apple). */
  mtls?: Fetcher;
}

/**
 * Notifica a los dispositivos que el pase cambió (payload vacío, topic = Pass Type ID).
 * Usa el certificado por mTLS si hay binding; si no, un JWT ES256 con la clave .p8.
 */
export async function pushUpdate(s: AppleSettings, tokens: string[], transport: PushTransport = {}): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, invalid: [], errors: [] };
  if (!tokens.length) return result;

  const headers: Record<string, string> = { 'apns-topic': s.passTypeId, 'content-type': 'application/json' };
  let send: (url: string, init: RequestInit) => Promise<Response>;
  if (transport.mtls) {
    send = (url, init) => transport.mtls!.fetch(url, init);
  } else if (s.apnsKeyId && s.apnsKeyPem) {
    const jwt = await signJwt('ES256', s.apnsKeyPem, { kid: s.apnsKeyId }, { iss: s.teamId, iat: Math.floor(Date.now() / 1000) });
    headers.authorization = `bearer ${jwt}`;
    send = fetch;
  } else {
    throw new Error('Falta configurar el push de Apple (certificado mTLS o clave .p8)');
  }

  await Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await send(APNS + token, { method: 'POST', headers, body: '{}' });
        if (res.ok) {
          result.sent++;
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { reason?: string };
        result.failed++;
        result.errors.push(`${res.status} ${body.reason ?? ''}`.trim());
        if (res.status === 410 || body.reason === 'BadDeviceToken' || body.reason === 'Unregistered') {
          result.invalid.push(token);
        }
      } catch (e) {
        result.failed++;
        result.errors.push(String(e));
      }
    }),
  );
  return result;
}
