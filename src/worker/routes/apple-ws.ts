import { passOtp } from '../lib/otp';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { buildPkpass } from '../lib/apple/pkpass';
import { safeEqual } from '../lib/crypto';
import type { Pass } from '../types';
import { loadImages, store } from './api';

/** Web service de Apple Wallet (https://developer.apple.com/documentation/walletpasses). Sin Cloudflare Access. */
export const appleWs = new Hono<AppEnv>();

async function authorizedPass(c: Context<AppEnv>, passTypeId: string, serial: string): Promise<Pass | null> {
  const s = store(c);
  const apple = await s.getAppleSettings();
  if (!apple || apple.passTypeId !== passTypeId) return null;
  const pass = await s.getPass(serial);
  const header = c.req.header('authorization') ?? '';
  if (!pass || !header.startsWith('ApplePass ')) return null;
  return safeEqual(header.slice('ApplePass '.length), pass.authToken) ? pass : null;
}

appleWs.post('/devices/:deviceId/registrations/:passTypeId/:serial', async (c) => {
  const { deviceId, passTypeId, serial } = c.req.param();
  if (!(await authorizedPass(c, passTypeId, serial))) return c.body(null, 401);
  const { pushToken } = await c.req.json<{ pushToken?: string }>().catch(() => ({ pushToken: undefined }));
  if (!pushToken) return c.body(null, 400);
  const s = store(c);
  const created = await s.register(deviceId, passTypeId, serial, pushToken);
  if (created) await s.recordInstall(serial, 'apple', 'added');
  return c.body(null, created ? 201 : 200);
});

appleWs.delete('/devices/:deviceId/registrations/:passTypeId/:serial', async (c) => {
  const { deviceId, passTypeId, serial } = c.req.param();
  if (!(await authorizedPass(c, passTypeId, serial))) return c.body(null, 401);
  const s = store(c);
  if (await s.unregister(deviceId, passTypeId, serial)) await s.recordInstall(serial, 'apple', 'removed');
  return c.body(null, 200);
});

appleWs.get('/devices/:deviceId/registrations/:passTypeId', async (c) => {
  const { deviceId, passTypeId } = c.req.param();
  const s = store(c);
  const since = Number(c.req.query('passesUpdatedSince') ?? 0) || 0;
  const passes = (await Promise.all((await s.serialsForDevice(deviceId, passTypeId)).map((serial) => s.getPass(serial)))).filter(
    (p): p is Pass => p !== null,
  );
  const updated = passes.filter((p) => Date.parse(p.updatedAt) > since);
  if (!updated.length) return c.body(null, 204);
  const lastUpdated = Math.max(...passes.map((p) => Date.parse(p.updatedAt)));
  return c.json({ serialNumbers: updated.map((p) => p.serial), lastUpdated: String(lastUpdated) });
});

appleWs.get('/passes/:passTypeId/:serial', async (c) => {
  const { passTypeId, serial } = c.req.param();
  const pass = await authorizedPass(c, passTypeId, serial);
  if (!pass) return c.body(null, 401);
  const lastModified = new Date(pass.updatedAt);
  const ims = c.req.header('if-modified-since');
  // HTTP-date tiene precisión de segundos
  if (ims && Math.floor(lastModified.getTime() / 1000) <= Math.floor(Date.parse(ims) / 1000)) return c.body(null, 304);

  const s = store(c);
  const [tpl, apple] = await Promise.all([s.getTemplate(pass.templateId), s.getAppleSettings()]);
  if (!tpl || !apple) return c.body(null, 500);
  const bytes = await buildPkpass(tpl, pass, apple, new URL(c.req.url).origin, await loadImages(s, tpl), await passOtp(c.env.ENCRYPTION_KEY, tpl, pass.serial));
  return c.body(bytes, 200, { 'content-type': 'application/vnd.apple.pkpass', 'last-modified': lastModified.toUTCString() });
});

appleWs.post('/log', async (c) => {
  const body = await c.req.json<{ logs?: string[] }>().catch(() => ({ logs: [] as string[] }));
  for (const line of body.logs ?? []) console.log('[apple-wallet]', line);
  return c.body(null, 200);
});
