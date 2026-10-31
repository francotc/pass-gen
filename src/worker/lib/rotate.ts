import type { Env } from '../env';
import type { Template } from '../types';
import { Store } from './store';
import { applePush } from './sync';

/**
 * Cron diario: los pases Apple con OTP cambian de código a medianoche UTC. Se marcan como
 * actualizados y se avisa a los dispositivos, que descargan el pase con el código nuevo.
 * Google no lo necesita: su rotatingBarcode se genera en el teléfono.
 */
export async function rotateAppleOtp(env: Env): Promise<{ passes: number; sent: number; failed: number }> {
  const store = new Store(env.PASSGEN, env.ENCRYPTION_KEY);
  const apple = await store.getAppleSettings().catch(() => null);
  if (!apple) return { passes: 0, sent: 0, failed: 0 };

  const templates = new Map<string, Template | null>();
  const otpTemplate = async (id: string) => {
    if (!templates.has(id)) templates.set(id, await store.getTemplate(id));
    return templates.get(id)?.otp?.enabled === true;
  };

  const now = new Date().toISOString();
  const serials: string[] = [];
  for (const summary of await store.listPasses()) {
    if (summary.voided || !(await otpTemplate(summary.templateId))) continue;
    const pass = await store.getPass(summary.serial);
    if (!pass) continue;
    pass.updatedAt = now;
    await store.putPass(pass);
    serials.push(pass.serial);
  }
  if (!serials.length) return { passes: 0, sent: 0, failed: 0 };
  const res = await applePush({ env, store, origin: '' }, apple, serials);
  return { passes: serials.length, sent: res.sent, failed: res.failed };
}
