import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCopy,
  lucideDownload,
  lucideExternalLink,
  lucideRefreshCw,
  lucideSave,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import type { Pass, Template } from '../../../../worker/types';
import { Api, errorMessage } from '../../core/api.service';
import { syncMessage } from '../../core/sync-message';
import { placeholderKeys } from '../../core/template-utils';
import { PassPreview } from '../../shared/pass-preview';

@Component({
  selector: 'app-pass-detail',
  imports: [
    FormsModule,
    RouterLink,
    DatePipe,
    NgIcon,
    PassPreview,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSwitchImports,
  ],
  providers: [provideIcons({ lucideArrowLeft, lucideDownload, lucideCopy, lucideExternalLink, lucideRefreshCw, lucideSave })],
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <a routerLink="/pases" class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ng-icon name="lucideArrowLeft" /> Pases
        </a>
        <h1 class="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {{ pass()?.holderName ?? 'Pase' }}
          @if (pass()?.voided) {
            <span hlmBadge variant="destructive">Anulado</span>
          }
        </h1>
        @if (pass(); as p) {
          <p class="text-muted-foreground font-mono text-xs">{{ p.serial }} · actualizado {{ p.updatedAt | date: 'dd.MM.yyyy HH:mm' }}</p>
        }
      </div>
    </header>

    @if (pass() && template()) {
      <div class="grid gap-8 xl:grid-cols-[minmax(0,28rem)_minmax(0,40rem)]">
        <div class="flex flex-col gap-6">
          <form hlmCard (ngSubmit)="save()">
            <div hlmCardHeader>
              <h2 hlmCardTitle>Datos del pase</h2>
              <p hlmCardDescription>Al guardar se actualiza en Google Wallet y se avisa a los iPhone que lo tengan instalado.</p>
            </div>
            <div hlmCardContent class="flex flex-col gap-4">
              <div class="flex flex-col gap-2">
                <label hlmLabel for="holder">Nombre del titular</label>
                <input hlmInput id="holder" name="holder" required [(ngModel)]="holderName" />
              </div>
              @for (k of keys(); track k) {
                <div class="flex flex-col gap-2">
                  <label hlmLabel [for]="'data-' + k">{{ k }}</label>
                  <input hlmInput [id]="'data-' + k" [name]="'data-' + k" [(ngModel)]="data[k]" />
                </div>
              }
              <label class="flex items-center justify-between gap-3 text-sm" for="voided">
                <span>
                  <span class="font-medium">Anular pase</span>
                  <span class="text-muted-foreground block text-xs">Lo marca como inválido en ambas wallets.</span>
                </span>
                <hlm-switch id="voided" name="voided" [(ngModel)]="voided" />
              </label>
            </div>
            <div hlmCardFooter class="flex flex-wrap gap-2">
              <button hlmBtn type="submit" [disabled]="busy()"><ng-icon name="lucideSave" /> {{ busy() ? 'Guardando…' : 'Guardar y actualizar' }}</button>
              <button hlmBtn variant="outline" type="button" [disabled]="busy()" (click)="resync()"><ng-icon name="lucideRefreshCw" /> Reintentar sincronización</button>
            </div>
          </form>

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>Entregar al titular</h2>
            </div>
            <div hlmCardContent class="flex flex-col gap-5">
              <div class="flex flex-col gap-2">
                <span class="text-sm font-medium">Apple Wallet</span>
                <div class="flex flex-wrap gap-2">
                  <a hlmBtn variant="outline" [href]="api.pkpassUrl(pass()!.serial)" download><ng-icon name="lucideDownload" /> Descargar .pkpass</a>
                  <button hlmBtn variant="outline" type="button" (click)="copy(api.publicPkpassUrl(pass()!))"><ng-icon name="lucideCopy" /> Copiar link público</button>
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <span class="flex items-center gap-2 text-sm font-medium">
                  Google Wallet
                  @if (pass()!.google.synced) {
                    <span hlmBadge variant="secondary">Sincronizado</span>
                  } @else if (pass()!.google.error) {
                    <span hlmBadge variant="destructive">Error</span>
                  } @else {
                    <span hlmBadge variant="outline">Pendiente</span>
                  }
                </span>
                @if (pass()!.google.error) {
                  <p class="text-destructive text-xs">{{ pass()!.google.error }}</p>
                }
                <div class="flex flex-wrap gap-2">
                  <button hlmBtn variant="outline" type="button" [disabled]="!pass()!.google.synced" (click)="openGoogle()"><ng-icon name="lucideExternalLink" /> Abrir link</button>
                  <button hlmBtn variant="outline" type="button" [disabled]="!pass()!.google.synced" (click)="copyGoogle()"><ng-icon name="lucideCopy" /> Copiar link</button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <app-pass-preview [template]="template()!" [holderName]="holderName" [data]="data" [serial]="pass()!.serial" />
      </div>
    }
  `,
})
export class PassDetail implements OnInit {
  protected readonly api = inject(Api);
  private readonly router = inject(Router);

  /** Route param. */
  readonly serial = input.required<string>();

  protected readonly pass = signal<Pass | null>(null);
  protected readonly template = signal<Template | null>(null);
  protected readonly busy = signal(false);
  protected holderName = '';
  protected data: Record<string, string> = {};
  protected voided = false;

  protected keys() {
    const t = this.template();
    if (!t) return [];
    // Incluye datos guardados que la plantilla ya no usa, para no perderlos al editar.
    return [...new Set([...placeholderKeys(t), ...Object.keys(this.pass()?.data ?? {})])];
  }

  async ngOnInit() {
    try {
      const p = await this.api.pass(this.serial());
      this.apply(p);
      this.template.set(await this.api.template(p.templateId));
    } catch (e) {
      toast.error(errorMessage(e));
      await this.router.navigate(['/pases']);
    }
  }

  private apply(p: Pass) {
    this.pass.set(p);
    this.holderName = p.holderName;
    this.data = { ...p.data };
    this.voided = p.voided;
  }

  protected async save() {
    this.busy.set(true);
    try {
      const res = await this.api.updatePass(this.serial(), { holderName: this.holderName, data: this.data, voided: this.voided });
      this.apply(res.pass);
      const msg = syncMessage(res.sync);
      if (msg.ok) toast.success('Pase actualizado', { description: msg.text });
      else toast.warning('Pase guardado con avisos', { description: msg.text });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async resync() {
    this.busy.set(true);
    try {
      const msg = syncMessage(await this.api.syncPass(this.serial()));
      this.pass.set(await this.api.pass(this.serial()));
      if (msg.ok) toast.success('Sincronizado', { description: msg.text });
      else toast.warning('Sincronización con avisos', { description: msg.text });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar el link');
    }
  }

  protected async openGoogle() {
    try {
      const { url } = await this.api.googleLink(this.serial());
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  protected async copyGoogle() {
    try {
      const { url } = await this.api.googleLink(this.serial());
      await this.copy(url);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
}
