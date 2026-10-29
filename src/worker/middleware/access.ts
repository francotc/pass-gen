import { createMiddleware } from 'hono/factory';
import { verifyWithJwks } from 'hono/jwt';
import type { AppEnv } from '../env';

/**
 * Defensa en profundidad detrás de Cloudflare Access: si ACCESS_TEAM_DOMAIN y ACCESS_AUD
 * están configurados, exige un Cf-Access-Jwt-Assertion válido. Si no, confía en Access.
 */
export const accessGuard = createMiddleware<AppEnv>(async (c, next) => {
  const team = c.env.ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const aud = c.env.ACCESS_AUD;
  if (!team || !aud) return next();

  const token = c.req.header('cf-access-jwt-assertion');
  if (!token) return c.json({ error: 'Falta el token de Cloudflare Access' }, 401);
  try {
    await verifyWithJwks(token, {
      jwks_uri: `https://${team}/cdn-cgi/access/certs`,
      allowedAlgorithms: ['RS256'],
      verification: { aud, iss: `https://${team}` },
    });
  } catch {
    return c.json({ error: 'Token de Cloudflare Access inválido' }, 401);
  }
  return next();
});
