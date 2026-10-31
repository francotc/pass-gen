import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideBell,
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
import { fromLocalInput, toLocalInput } from '../../core/dates';
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
  providers: [provideIcons({ lucideArrowLeft, lucideBell, lucideDownload, lucideCopy, lucideExternalLink, lucideRefreshCw, lucideSave })],
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <a routerLink="/passes" class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ng-icon name="lucideArrowLeft" /> Passes
        </a>
        <h1 class="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {{ pass()?.holderName ?? 'Pass' }}
          @if (pass()?.voided) {
            <span hlmBadge variant="destructive">Voided</span>
          }
        </h1>
        @if (pass(); as p) {
          <p class="text-muted-foreground font-mono text-xs">{{ p.serial }} · updated {{ p.updatedAt | date: 'dd.MM.yyyy HH:mm' }}</p>
        }
      </div>
    </header>

    @if (pass() && template()) {
      <div class="grid gap-8 xl:grid-cols-[minmax(0,28rem)_minmax(0,40rem)]">
        <div class="flex flex-col gap-6">
          <form hlmCard (ngSubmit)="save()">
            <div hlmCardHeader>
              <h2 hlmCardTitle>Pass details</h2>
              <p hlmCardDescription>Saving updates Google Wallet and notifies every iPhone that has the pass installed.</p>
            </div>
            <div hlmCardContent class="flex flex-col gap-4">
              <div class="flex flex-col gap-2">
                <label hlmLabel for="holder">Holder name</label>
                <input hlmInput id="holder" name="holder" required [(ngModel)]="holderName" />
              </div>
              @for (k of keys(); track k) {
                <div class="flex flex-col gap-2">
                  <label hlmLabel [for]="'data-' + k">{{ k }}</label>
                  <input hlmInput [id]="'data-' + k" [name]="'data-' + k" [(ngModel)]="data[k]" />
                </div>
              }
              @if (template()!.kind === 'loyalty') {
                <label class="flex items-center justify-between gap-3 text-sm" for="notify">
                  <span>
                    <span class="font-medium">Notify Google holders</span>
                    <span class="text-muted-foreground block text-xs">
                      Push when the balance changes (max 3 per pass every 24 h). Apple notifies fields that have a change message.
                    </span>
                  </span>
                  <hlm-switch id="notify" name="notify" [(ngModel)]="notify" />
                </label>
              }
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="validFrom">Valid from</label>
                  <input hlmInput id="validFrom" name="validFrom" type="datetime-local" [(ngModel)]="validFrom" />
                </div>
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="expiresAt">Expires</label>
                  <input hlmInput id="expiresAt" name="expiresAt" type="datetime-local" [(ngModel)]="expiresAt" />
                </div>
                <p class="text-muted-foreground text-xs sm:col-span-2">Empty uses the template dates.</p>
              </div>
                            <label class="flex items-center justify-between gap-3 text-sm" for="voided">
                <span>
                  <span class="font-medium">Void pass</span>
                  <span class="text-muted-foreground block text-xs">Marks it as invalid in both wallets.</span>
                </span>
                <hlm-switch id="voided" name="voided" [(ngModel)]="voided" />
              </label>
            </div>
            <div hlmCardFooter class="flex flex-wrap gap-2">
              <button hlmBtn type="submit" [disabled]="busy()"><ng-icon name="lucideSave" /> {{ busy() ? 'Saving…' : 'Save and update' }}</button>
              <button hlmBtn variant="outline" type="button" [disabled]="busy()" (click)="resync()"><ng-icon name="lucideRefreshCw" /> Retry sync</button>
              <a hlmBtn variant="ghost" routerLink="/notifications" [queryParams]="{ pass: pass()!.serial }"><ng-icon name="lucideBell" /> Send notification</a>
            </div>
          </form>

          @if (pass()!.message; as m) {
            <section hlmCard>
              <div hlmCardHeader>
                <h2 hlmCardTitle>Current Apple message</h2>
                <p hlmCardDescription>Sent {{ m.sentAt | date: 'dd.MM.yyyy HH:mm' }}. It stays on the pass until the next notification.</p>
              </div>
              <div hlmCardContent class="text-sm">
                <div class="font-medium">{{ m.header }}</div>
                <div class="text-muted-foreground whitespace-pre-line">{{ m.body }}</div>
              </div>
            </section>
          }

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>Deliver to holder</h2>
            </div>
            <div hlmCardContent class="flex flex-col gap-5">
              <div class="flex flex-col gap-2">
                <span class="text-sm font-medium">Holder page</span>
                <p class="text-muted-foreground text-xs">One link for both wallets: shows the right button on each phone and a QR code on desktop.</p>
                <div class="flex flex-wrap gap-2">
                  <a hlmBtn variant="outline" [href]="api.holderPageUrl(pass()!)" target="_blank" rel="noopener"><ng-icon name="lucideExternalLink" /> Open</a>
                  <button hlmBtn type="button" (click)="copy(api.holderPageUrl(pass()!))"><ng-icon name="lucideCopy" /> Copy holder link</button>
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <span class="text-sm font-medium">Apple Wallet</span>
                <div class="flex flex-wrap gap-2">
                  <a hlmBtn variant="outline" [href]="api.pkpassUrl(pass()!.serial)" download><ng-icon name="lucideDownload" /> Download .pkpass</a>
                  <button hlmBtn variant="outline" type="button" (click)="copy(api.publicPkpassUrl(pass()!))"><ng-icon name="lucideCopy" /> Copy public link</button>
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <span class="flex items-center gap-2 text-sm font-medium">
                  Google Wallet
                  @if (pass()!.google.synced) {
                    <span hlmBadge variant="secondary">Synced</span>
                  } @else if (pass()!.google.error) {
                    <span hlmBadge variant="destructive">Error</span>
                  } @else {
                    <span hlmBadge variant="outline">Pending</span>
                  }
                </span>
                @if (pass()!.google.error) {
                  <p class="text-destructive text-xs">{{ pass()!.google.error }}</p>
                }
                <div class="flex flex-wrap gap-2">
                  <button hlmBtn variant="outline" type="button" [disabled]="!pass()!.google.synced" (click)="openGoogle()"><ng-icon name="lucideExternalLink" /> Open link</button>
                  <button hlmBtn variant="outline" type="button" [disabled]="!pass()!.google.synced" (click)="copyGoogle()"><ng-icon name="lucideCopy" /> Copy link</button>
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
  protected validFrom = '';
  protected expiresAt = '';
  protected notify = false;

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
      await this.router.navigate(['/passes']);
    }
  }

  private apply(p: Pass) {
    this.pass.set(p);
    this.holderName = p.holderName;
    this.data = { ...p.data };
    this.voided = p.voided;
    this.validFrom = toLocalInput(p.validFrom);
    this.expiresAt = toLocalInput(p.expiresAt);
  }

  protected async save() {
    this.busy.set(true);
    try {
      const res = await this.api.updatePass(this.serial(), {
        holderName: this.holderName,
        data: this.data,
        voided: this.voided,
        notify: this.notify,
        // '' borra la fecha propia y vuelve a usar la de la plantilla.
        validFrom: fromLocalInput(this.validFrom) ?? '',
        expiresAt: fromLocalInput(this.expiresAt) ?? '',
      });
      this.apply(res.pass);
      const msg = syncMessage(res.sync);
      if (msg.ok) toast.success('Pass updated', { description: msg.text });
      else toast.warning('Pass saved with warnings', { description: msg.text });
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
      if (msg.ok) toast.success('Synced', { description: msg.text });
      else toast.warning('Synced with warnings', { description: msg.text });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
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
