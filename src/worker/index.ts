import { Hono } from 'hono';
import type { AppEnv } from './env';

const app = new Hono<AppEnv>();

app.get('/api/health', (c) => c.json({ ok: true }));

export default app;
