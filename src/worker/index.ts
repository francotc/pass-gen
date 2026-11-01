import { passOtp } from './lib/otp';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv, Env } from './env';
import { googleRootKeys, unsealGoogleCallback } from './lib/google/callback';
import { objectId, saveLink } from './lib/google/wallet';
import { detectDevice, renderHolderPage } from './lib/holder-page';
import { rotateAppleOtp } from './lib/rotate';
import { buildPkpass } from './lib/apple/pkpass';
import { safeEqual } from './lib/crypto';
import { api, loadImages, store } from './routes/api';
import { appleWs } from './routes/apple-ws';

const app = new Hono<AppEnv>();

app.use('/api/*', secureHeaders());
app.route('/api', api);
app.route('/v1', appleWs);

/** Imágenes públicas para Google Wallet (ids aleatorios). Requiere bypass en Access. */
app.get('/public/images/:id', async (c) => {
  const img = await store(c).getImage(c.req.param('id'));
  if (!img) return c.body(null, 404);
  return c.body(img.bytes, 200, { 'content-type': img.meta.contentType, 'cache-control': 'public, max-age=86400' });
});

/** Descarga pública del .pkpass para el titular; el authToken del pase hace de llave. */
app.get('/public/passes/:serial/:token', async (c) => {
  const s = store(c);
  const pass = await s.getPass(c.req.param('serial'));
  if (!pass || !safeEqual(c.req.param('token').replace(/\.pkpass$/, ''), pass.authToken)) return c.body(null, 404);
  const [tpl, apple] = await Promise.all([s.getTemplate(pass.templateId), s.getAppleSettings()]);
  if (!tpl || !apple) return c.body(null, 404);
  const bytes = await buildPkpass(tpl, pass, apple, new URL(c.req.url).origin, await loadImages(s, tpl), await passOtp(c.env.ENCRYPTION_KEY, tpl, pass.serial));
  return c.body(bytes, 200, {
    'content-type': 'application/vnd.apple.pkpass',
    'content-disposition': `attachment; filename="${pass.serial}.pkpass"`,
    'cache-control': 'no-store',
  });
});

/** Página pública del titular: botones para agregar el pase según el dispositivo. */
app.get('/public/p/:serial/:token', async (c) => {
  const s = store(c);
  const pass = await s.getPass(c.req.param('serial'));
  const token = c.req.param('token');
  if (!pass || !safeEqual(token, pass.authToken)) return c.text('Not found', 404);
  const tpl = await s.getTemplate(pass.templateId);
  if (!tpl) return c.text('Not found', 404);
  const origin = new URL(c.req.url).origin;
  const [apple, google] = await Promise.all([s.getAppleSettings().catch(() => null), s.getGoogleSettings().catch(() => null)]);

  const googleUrl =
    google && pass.google.synced && pass.google.objectId ? await saveLink(google, tpl.kind, pass.google.objectId, [origin]) : undefined;
  // El SVG oficial de Google es opcional (ver README); sin él se muestra un botón de texto.
  const badge = await c.env.ASSETS.fetch(new Request(`${origin}/public/badges/add-to-google-wallet.svg`));
  const googleBadge = badge.ok && (badge.headers.get('content-type') ?? '').includes('svg');
  const logo = tpl.images.logoSquare ?? tpl.images.logo ?? tpl.images.icon;

  const html = renderHolderPage({
    template: tpl,
    pass,
    pageUrl: `${origin}/public/p/${pass.serial}/${token}`,
    appleUrl: apple ? `${origin}/public/passes/${pass.serial}/${token}.pkpass` : undefined,
    googleUrl,
    googleBadge,
    logoUrl: logo ? `/public/images/${logo}` : undefined,
    device: detectDevice(c.req.header('user-agent') ?? ''),
    unavailable: pass.voided ? 'This pass is no longer valid.' : undefined,
  });
  return c.html(html, 200, {
    'cache-control': 'no-store',
    // El token va en la URL: no filtrarlo por Referer.
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'x-robots-tag': 'noindex',
  });
});

/**
 * Callback de Google Wallet (callbackOptions de la clase): avisa cuando un titular guarda o elimina el pase.
 * El mensaje viene firmado (ECv2SigningOnly); sin firma válida se descarta.
 */
app.post('/public/google/callback', async (c) => {
  const s = store(c);
  const google = await s.getGoogleSettings().catch(() => null);
  if (!google) return c.body(null, 404);
  let msg;
  try {
    msg = await unsealGoogleCallback(await c.req.text(), google.issuerId, await googleRootKeys());
  } catch (e) {
    console.warn('[google-callback] rejected:', (e as Error).message);
    return c.body(null, 400);
  }
  // Google puede reintentar: procesar cada nonce una sola vez.
  if (!(await s.claimNonce(msg.nonce))) return c.body(null, 200);
  const serial = await serialForObject(s, google.issuerId, msg.objectId);
  if (serial) await s.recordInstall(serial, 'google', msg.eventType === 'save' ? 'added' : 'removed');
  return c.body(null, 200);
});

/** El objectId es `{issuerId}.{serial saneado}`; si el saneo cambió el serial, se busca entre los pases. */
async function serialForObject(s: ReturnType<typeof store>, issuerId: string, id: string): Promise<string | undefined> {
  if (!id.startsWith(`${issuerId}.`)) return undefined;
  const direct = await s.getPass(id.slice(issuerId.length + 1));
  if (direct && objectId(issuerId, direct.serial) === id) return direct.serial;
  return (await s.listPasses()).find((p) => objectId(issuerId, p.serial) === id)?.serial;
}

// Todo lo demás lo sirve Static Assets (SPA).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  /** Cron diario (wrangler.jsonc → triggers): rota los códigos OTP de Apple. */
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(rotateAppleOtp(env).then((r) => console.log('[otp] rotated', JSON.stringify(r))));
  },
};
