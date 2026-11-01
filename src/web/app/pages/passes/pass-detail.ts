import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBan,
  lucideBell,
  lucideCircleCheck,
  lucideRotateCcw,
  lucideCopy,
  lucideDownload,
  lucideExternalLink,
  lucideRefreshCw,
  lucideSave,
  lucideSearch,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import type { Pass, SettingsStatus, Template } from '../../../../worker/types';
import { Api, errorMessage, type GoogleStatus } from '../../core/api.service';
import { syncMessage } from '../../core/sync-message';
import { keyLabel, placeholderKeys } from '../../core/template-utils';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { PageHeader } from '../../shared/page-header';
import { PassPreview } from '../../shared/pass-preview';

@Component({
  selector: 'app-pass-detail',
  imports: [
    FormsModule,
    RouterLink,
    DatePipe,
    NgIcon,
    PageHeader,
    ConfirmDialog,
    PassPreview,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSwitchImports,
  ],
  providers: [provideIcons({ lucideBan, lucideCircleCheck, lucideRotateCcw, lucideBell, lucideDownload, lucideCopy, lucideExternalLink, lucideRefreshCw, lucideSave, lucideSearch })],
  template: `
    <app-page-header [title]="pass()?.holderName ?? 'Pass'" [back]="{ link: '/passes', label: 'Passes' }">
      @if (pass(); as p) {
        <p meta class="text-muted-foreground flex flex-wrap items-center gap-2 font-mono text-xs">
          @if (p.voided) {
            <span hlmBadge variant="destructive" class="font-sans">Voided</span>
          }
          {{ p.serial }} · updated {{ p.updatedAt | date: 'dd.MM.yyyy HH:mm' }}
        </p>
      }
      @if (pass(); as p) {
        <a hlmBtn variant="outline" routerLink="/notifications" [queryParams]="{ pass: p.serial }"><ng-icon name="lucideBell" /> Send notification</a>
      }
      @if (pass(); as p) {
        @if (p.voided) {
          <button hlmBtn variant="outline" type="button" [disabled]="busy()" (click)="setVoided(false)"><ng-icon name="lucideRotateCcw" /> Reactivate</button>
        } @else {
          <button hlmBtn variant="destructive" type="button" [disabled]="busy()" (click)="voidConfirm.open()"><ng-icon name="lucideBan" /> Void pass</button>
        }
      }
    </app-page-header>
    <app-confirm
      #voidConfirm
      title="Void this pass?"
      description="It shows as invalid in Apple Wallet and Google Wallet and its code stops working. You can reactivate it later."
      confirmLabel="Void pass"
      [destructive]="true"
      (confirmed)="setVoided(true)"
    />

    @if (pass() && template()) {
      @if (justIssued()) {
        <div class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4" role="status">
          <div class="flex items-center gap-2 text-sm">
            <ng-icon name="lucideCircleCheck" class="text-emerald-600 dark:text-emerald-400" />
            <span><span class="font-medium">Pass issued.</span> Send the holder link so they can add it to their wallet.</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <a hlmBtn variant="outline" size="sm" [href]="api.holderPageUrl(pass()!)" target="_blank" rel="noopener"><ng-icon name="lucideExternalLink" /> Open</a>
            <button hlmBtn size="sm" type="button" (click)="copy(api.holderPageUrl(pass()!))"><ng-icon name="lucideCopy" /> Copy holder link</button>
          </div>
        </div>
      }

      <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,40rem)]">
        <div class="flex min-w-0 flex-col gap-6">
          <section hlmCard aria-labelledby="deliver-title">
            <div hlmCardHeader>
              <h2 hlmCardTitle id="deliver-title">Deliver to holder</h2>
              <p hlmCardDescription>One link for both wallets: it shows the right button on each phone and a QR code on desktop.</p>
            </div>
            <div hlmCardContent class="flex flex-col gap-5">
              <div class="flex flex-wrap gap-2">
                <button hlmBtn type="button" (click)="copy(api.holderPageUrl(pass()!))"><ng-icon name="lucideCopy" /> Copy holder link</button>
                <a hlmBtn variant="outline" [href]="api.holderPageUrl(pass()!)" target="_blank" rel="noopener"><ng-icon name="lucideExternalLink" /> Open holder page</a>
              </div>
              <div class="border-border flex flex-col gap-2 border-t pt-4">
                <span class="text-sm font-medium">Apple Wallet</span>
                @if (settings() && !settings()!.apple) {
                  <p class="text-muted-foreground text-[13px] leading-snug">Apple Wallet isn't set up yet. <a routerLink="/settings" class="text-foreground underline">Add your certificate in Settings</a>.</p>
                } @else {
                  <div class="flex flex-wrap gap-2">
                    <a hlmBtn variant="outline" size="sm" [href]="api.pkpassUrl(pass()!.serial)" download><ng-icon name="lucideDownload" /> Download .pkpass</a>
                    <button hlmBtn variant="outline" size="sm" type="button" (click)="copy(api.publicPkpassUrl(pass()!))"><ng-icon name="lucideCopy" /> Copy download link</button>
                  </div>
                }
              </div>
              <div class="border-border flex flex-col gap-2 border-t pt-4">
                <span class="flex items-center gap-2 text-sm font-medium">
                  Google Wallet
                  @if (pass()!.google.synced) {
                    <span hlmBadge variant="secondary">Synced</span>
                  } @else if (pass()!.google.error) {
                    <span hlmBadge variant="destructive">Error</span>
                  } @else if (settings()?.google) {
                    <span hlmBadge variant="outline">Not synced</span>
                  }
                </span>
                @if (settings() && !settings()!.google) {
                  <p class="text-muted-foreground text-[13px] leading-snug">Google Wallet isn't set up yet. <a routerLink="/settings" class="text-foreground underline">Add your issuer in Settings</a>.</p>
                } @else {
                  @if (pass()!.google.error) {
                    <p class="text-destructive text-[13px] leading-snug">{{ pass()!.google.error }}</p>
                  } @else if (!pass()!.google.synced) {
                    <p class="text-muted-foreground text-[13px] leading-snug">Google doesn't have this pass yet. Use “Retry sync” below.</p>
                  }
                  <div class="flex flex-wrap gap-2">
                    @if (pass()!.google.synced) {
                      <button hlmBtn variant="outline" size="sm" type="button" (click)="openGoogle()"><ng-icon name="lucideExternalLink" /> Open save link</button>
                      <button hlmBtn variant="outline" size="sm" type="button" (click)="copyGoogle()"><ng-icon name="lucideCopy" /> Copy save link</button>
                    }
                    <button hlmBtn variant="ghost" size="sm" type="button" [disabled]="checking()" (click)="checkGoogle()"><ng-icon name="lucideSearch" /> {{ checking() ? 'Checking…' : 'Check what Google has' }}</button>
                  </div>
                  @if (googleStatus(); as g) {
                    <div class="bg-muted flex flex-col gap-1 rounded-md p-3 text-[13px]" role="status">
                      @if (!g.exists) {
                        <span>Google has no object for this pass yet. Use “Retry sync”.</span>
                      } @else {
                        <span>State: {{ g.state }} · Saved by a user: {{ g.hasUsers ? 'yes' : 'no' }}</span>
                        @if (g.rotatingBarcode; as rb) {
                          <span>Rotating code: {{ rb.type }} · every {{ rb.periodSeconds }} s · {{ rb.valuePattern }}</span>
                        } @else if (g.otpEnabledInTemplate) {
                          <span class="text-destructive">OTP is on in the template but Google still has a static code. Use “Retry sync”.</span>
                        }
                        @if (g.barcode; as b) {
                          <span>Static code: {{ b.type }} · {{ b.value }}</span>
                        }
                        @if (g.smartTap) {
                          <span>Smart Tap (NFC) is on: Google hides the code behind “Show code”.</span>
                        }
                      }
                    </div>
                  }
                }
              </div>
            </div>
          </section>

          <form hlmCard (ngSubmit)="save()" aria-labelledby="details-title">
            <div hlmCardHeader>
              <h2 hlmCardTitle id="details-title">Pass details</h2>
              <p hlmCardDescription>Saving updates Google Wallet and every iPhone that has the pass installed.</p>
            </div>
            <div hlmCardContent class="flex flex-col gap-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="holder">Holder name</label>
                  <input hlmInput id="holder" name="holder" required [(ngModel)]="holderName" />
                </div>
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="email">Holder email</label>
                  <input hlmInput id="email" name="email" type="email" placeholder="Optional" [(ngModel)]="email" />
                </div>
                @for (k of keys(); track k) {
                  <div class="flex flex-col gap-2">
                    <label hlmLabel [for]="'data-' + k">{{ label(k) }}</label>
                    <input hlmInput [id]="'data-' + k" [name]="'data-' + k" [(ngModel)]="data[k]" />
                  </div>
                }
              </div>
              @if (template()!.kind === 'loyalty') {
                <label class="flex items-center justify-between gap-3 text-sm" for="notify">
                  <span>
                    <span class="font-medium">Notify Google holders of this change</span>
                    <span class="text-muted-foreground block text-[13px] leading-snug">
                      Sends a push when the balance changes (max 3 per pass a day). iPhones are notified for fields with a change message.
                    </span>
                  </span>
                  <hlm-switch inputId="notify" name="notify" [(ngModel)]="notify" />
                </label>
              }
            </div>
            <div hlmCardFooter class="flex flex-wrap gap-2">
              <button hlmBtn type="submit" [disabled]="busy()"><ng-icon name="lucideSave" /> {{ busy() ? 'Saving…' : 'Save and update' }}</button>
              <button hlmBtn variant="outline" type="button" [disabled]="busy()" (click)="resync()"><ng-icon name="lucideRefreshCw" /> Retry sync</button>
            </div>
          </form>
        </div>

        <div class="flex min-w-0 flex-col gap-6">
          <app-pass-preview [template]="template()!" [holderName]="holderName" [data]="data" [serial]="pass()!.serial" />

          <section hlmCard aria-labelledby="installs-title">
            <div hlmCardHeader>
              <h2 hlmCardTitle id="installs-title">Installs</h2>
              <p hlmCardDescription>iPhones report when they add or remove the pass; Google reports saves and removals (published site only).</p>
            </div>
            <div hlmCardContent class="flex flex-col gap-4 text-sm">
              <dl class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div class="flex items-baseline justify-between gap-2 sm:flex-col sm:justify-start">
                  <dt class="text-muted-foreground text-[13px]">Apple devices</dt>
                  <dd class="text-lg font-semibold tabular-nums">{{ installs().appleDevices }}</dd>
                </div>
                <div class="flex items-baseline justify-between gap-2 sm:flex-col sm:justify-start">
                  <dt class="text-muted-foreground text-[13px]">Google Wallet</dt>
                  <dd class="text-lg font-semibold whitespace-nowrap">{{ installs().googleSaved ? 'Saved' : 'Not saved' }}</dd>
                </div>
                <div class="flex items-baseline justify-between gap-2 sm:flex-col sm:justify-start">
                  <dt class="text-muted-foreground text-[13px]">Google saves / removals</dt>
                  <dd class="text-lg font-semibold tabular-nums">{{ installs().googleSaves }} / {{ installs().googleDeletes }}</dd>
                </div>
              </dl>
              @if (installs().events.length) {
                <ul class="border-border flex flex-col divide-y rounded-md border" aria-label="Recent install events">
                  @for (e of installs().events; track $index) {
                    <li class="flex justify-between gap-2 px-3 py-1.5">
                      <span>{{ e.platform === 'apple' ? 'Apple Wallet' : 'Google Wallet' }} · {{ e.type === 'added' ? 'Added' : 'Removed' }}</span>
                      <span class="text-muted-foreground">{{ e.at | date: 'dd.MM.yyyy HH:mm' }}</span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-muted-foreground">No install events yet.</p>
              }
            </div>
          </section>

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
        </div>
      </div>
    }
  `,
})
export class PassDetail implements OnInit {
  protected readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly justIssued = signal(inject(ActivatedRoute).snapshot.queryParamMap.has('issued'));
  protected readonly settings = signal<SettingsStatus | null>(null);

  /** Route param. */
  readonly serial = input.required<string>();

  protected readonly pass = signal<Pass | null>(null);
  protected readonly installs = computed(
    () => this.pass()?.installs ?? { appleDevices: 0, googleSaved: false, googleSaves: 0, googleDeletes: 0, events: [] },
  );
  protected readonly template = signal<Template | null>(null);
  protected readonly busy = signal(false);
  protected holderName = '';
  protected email = '';
  protected data: Record<string, string> = {};
  protected notify = false;

  protected label(k: string) {
    const t = this.template();
    return t ? keyLabel(t, k) : k;
  }

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
      this.api.settings().then((st) => this.settings.set(st), () => undefined);
    } catch (e) {
      toast.error(errorMessage(e));
      await this.router.navigate(['/passes']);
    }
  }

  private apply(p: Pass) {
    this.pass.set(p);
    this.holderName = p.holderName;
    this.email = p.email ?? '';
    this.data = { ...p.data };
  }

  protected async save() {
    this.busy.set(true);
    try {
      const res = await this.api.updatePass(this.serial(), {
        holderName: this.holderName,
        email: this.email.trim(),
        data: this.data,
        notify: this.notify,
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

  protected async setVoided(voided: boolean) {
    this.busy.set(true);
    try {
      const res = await this.api.updatePass(this.serial(), { voided });
      this.apply(res.pass);
      toast.success(voided ? 'Pass voided' : 'Pass reactivated', { description: syncMessage(res.sync).text });
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

  protected readonly googleStatus = signal<GoogleStatus | null>(null);
  protected readonly checking = signal(false);

  protected async checkGoogle() {
    this.checking.set(true);
    try {
      this.googleStatus.set(await this.api.googleStatus(this.serial()));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.checking.set(false);
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
