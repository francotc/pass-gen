import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideNfc } from '@ng-icons/lucide';
import { render } from '../../../worker/lib/render';
import type { Field, TemplateInput } from '../../../worker/types';
import { Api } from '../core/api.service';

interface RenderedField {
  key: string;
  label: string;
  value: string;
}

/** Vista previa aproximada del pase en Apple Wallet y Google Wallet. */
@Component({
  selector: 'app-pass-preview',
  template: `
    <div class="grid gap-6 sm:grid-cols-2">
      <figure class="flex flex-col gap-2">
        <figcaption class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Apple Wallet{{ poster() ? ' · poster (iOS 27+)' : '' }}
        </figcaption>
        <div
          class="flex aspect-[1/1.3] w-full max-w-80 flex-col overflow-hidden rounded-2xl bg-cover bg-center shadow-lg"
          [style.background-color]="t().colors.background"
          [style.background-image]="poster() && background() ? 'url(' + background() + ')' : null"
          [style.color]="t().colors.foreground"
        >
          <div class="flex items-start justify-between gap-3 p-3">
            <div class="flex min-w-0 items-center gap-2">
              @if (logo()) {
                <img [src]="logo()" alt="" class="h-8 max-w-24 object-contain" />
              }
              <span class="truncate text-sm font-semibold">{{ r(t().logoText) }}</span>
            </div>
            @for (f of fields().headerFields; track f.key) {
              <div class="text-right">
                <div class="text-[10px] font-semibold uppercase" [style.color]="t().colors.label">{{ f.label }}</div>
                <div class="text-base leading-tight">{{ f.value }}</div>
              </div>
            }
          </div>
          <div class="relative min-h-24">
            @if (t().kind === 'loyalty' && strip()) {
              <img [src]="strip()" alt="" class="absolute inset-0 size-full object-cover" />
            }
            <div class="relative flex flex-col gap-1 p-3">
              @for (f of fields().primaryFields; track f.key) {
                <div>
                  <div class="text-[10px] font-semibold uppercase" [style.color]="t().colors.label">{{ f.label }}</div>
                  <div class="text-3xl leading-tight font-light">{{ f.value }}</div>
                </div>
              }
            </div>
          </div>
          <div class="flex flex-wrap gap-x-5 gap-y-2 px-3 pb-2">
            @for (f of secondaryRow(); track f.key) {
              <div class="min-w-0">
                <div class="text-[10px] font-semibold uppercase" [style.color]="t().colors.label">{{ f.label }}</div>
                <div class="truncate text-sm">{{ f.value }}</div>
              </div>
            }
          </div>
          <div class="mt-auto flex flex-col items-center gap-1 p-3">
            @if (nfcEnabled()) {
              <span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase" [style.color]="t().colors.label">
                <ng-icon name="lucideNfc" /> Hold near reader
              </span>
            }
            @if (t().barcode.message) {
              <div class="rounded-md bg-white p-2">
                <ng-container *ngTemplateOutlet="code" />
              </div>
              @if (t().barcode.altText) {
                <span class="text-[10px]">{{ r(t().barcode.altText ?? '') }}</span>
              }
            }
          </div>
        </div>
      </figure>

      <figure class="flex flex-col gap-2">
        <figcaption class="text-muted-foreground text-xs font-medium tracking-wide uppercase">Google Wallet</figcaption>
        <div
          class="flex w-full max-w-80 flex-col overflow-hidden rounded-3xl shadow-lg"
          [style.background]="t().colors.background"
          [style.color]="googleText()"
        >
          <div class="flex items-center gap-2 p-4">
            <span class="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90">
              @if (logo()) {
                <img [src]="logo()" alt="" class="size-full object-cover" />
              }
            </span>
            <span class="truncate text-sm">{{ t().google.issuerName || t().organizationName }}</span>
            @if (nfcEnabled()) {
              <ng-icon name="lucideNfc" class="ml-auto shrink-0" aria-label="Smart Tap enabled" />
            }
          </div>
          <div class="px-4 pb-3">
            @if (t().kind === 'loyalty') {
              <div class="text-lg font-medium">{{ t().google.programName || t().name }}</div>
              <div class="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                @if (lead(); as l) {
                  <div>
                    <div class="text-[11px] opacity-80">{{ l.label }}</div>
                    <div class="text-base">{{ l.value }}</div>
                  </div>
                }
                <div>
                  <div class="text-[11px] opacity-80">Holder</div>
                  <div class="text-base">{{ holderName() || 'Holder name' }}</div>
                </div>
              </div>
            } @else {
              <div class="text-xs opacity-80">{{ t().organizationName || t().name }}</div>
              <div class="text-xl font-medium">{{ lead()?.value || holderName() || 'Holder name' }}</div>
              @if (lead(); as l) {
                <div class="text-xs opacity-80">{{ l.label }}</div>
              }
            }
          </div>
          @if (t().barcode.message) {
            <div class="flex flex-col items-center gap-1 px-4 pb-4">
              <div class="rounded-xl bg-white p-3">
                <ng-container *ngTemplateOutlet="code" />
              </div>
              @if (t().barcode.altText) {
                <span class="text-[11px]">{{ r(t().barcode.altText ?? '') }}</span>
              }
            </div>
          }
          @if (hero()) {
            <img [src]="hero()" alt="" class="aspect-[1032/336] w-full object-cover" />
          }
        </div>
        @if (buttonLabel(); as label) {
          <span class="border-border inline-flex max-w-80 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium">{{ label }}</span>
        }
        @if (links().length) {
          <ul class="flex max-w-80 flex-col gap-1 text-xs">
            @for (l of links(); track $index) {
              <li class="text-primary truncate underline underline-offset-2">{{ r(l.label) || r(l.url) }}</li>
            }
          </ul>
        }
        @if (!poster() && background()) {
          <img [src]="background()" alt="" class="w-full max-w-80 rounded-xl object-cover" />
        }
        @if (googleModules().length) {
          <dl class="text-muted-foreground mt-1 grid max-w-80 gap-1 text-xs">
            @for (m of googleModules(); track m.key) {
              <div class="flex gap-2">
                <dt class="font-medium">{{ m.label }}:</dt>
                <dd class="truncate">{{ m.value }}</dd>
              </div>
            }
          </dl>
        }
      </figure>
    </div>

    <ng-template #code>
      @if (t().barcode.format === 'QR' || t().barcode.format === 'AZTEC') {
        <svg viewBox="0 0 21 21" class="size-24" role="img" [attr.aria-label]="t().barcode.format + ' barcode'">
          @for (c of qrCells; track $index) {
            <rect [attr.x]="c[0]" [attr.y]="c[1]" width="1" height="1" fill="#000" />
          }
        </svg>
      } @else {
        <svg viewBox="0 0 60 16" class="h-12 w-40" role="img" [attr.aria-label]="t().barcode.format + ' barcode'">
          @for (b of bars; track $index) {
            <rect [attr.x]="b[0]" y="0" [attr.width]="b[1]" height="16" fill="#000" />
          }
        </svg>
      }
    </ng-template>
  `,
  imports: [NgTemplateOutlet, NgIcon],
  providers: [provideIcons({ lucideNfc })],
})
export class PassPreview {
  private readonly api = inject(Api);

  readonly template = input.required<TemplateInput>();
  readonly holderName = input('');
  readonly data = input<Record<string, string>>({});
  readonly serial = input('SERIAL0001');

  protected readonly t = this.template;

  // Sin computed: los formularios mutan los objetos en lugar de reemplazarlos.
  protected r(s: string) {
    return render(s, { ...this.data(), holderName: this.holderName() || 'Holder name', serial: this.serial() });
  }

  private renderFields(fs: Field[]): RenderedField[] {
    return fs.map((f) => ({ key: f.key, label: this.r(f.label), value: this.r(f.value) }));
  }

  protected fields() {
    const t = this.t();
    return {
      headerFields: this.renderFields(t.headerFields),
      primaryFields: this.renderFields(t.primaryFields),
      secondaryFields: this.renderFields(t.secondaryFields),
      auxiliaryFields: this.renderFields(t.auxiliaryFields),
      backFields: this.renderFields(t.backFields),
    };
  }

  protected secondaryRow() {
    const f = this.fields();
    return [...f.secondaryFields, ...f.auxiliaryFields];
  }

  protected lead(): RenderedField | undefined {
    const f = this.fields();
    return [...f.headerFields, ...f.primaryFields][0];
  }

  protected googleModules(): RenderedField[] {
    const f = this.fields();
    const rest = [...f.headerFields, ...f.primaryFields].slice(1);
    return [...rest, ...f.secondaryFields, ...f.auxiliaryFields, ...f.backFields].filter((m) => m.value);
  }

  /** Plantillas guardadas antes de soportar NFC no tienen `nfc`. */
  protected nfcEnabled() {
    return this.t().nfc?.enabled ?? false;
  }

  private img(id?: string) {
    return id ? this.api.imageUrl(id) : undefined;
  }
  protected logo() {
    return this.img(this.t().images.logo ?? this.t().images.icon);
  }
  protected strip() {
    return this.img(this.t().images.strip);
  }
  // Plantillas viejas no tienen `actions` ni `background`.
  protected buttonLabel() {
    return this.t().actions?.button?.label;
  }
  protected links() {
    return this.t().actions?.links ?? [];
  }
  protected poster() {
    return this.t().background?.poster ?? false;
  }
  protected background() {
    return this.img(this.t().images.background);
  }
  protected hero() {
    return this.img(this.t().images.hero ?? this.t().images.strip);
  }

  /** Google elige texto claro u oscuro según el fondo. */
  protected googleText() {
    const hex = this.t().colors.background.replace('#', '');
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    const n = parseInt(full, 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#1f1f1f' : '#ffffff';
  }

  // Patrones fijos decorativos: no codifican el mensaje real.
  protected readonly qrCells = buildQrCells();
  protected readonly bars = buildBars();
}


function buildQrCells(): [number, number][] {
  const cells: [number, number][] = [];
  const finder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        if (edge || core) cells.push([ox + x, oy + y]);
      }
  };
  finder(0, 0);
  finder(14, 0);
  finder(0, 14);
  let seed = 7;
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      const inFinder = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
      seed = (seed * 9301 + 49297) % 233280;
      if (!inFinder && seed / 233280 > 0.55) cells.push([x, y]);
    }
  return cells;
}

function buildBars(): [number, number][] {
  const bars: [number, number][] = [];
  let x = 0;
  let seed = 3;
  while (x < 58) {
    seed = (seed * 9301 + 49297) % 233280;
    const w = 0.5 + (seed % 3) * 0.6;
    bars.push([x, w]);
    x += w + 0.6 + (seed % 2) * 0.5;
  }
  return bars;
}
