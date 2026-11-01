import type { Env } from '../env';
import type { AppleSettings, GoogleSettings, Pass, SyncResult, Template } from '../types';
import { pushUpdate } from './apple/apns';
import { passOtp } from './otp';
import {
  buildClass,
  buildObject,
  classResource,
  getAccessToken,
  objectId,
  objectResource,
  upsert,
  type ImageUrls,
} from './google/wallet';
import type { Store } from './store';

export interface Ctx {
  env: Env;
  store: Store;
  origin: string;
}

/** URLs públicas de imágenes (Google las descarga; solo funcionan con HTTPS). */
export function imageUrls(t: Template, origin: string): ImageUrls {
  if (!origin.startsWith('https://')) return {};
  const url = (id?: string) => (id ? `${origin}/public/images/${id}` : undefined);
  return {
    // Google muestra el logo en un círculo: preferir el recorte cuadrado.
    logo: url(t.images.logoSquare ?? t.images.logo ?? t.images.icon),
    hero: url(t.images.hero ?? t.images.strip),
    background: url(t.images.background),
    byId: url,
  };
}

async function googleUpsertObject(ctx: Ctx, token: string, gs: GoogleSettings, t: Template, p: Pass, notify = false) {
  const otp = await passOtp(ctx.env.ENCRYPTION_KEY, t, p.serial);
  const obj = buildObject(t, p, gs.issuerId, imageUrls(t, ctx.origin), otp);
  // Notificación de cambio de campo (saldo, nivel); el flag es efímero y solo existe en loyalty.
  if (notify && t.kind === 'loyalty') obj.notifyPreference = 'NOTIFY_ON_UPDATE';
  await upsert(token, objectResource(t.kind), obj);
  return String(obj.id);
}

export async function googleUpsertClass(token: string, gs: GoogleSettings, t: Template, origin: string) {
  await upsert(token, classResource(t.kind), buildClass(t, gs.issuerId, imageUrls(t, origin)));
}

export async function applePush(ctx: Ctx, as: AppleSettings, serials: string[]): Promise<SyncResult['apple']> {
  const devices = (await Promise.all(serials.map((s) => ctx.store.devicesForPass(as.passTypeId, s).then((d) => d.map((x) => ({ ...x, serial: s })))))).flat();
  if (!devices.length) return { sent: 0, failed: 0 };
  const res = await pushUpdate(as, [...new Set(devices.map((d) => d.pushToken))], { mtls: ctx.env.APNS_CERT });
  await Promise.all(
    devices.filter((d) => res.invalid.includes(d.pushToken)).map((d) => ctx.store.unregister(d.deviceId, as.passTypeId, d.serial)),
  );
  return { sent: res.sent, failed: res.failed, ...(res.errors.length ? { skipped: res.errors[0] } : {}) };
}

/**
 * Sincroniza un pase con Google (upsert de class + object) y avisa a los dispositivos Apple.
 * `notifyGoogle` pide a Google que notifique el cambio de campos permitidos (máx. 3 por pase cada 24 h).
 */
export async function syncPass(ctx: Ctx, serial: string, notifyGoogle = false): Promise<SyncResult> {
  const pass = await ctx.store.getPass(serial);
  if (!pass) throw new Error('Pass not found');
  const tpl = await ctx.store.getTemplate(pass.templateId);
  if (!tpl) throw new Error('Template not found');
  const [as, gs] = await Promise.all([ctx.store.getAppleSettings(), ctx.store.getGoogleSettings()]);

  const result: SyncResult = {
    apple: { sent: 0, failed: 0, skipped: as ? undefined : 'Apple not configured' },
    google: { ok: false, skipped: gs ? undefined : 'Google not configured' },
  };

  if (gs) {
    try {
      const token = await getAccessToken(gs);
      await googleUpsertClass(token, gs, tpl, ctx.origin);
      pass.google = { objectId: await googleUpsertObject(ctx, token, gs, tpl, pass, notifyGoogle), synced: true };
      result.google = { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      pass.google = { objectId: objectId(gs.issuerId, pass.serial), synced: false, error };
      result.google = { ok: false, error };
    }
    await ctx.store.putPass(pass);
  }

  if (as) {
    try {
      result.apple = await applePush(ctx, as, [serial]);
    } catch (e) {
      result.apple = { sent: 0, failed: 0, skipped: e instanceof Error ? e.message : String(e) };
    }
  }
  return result;
}

/** Republica una plantilla: marca todos sus pases como actualizados, sincroniza Google y hace push a Apple. */
export async function publishTemplate(ctx: Ctx, templateId: string): Promise<SyncResult & { passes: number }> {
  const tpl = await ctx.store.getTemplate(templateId);
  if (!tpl) throw new Error('Template not found');
  const [as, gs] = await Promise.all([ctx.store.getAppleSettings(), ctx.store.getGoogleSettings()]);
  const summaries = (await ctx.store.listPasses()).filter((p) => p.templateId === templateId);
  const now = new Date().toISOString();

  const result: SyncResult & { passes: number } = {
    passes: summaries.length,
    apple: { sent: 0, failed: 0, skipped: as ? undefined : 'Apple not configured' },
    google: { ok: false, skipped: gs ? undefined : 'Google not configured' },
  };

  let token: string | undefined;
  if (gs) {
    try {
      token = await getAccessToken(gs);
      await googleUpsertClass(token, gs, tpl, ctx.origin);
      result.google = { ok: true };
    } catch (e) {
      result.google = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  for (const s of summaries) {
    const pass = await ctx.store.getPass(s.serial);
    if (!pass) continue;
    pass.updatedAt = now;
    if (gs && token) {
      try {
        pass.google = { objectId: await googleUpsertObject(ctx, token, gs, tpl, pass), synced: true };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        pass.google = { ...pass.google, synced: false, error };
        result.google = { ok: false, error };
      }
    }
    await ctx.store.putPass(pass);
  }

  if (as) {
    try {
      result.apple = await applePush(ctx, as, summaries.map((s) => s.serial));
    } catch (e) {
      result.apple = { sent: 0, failed: 0, skipped: e instanceof Error ? e.message : String(e) };
    }
  }
  return result;
}
