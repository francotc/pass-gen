import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { certInfo, certToPem, parseP12, passIdsFromCert } from '../lib/apple/certs';
import { buildPkpass } from '../lib/apple/pkpass';
import { randomToken } from '../lib/crypto';
import { saveLink } from '../lib/google/wallet';
import { Store } from '../lib/store';
import { sendNotification } from '../lib/notifications';
import { publishTemplate, syncPass, type Ctx } from '../lib/sync';
import { parseData, parseNotificationInput, parsePassInput, parseTemplateInput, ValidationError } from '../lib/validate';
import type { AppleSettings, GoogleSettings, ImageSlot, Pass, SettingsStatus, Template } from '../types';
import { accessGuard } from '../middleware/access';

export const store = (c: Context<AppEnv>) => new Store(c.env.PASSGEN, c.env.ENCRYPTION_KEY);
export const ctxOf = (c: Context<AppEnv>): Ctx => ({ env: c.env, store: store(c), origin: new URL(c.req.url).origin });

const MAX_IMAGE = 2 * 1024 * 1024;
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47];

/** Serial legible y apto para Google (A-Z0-9). */
function newSerial(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

async function fileBytes(v: unknown): Promise<Uint8Array | undefined> {
  if (v && typeof v === 'object' && 'arrayBuffer' in v) {
    const buf = new Uint8Array(await (v as File).arrayBuffer());
    return buf.length ? buf : undefined;
  }
  return undefined;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function loadImages(s: Store, t: Template): Promise<Partial<Record<ImageSlot, Uint8Array>>> {
  const entries = await Promise.all(
    (Object.entries(t.images) as [ImageSlot, string][]).map(async ([slot, id]) => [slot, (await s.getImage(id))?.bytes] as const),
  );
  return Object.fromEntries(entries.filter(([, b]) => b));
}

export const api = new Hono<AppEnv>();

api.use('*', accessGuard);

api.onError((err, c) => {
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
  console.error(err);
  return c.json({ error: 'Internal error', detail: err.message }, 500);
});

api.get('/health', (c) => c.json({ ok: true }));

// Settings

api.get('/settings', async (c) => {
  const s = store(c);
  const [apple, google] = await Promise.all([s.getAppleSettings(), s.getGoogleSettings()]);
  let appleStatus: SettingsStatus['apple'] = null;
  if (apple) {
    const info = certInfo(apple.certPem);
    appleStatus = {
      teamId: apple.teamId,
      passTypeId: apple.passTypeId,
      certSubject: info.subject,
      certExpires: info.notAfter,
      apns: Boolean(c.env.APNS_CERT || (apple.apnsKeyId && apple.apnsKeyPem)),
      apnsKeyId: apple.apnsKeyId,
    };
  }
  const status: SettingsStatus = {
    apple: appleStatus,
    google: google ? { issuerId: google.issuerId, clientEmail: google.clientEmail } : null,
  };
  return c.json(status);
});

/**
 * multipart/form-data: p12 + p12Password | certPem + keyPem, wwdr, teamId, passTypeId, apnsKeyId, apnsKey (.p8).
 * Los campos omitidos conservan el valor guardado.
 */
api.put('/settings/apple', async (c) => {
  const s = store(c);
  const form = await c.req.parseBody();
  const prev = await s.getAppleSettings();
  const next: Partial<AppleSettings> = { ...prev };

  try {
    const p12 = await fileBytes(form.p12);
    if (p12) Object.assign(next, parseP12(p12, text(form.p12Password)));
    const cert = await fileBytes(form.cert);
    if (cert) next.certPem = certToPem(cert);
    const key = await fileBytes(form.key);
    if (key) next.keyPem = new TextDecoder().decode(key);
    const wwdr = await fileBytes(form.wwdr);
    if (wwdr) next.wwdrPem = certToPem(wwdr);
  } catch (e) {
    throw new ValidationError(`Could not read the certificate: ${e instanceof Error ? e.message : e}`);
  }
  const apnsKey = await fileBytes(form.apnsKey);
  if (apnsKey) next.apnsKeyPem = new TextDecoder().decode(apnsKey);
  if (text(form.apnsKeyId)) next.apnsKeyId = text(form.apnsKeyId);

  const fromCert = next.certPem ? passIdsFromCert(next.certPem) : {};
  next.teamId = text(form.teamId) || next.teamId || fromCert.teamId;
  next.passTypeId = text(form.passTypeId) || next.passTypeId || fromCert.passTypeId;

  const missing = (['teamId', 'passTypeId', 'certPem', 'keyPem', 'wwdrPem'] as const).filter((k) => !next[k]);
  if (missing.length) throw new ValidationError(`Missing Apple settings: ${missing.join(', ')}`);
  if (next.apnsKeyPem && !next.apnsKeyPem.includes('PRIVATE KEY')) throw new ValidationError('Invalid .p8 key');

  await s.putAppleSettings(next as AppleSettings);
  return c.json({ ok: true });
});

/** JSON: { issuerId, serviceAccount } (el JSON del service account como objeto o string). */
api.put('/settings/google', async (c) => {
  const body = await c.req.json<{ issuerId?: string; serviceAccount?: unknown }>();
  const issuerId = text(body.issuerId);
  let sa = body.serviceAccount;
  if (typeof sa === 'string') {
    try {
      sa = JSON.parse(sa);
    } catch {
      throw new ValidationError('The service account is not valid JSON');
    }
  }
  const { client_email, private_key } = (sa ?? {}) as { client_email?: string; private_key?: string };
  const prev = await store(c).getGoogleSettings();
  const next: GoogleSettings = {
    issuerId: issuerId || prev?.issuerId || '',
    clientEmail: client_email || prev?.clientEmail || '',
    privateKey: private_key || prev?.privateKey || '',
  };
  if (!/^\d+$/.test(next.issuerId)) throw new ValidationError('Invalid issuer ID');
  if (!next.clientEmail || !next.privateKey.includes('PRIVATE KEY')) throw new ValidationError('Incomplete service account');
  await store(c).putGoogleSettings(next);
  return c.json({ ok: true });
});

// Imágenes

api.post('/images', async (c) => {
  const form = await c.req.parseBody();
  const bytes = await fileBytes(form.file);
  if (!bytes) throw new ValidationError('File is required');
  if (bytes.length > MAX_IMAGE) throw new ValidationError('Image exceeds 2 MB');
  if (!PNG_SIG.every((b, i) => bytes[i] === b)) throw new ValidationError('Only PNG images are accepted');
  const meta = await store(c).putImage(randomToken(12), bytes, 'image/png');
  return c.json(meta, 201);
});

api.get('/images/:id', async (c) => {
  const img = await store(c).getImage(c.req.param('id'));
  if (!img) return c.json({ error: 'Not found' }, 404);
  return c.body(img.bytes, 200, { 'content-type': img.meta.contentType, 'cache-control': 'private, max-age=86400' });
});

// Plantillas

api.get('/templates', async (c) => c.json(await store(c).listTemplates()));

api.post('/templates', async (c) => {
  const input = parseTemplateInput(await c.req.json());
  const now = new Date().toISOString();
  const t: Template = { ...input, id: randomToken(9).replace(/[-_]/g, 'x'), createdAt: now, updatedAt: now };
  await store(c).putTemplate(t);
  return c.json(t, 201);
});

api.get('/templates/:id', async (c) => {
  const t = await store(c).getTemplate(c.req.param('id'));
  return t ? c.json(t) : c.json({ error: 'Not found' }, 404);
});

api.put('/templates/:id', async (c) => {
  const s = store(c);
  const prev = await s.getTemplate(c.req.param('id'));
  if (!prev) return c.json({ error: 'Not found' }, 404);
  const t: Template = { ...parseTemplateInput(await c.req.json()), id: prev.id, kind: prev.kind, createdAt: prev.createdAt, updatedAt: new Date().toISOString() };
  await s.putTemplate(t);
  return c.json(t);
});

api.delete('/templates/:id', async (c) => {
  const s = store(c);
  const id = c.req.param('id');
  if ((await s.listPasses()).some((p) => p.templateId === id)) {
    return c.json({ error: 'The template has issued passes' }, 409);
  }
  await s.deleteTemplate(id);
  return c.json({ ok: true });
});

/** Propaga la plantilla a todos sus pases (Google class/objects + push Apple). */
api.post('/templates/:id/publish', async (c) => c.json(await publishTemplate(ctxOf(c), c.req.param('id'))));

// Pases

api.get('/passes', async (c) => c.json(await store(c).listPasses()));

api.post('/passes', async (c) => {
  const s = store(c);
  const input = parsePassInput(await c.req.json());
  if (!(await s.getTemplate(input.templateId))) throw new ValidationError('Template not found');
  const now = new Date().toISOString();
  const pass: Pass = { ...input, serial: newSerial(), authToken: randomToken(24), createdAt: now, updatedAt: now, voided: false, google: { synced: false } };
  await s.putPass(pass);
  const sync = await syncPass(ctxOf(c), pass.serial);
  return c.json({ pass: await s.getPass(pass.serial), sync }, 201);
});

api.get('/passes/:serial', async (c) => {
  const p = await store(c).getPass(c.req.param('serial'));
  return p ? c.json(p) : c.json({ error: 'Not found' }, 404);
});

api.put('/passes/:serial', async (c) => {
  const s = store(c);
  const pass = await s.getPass(c.req.param('serial'));
  if (!pass) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json<{ holderName?: string; data?: unknown; voided?: boolean; notify?: boolean }>();
  if (body.holderName !== undefined) {
    const name = text(body.holderName);
    if (!name) throw new ValidationError('Holder name is required');
    pass.holderName = name.slice(0, 200);
  }
  if (body.data !== undefined) pass.data = parseData(body.data);
  if (typeof body.voided === 'boolean') pass.voided = body.voided;
  pass.updatedAt = new Date().toISOString();
  await s.putPass(pass);
  // notify: pide a Google la notificación de cambio de campo (saldo/nivel en loyalty).
  const sync = await syncPass(ctxOf(c), pass.serial, body.notify === true);
  return c.json({ pass: await s.getPass(pass.serial), sync });
});

api.get('/passes/:serial/pkpass', async (c) => {
  const s = store(c);
  const pass = await s.getPass(c.req.param('serial'));
  if (!pass) return c.json({ error: 'Not found' }, 404);
  const [tpl, apple] = await Promise.all([s.getTemplate(pass.templateId), s.getAppleSettings()]);
  if (!tpl) return c.json({ error: 'Template not found' }, 404);
  if (!apple) throw new ValidationError('Apple is not configured');
  const bytes = await buildPkpass(tpl, pass, apple, new URL(c.req.url).origin, await loadImages(s, tpl));
  return c.body(bytes, 200, {
    'content-type': 'application/vnd.apple.pkpass',
    'content-disposition': `attachment; filename="${pass.serial}.pkpass"`,
  });
});

api.get('/passes/:serial/google-link', async (c) => {
  const s = store(c);
  const pass = await s.getPass(c.req.param('serial'));
  if (!pass) return c.json({ error: 'Not found' }, 404);
  const [tpl, google] = await Promise.all([s.getTemplate(pass.templateId), s.getGoogleSettings()]);
  if (!tpl) return c.json({ error: 'Template not found' }, 404);
  if (!google) throw new ValidationError('Google is not configured');
  if (!pass.google.synced || !pass.google.objectId) throw new ValidationError('The pass is not synced with Google; retry the sync');
  return c.json({ url: await saveLink(google, tpl.kind, pass.google.objectId, [new URL(c.req.url).origin]) });
});

api.post('/passes/:serial/sync', async (c) => {
  const s = store(c);
  if (!(await s.getPass(c.req.param('serial')))) return c.json({ error: 'Not found' }, 404);
  return c.json(await syncPass(ctxOf(c), c.req.param('serial')));
});

// Notificaciones

api.get('/notifications', async (c) => c.json(await store(c).listNotifications()));

api.post('/notifications', async (c) => c.json(await sendNotification(ctxOf(c), parseNotificationInput(await c.req.json())), 201));

api.get('/notifications/:id', async (c) => {
  const n = await store(c).getNotification(c.req.param('id'));
  return n ? c.json(n) : c.json({ error: 'Not found' }, 404);
});

api.all('*', (c) => c.json({ error: 'Not found' }, 404));
