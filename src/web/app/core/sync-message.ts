import type { SyncResult } from '../../../worker/types';

/** Resumen legible del resultado de sincronizar con Apple y Google. */
export function syncMessage(r: SyncResult): { ok: boolean; text: string } {
  const parts: string[] = [];
  let ok = true;
  if (r.google.skipped) parts.push(r.google.skipped);
  else if (r.google.ok) parts.push('Google updated');
  else {
    ok = false;
    parts.push(`Google: ${r.google.error}`);
  }
  if (r.apple.skipped && !r.apple.sent && !r.apple.failed) parts.push(r.apple.skipped.startsWith('Apple') ? r.apple.skipped : `Apple: ${r.apple.skipped}`);
  else if (r.apple.sent || r.apple.failed) {
    parts.push(`Apple: ${r.apple.sent} device(s) notified${r.apple.failed ? `, ${r.apple.failed} failed` : ''}`);
    if (r.apple.failed) ok = false;
  } else parts.push('Apple: no registered devices');
  return { ok, text: parts.join(' · ') };
}
