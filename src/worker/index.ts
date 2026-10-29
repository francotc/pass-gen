import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './env';
import { api, store } from './routes/api';
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

// Todo lo demás lo sirve Static Assets (SPA).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
