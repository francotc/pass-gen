import type { NotificationInput, NotificationRecord, NotificationResult, Pass, PassMessage, Template } from '../types';
import { randomToken } from './crypto';
import { DEFAULT_LANGUAGE } from './i18n';
import { addMessage, classId, classResource, getAccessToken, localizedString, objectResource, type GoogleMessage } from './google/wallet';
import { passVars, render } from './render';
import { applePush, googleUpsertClass, type Ctx } from './sync';
import { ValidationError } from './validate';

const MAX_ERRORS = 20;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function resolveTargets(ctx: Ctx, input: NotificationInput): Promise<{ template: Template; passes: Pass[] }> {
  if (input.target.type === 'pass') {
    const pass = await ctx.store.getPass(input.target.serial);
    if (!pass) throw new ValidationError('Pass not found');
    const template = await ctx.store.getTemplate(pass.templateId);
    if (!template) throw new ValidationError('Template not found');
    return { template, passes: [pass] };
  }
  const { templateId } = input.target;
  const template = await ctx.store.getTemplate(templateId);
  if (!template) throw new ValidationError('Template not found');
  const serials = (await ctx.store.listPasses()).filter((p) => p.templateId === templateId && !p.voided).map((p) => p.serial);
  const passes = (await Promise.all(serials.map((s) => ctx.store.getPass(s)))).filter((p): p is Pass => p !== null);
  return { template, passes };
}

/** Mensaje de Google con placeholders resueltos para `vars` (vacío para mensajes de class). */
function googleMessage(input: NotificationInput, id: string, vars: Record<string, string>, language: string): GoogleMessage {
  const r = (s: string) => render(s, vars);
  const body = input.link ? `${r(input.body)}\n${input.link}` : r(input.body);
  const { displayStart, displayEnd } = input.google;
  const tr = input.translations;
  return {
    id,
    header: r(input.header),
    body,
    messageType: input.google.notify ? 'TEXT_AND_NOTIFY' : 'TEXT',
    ...(tr.length
      ? {
          localizedHeader: localizedString(r(input.header), tr.map((t) => ({ language: t.language, value: r(t.header) })), language),
          localizedBody: localizedString(
            body,
            tr.map((t) => ({ language: t.language, value: input.link ? `${r(t.body)}\n${input.link}` : r(t.body) })),
            language,
          ),
        }
      : {}),
    ...(displayStart || displayEnd
      ? { displayInterval: { ...(displayStart ? { start: { date: displayStart } } : {}), ...(displayEnd ? { end: { date: displayEnd } } : {}) } }
      : {}),
  };
}

/**
 * Envía un mensaje a uno o varios pases.
 * Apple: actualiza el campo de mensaje del pase (con changeMessage) y hace push; el iPhone muestra la notificación.
 * Google: addMessage en cada object o una vez en la class; TEXT_AND_NOTIFY además dispara un push.
 */
export async function sendNotification(ctx: Ctx, input: NotificationInput): Promise<NotificationRecord> {
  const { template, passes } = await resolveTargets(ctx, input);
  const language = template.localization?.language || DEFAULT_LANGUAGE;
  const [as, gs] = await Promise.all([ctx.store.getAppleSettings(), ctx.store.getGoogleSettings()]);
  const id = randomToken(9).replace(/[-_]/g, 'x');
  const now = new Date().toISOString();
  const result: NotificationResult = {
    passes: passes.length,
    apple: { updated: 0, sent: 0, failed: 0 },
    google: { sent: 0, failed: 0, errors: [] },
  };
  const googleError = (msg: string) => {
    result.google.failed++;
    if (result.google.errors.length < MAX_ERRORS) result.google.errors.push(msg);
  };

  if (input.apple.enabled) {
    if (!as) result.apple.skipped = 'Apple not configured';
    else {
      for (const pass of passes) {
        const vars = passVars(pass);
        const header = render(input.header, vars);
        const message: PassMessage = {
          notificationId: id,
          header,
          body: render(input.body, vars),
          ...(input.link ? { link: input.link } : {}),
          placement: input.apple.placement,
          changeMessage: render(input.apple.changeMessage, { ...vars, header }),
          sentAt: now,
          ...(input.translations.length
            ? { translations: input.translations.map((t) => ({ language: t.language, header: render(t.header, vars), body: render(t.body, vars) })) }
            : {}),
        };
        pass.message = message;
        pass.updatedAt = now;
        await ctx.store.putPass(pass);
        result.apple.updated++;
      }
      try {
        const push = await applePush(ctx, as, passes.map((p) => p.serial));
        result.apple.sent = push.sent;
        result.apple.failed = push.failed;
        if (push.skipped) result.apple.skipped = push.skipped;
      } catch (e) {
        result.apple.skipped = errorText(e);
      }
    }
  }

  if (input.google.enabled) {
    if (!gs) result.google.skipped = 'Google not configured';
    else {
      try {
        const token = await getAccessToken(gs);
        if (input.google.scope === 'class') {
          // La class tiene que existir antes de recibir mensajes.
          await googleUpsertClass(token, gs, template, ctx.origin);
          await addMessage(token, classResource(template.kind), classId(gs.issuerId, template.id), googleMessage(input, id, {}, language));
          result.google.sent = 1;
        } else {
          for (const pass of passes) {
            if (!pass.google.synced || !pass.google.objectId) {
              googleError(`${pass.serial}: not synced with Google`);
              continue;
            }
            try {
              await addMessage(token, objectResource(template.kind), pass.google.objectId, googleMessage(input, id, passVars(pass), language));
              result.google.sent++;
            } catch (e) {
              googleError(`${pass.serial}: ${errorText(e)}`);
            }
          }
        }
      } catch (e) {
        googleError(errorText(e));
      }
    }
  }

  const record: NotificationRecord = { ...input, id, createdAt: now, result };
  await ctx.store.putNotification(record);
  return record;
}
