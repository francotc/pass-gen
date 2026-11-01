import qrcode from 'qrcode-generator';
import type { Pass, Template } from '../types';

export type Device = 'ios' | 'android' | 'other';

export function detectDevice(userAgent: string): Device {
  if (/iPhone|iPad|iPod|Macintosh.*Mobile/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  return svg.replace('<svg ', '<svg role="img" aria-label="QR code to open this page on your phone" ');
}

export interface HolderPageInput {
  template: Template;
  pass: Pass;
  pageUrl: string;
  /** Descarga del .pkpass; undefined si Apple no está configurado. */
  appleUrl?: string;
  /** Link "Save to Google Wallet"; undefined si no está disponible. */
  googleUrl?: string;
  /** Hay SVG oficial de Google en /public/badges. */
  googleBadge: boolean;
  logoUrl?: string;
  device: Device;
  /** Google está configurado pero el pase todavía no se sincronizó. */
  googlePending?: boolean;
  /** Motivo por el que el pase no se puede agregar (anulado, vencido). */
  unavailable?: string;
}

/**
 * Página pública para que el titular agregue su pase. Se sirve desde el Worker (sin el SPA)
 * para que cargue rápido en el teléfono. Muestra solo el botón de la plataforma del dispositivo;
 * en computadora muestra ambos y un QR para abrirla en el teléfono.
 */
export function renderHolderPage(i: HolderPageInput): string {
  const t = i.template;
  const showApple = i.appleUrl && i.device !== 'android';
  const showGoogle = i.googleUrl && i.device !== 'ios';
  const appleButton = showApple
    ? `<a class="badge" href="${esc(i.appleUrl!)}"><img src="/public/badges/add-to-apple-wallet.svg" alt="Add to Apple Wallet" height="48"></a>`
    : '';
  const googleButton = showGoogle
    ? i.googleBadge
      ? `<a class="badge" href="${esc(i.googleUrl!)}"><img src="/public/badges/add-to-google-wallet.svg" alt="Add to Google Wallet" height="48"></a>`
      : `<a class="badge google" href="${esc(i.googleUrl!)}">Add to Google Wallet</a>`
    : '';
  const none = !showApple && !showGoogle;
  const pendingGoogle = i.googlePending && i.device !== 'ios' ? '<p class="note">Google Wallet will be available here shortly. Try again in a few minutes.</p>' : '';
  const qr =
    i.device === 'other'
      ? `<div class="qr">${qrSvg(i.pageUrl)}<p><strong>On your phone?</strong> Scan this code with the camera. It opens this page and shows the right button for your iPhone or Android.</p></div>
         ${none ? '' : '<p class="or">Or add it from this computer</p>'}`
      : '';
  const body = i.unavailable
    ? `<p class="note">${esc(i.unavailable)}</p>`
    : `${qr}<div class="actions">${appleButton}${googleButton}</div>
       ${pendingGoogle}
       ${none && !pendingGoogle ? '<p class="note">This pass is not available for your device yet.</p>' : ''}`;
  const initial = (t.organizationName.match(/[\p{L}\p{N}]/u)?.[0] ?? '').toUpperCase();
  const logo = i.logoUrl ? `<img src="${esc(i.logoUrl)}" alt="">` : initial ? `<span class="mono" aria-hidden="true">${esc(initial)}</span>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(t.organizationName)} · ${esc(t.name)}</title>
<style>
:root{color-scheme:light dark;--bg:#fafafa;--fg:#0a0a0a;--muted:#737373;--card:${esc(t.colors.background)};--card-fg:${esc(t.colors.foreground)}}
@media (prefers-color-scheme:dark){:root{--bg:#0a0a0a;--fg:#fafafa;--muted:#a3a3a3}}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:380px;display:flex;flex-direction:column;gap:24px;align-items:center;text-align:center}
.card{width:100%;border-radius:20px;padding:20px;background:var(--card);color:var(--card-fg);text-align:left;box-shadow:0 10px 30px rgba(0,0,0,.15)}
.card header{display:flex;align-items:center;gap:10px;font-weight:600}.card img{height:32px;max-width:96px;object-fit:contain}
.card .name{margin-top:28px;font-size:22px;font-weight:600}.card .sub{opacity:.75;font-size:14px}
h1{margin:0;font-size:20px}.note{margin:0;color:var(--muted);font-size:14px}
.actions{display:flex;flex-direction:column;gap:12px;align-items:center}
.badge{display:inline-flex;min-height:48px;align-items:center}.badge img{height:48px;width:auto}
.badge.google{padding:0 20px;border-radius:999px;background:#000;color:#fff;text-decoration:none;font-weight:500}
.qr{display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--muted);font-size:14px;max-width:300px}.qr p{margin:0}.qr strong{color:var(--fg)}.qr svg{width:180px;height:180px;background:#fff;border-radius:12px}
.or{margin:0;color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.06em}
.card .mono{display:inline-flex;width:32px;height:32px;border-radius:50%;align-items:center;justify-content:center;background:rgba(255,255,255,.15);font-size:15px}
</style>
</head>
<body>
<main>
  <div class="card">
    <header>${logo}<span>${esc(t.organizationName)}</span></header>
    <div class="name">${esc(i.pass.holderName)}</div>
    <div class="sub">${esc(t.google.programName || t.name)}</div>
  </div>
  <h1>Add your card to your wallet</h1>
  ${body}
</main>
</body>
</html>`;
}
