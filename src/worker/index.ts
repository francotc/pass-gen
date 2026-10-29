import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './env';
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
  const bytes = await buildPkpass(tpl, pass, apple, new URL(c.req.url).origin, await loadImages(s, tpl));
  return c.body(bytes, 200, {
    'content-type': 'application/vnd.apple.pkpass',
    'content-disposition': `attachment; filename="${pass.serial}.pkpass"`,
    'cache-control': 'no-store',
  });
});

// Todo lo demás lo sirve Static Assets (SPA).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
