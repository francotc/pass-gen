import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideCircleCheck, lucideCircleX, lucideKeyRound, lucidePlugZap, lucideShieldCheck, lucideTriangleAlert } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import type { SettingsStatus } from '../../../../worker/types';
import { Api, errorMessage } from '../../core/api.service';
import { FilePicker } from '../../shared/file-picker';
import { PageHeader } from '../../shared/page-header';

type AppleFile = 'p12' | 'cert' | 'key' | 'wwdr' | 'apnsKey';

@Component({
  selector: 'app-settings',
  imports: [
    FormsModule,
    DatePipe,
    NgIcon,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmLabelImports,
    HlmTextareaImports,
    PageHeader,
    FilePicker,
  ],
  providers: [provideIcons({ lucideShieldCheck, lucideKeyRound, lucideCircleAlert, lucideCircleCheck, lucideCircleX, lucidePlugZap, lucideTriangleAlert })],
  template: `
    <app-page-header title="Settings" description="Apple Wallet and Google Wallet credentials. They are stored encrypted on the server and never shown again.">
      <button hlmBtn variant="outline" type="button" [disabled]="testing() || (!status()?.apple && !status()?.google)" (click)="test()">
        <ng-icon name="lucidePlugZap" /> {{ testing() ? 'Testing…' : 'Test connection' }}
      </button>
    </app-page-header>

    @if (checks(); as ch) {
      <div class="mb-6 grid gap-3 sm:grid-cols-2" role="status" aria-live="polite">
        @for (c of [{ name: 'Apple Wallet', r: ch.apple }, { name: 'Google Wallet', r: ch.google }]; track c.name) {
          <div
            class="flex items-start gap-2 rounded-lg border p-3 text-sm"
            [class]="c.r.ok ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-destructive/30 bg-destructive/10'"
          >
            <ng-icon [name]="c.r.ok ? 'lucideCircleCheck' : 'lucideCircleX'" class="mt-0.5 shrink-0" [class]="c.r.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'" />
            <span><span class="font-medium">{{ c.name }}:</span> {{ c.r.detail }}</span>
          </div>
        }
      </div>
    }

    @if (expiry(); as e) {
      @if (e.days <= 60) {
        <div
          role="alert"
          class="mb-6 flex items-start gap-2 rounded-lg border p-3 text-sm"
          [class]="e.days <= 30 ? 'border-destructive/30 bg-destructive/10' : 'border-amber-500/30 bg-amber-500/10'"
        >
          <ng-icon name="lucideTriangleAlert" class="mt-0.5 shrink-0" />
          <span>
            @if (e.days < 0) {
              <span class="font-medium">The Apple certificate expired on {{ e.date | date: 'dd.MM.yyyy' }}.</span> New passes can't be signed
              and existing ones stop updating. Renew it in the Apple Developer portal and upload the new .p12 below.
            } @else {
              <span class="font-medium">The Apple certificate expires in {{ e.days }} day{{ e.days === 1 ? '' : 's' }} ({{ e.date | date: 'dd.MM.yyyy' }}).</span>
              Renew it in the Apple Developer portal and upload the new .p12 below before then.
            }
          </span>
        </div>
      }
    }

    <div class="grid items-start gap-6 lg:grid-cols-2">
      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Apple Wallet</h2>
          <p hlmCardDescription>Pass Type ID certificate, WWDR and push (APNs).</p>
          <div hlmCardAction>
            @if (status()?.apple) {
              <span hlmBadge variant="secondary"><ng-icon name="lucideShieldCheck" /> Configured</span>
            } @else {
              <span hlmBadge variant="outline">Not configured</span>
            }
          </div>
        </div>
        <form hlmCardContent class="flex flex-col gap-4" (ngSubmit)="saveApple()">
          @if (status()?.apple; as a) {
            <dl class="bg-muted grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md p-3 text-sm">
              <dt class="text-muted-foreground">Pass Type ID</dt>
              <dd class="truncate">{{ a.passTypeId }}</dd>
              <dt class="text-muted-foreground">Team ID</dt>
              <dd>{{ a.teamId }}</dd>
              <dt class="text-muted-foreground">Certificate</dt>
              <dd class="truncate">{{ a.certSubject }}</dd>
              <dt class="text-muted-foreground">Expires</dt>
              <dd class="flex items-center gap-2">
                {{ a.certExpires | date: 'dd.MM.yyyy' }}
                @if (expiry(); as e) {
                  @if (e.days <= 60) {
                    <span hlmBadge [variant]="e.days <= 30 ? 'destructive' : 'outline'">{{ e.days < 0 ? 'Expired' : e.days + ' days left' }}</span>
                  }
                }
              </dd>
              <dt class="text-muted-foreground">Push</dt>
              <dd>{{ a.apns ? 'Configured' + (a.apnsKeyId ? ' (key ' + a.apnsKeyId + ')' : ' (mTLS)') : 'Not configured' }}</dd>
            </dl>
          }

          <div class="flex flex-col gap-2">
            <label hlmLabel for="p12">Pass Type ID certificate (.p12)</label>
            <app-file-picker inputId="p12" accept=".p12,.pfx" (picked)="pick('p12', $event)" />
          </div>
          <div class="flex flex-col gap-2">
            <label hlmLabel for="p12pw">.p12 password</label>
            <input hlmInput id="p12pw" type="password" name="p12Password" autocomplete="off" [(ngModel)]="p12Password" />
          </div>
          <details class="text-sm">
            <summary class="text-muted-foreground cursor-pointer">Use PEM certificate and key instead of a .p12</summary>
            <div class="mt-3 flex flex-col gap-3">
              <div class="flex flex-col gap-2">
                <label hlmLabel for="cert">Certificate (.pem / .cer)</label>
                <app-file-picker inputId="cert" accept=".pem,.cer,.crt" (picked)="pick('cert', $event)" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="key">Private key (.pem, unencrypted)</label>
                <app-file-picker inputId="key" accept=".pem,.key" (picked)="pick('key', $event)" />
              </div>
            </div>
          </details>
          <div class="flex flex-col gap-2">
            <label hlmLabel for="wwdr">Apple WWDR certificate (G4, .cer or .pem)</label>
            <app-file-picker inputId="wwdr" accept=".pem,.cer,.crt" (picked)="pick('wwdr', $event)" />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="team">Team ID</label>
              <input hlmInput id="team" name="teamId" placeholder="Read from the certificate" [(ngModel)]="teamId" />
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="ptid">Pass Type ID</label>
              <input hlmInput id="ptid" name="passTypeId" placeholder="pass.com.example" [(ngModel)]="passTypeId" />
            </div>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="apnsKey">APNs key (.p8)</label>
              <app-file-picker inputId="apnsKey" accept=".p8" (picked)="pick('apnsKey', $event)" />
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="kid">APNs key ID</label>
              <input hlmInput id="kid" name="apnsKeyId" placeholder="ABC123DEFG" [(ngModel)]="apnsKeyId" />
            </div>
          </div>
          <p class="text-muted-foreground text-[13px] leading-snug">
            Empty fields keep the saved value. Push can also use the certificate over mTLS (see README).
          </p>
          <div>
            <button hlmBtn type="submit" [disabled]="savingApple()">{{ savingApple() ? 'Saving…' : 'Save Apple' }}</button>
          </div>
        </form>
      </section>

      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Google Wallet</h2>
          <p hlmCardDescription>Issuer ID and a service account with access to the Google Wallet API.</p>
          <div hlmCardAction>
            @if (status()?.google) {
              <span hlmBadge variant="secondary"><ng-icon name="lucideShieldCheck" /> Configured</span>
            } @else {
              <span hlmBadge variant="outline">Not configured</span>
            }
          </div>
        </div>
        <form hlmCardContent class="flex flex-col gap-4" (ngSubmit)="saveGoogle()">
          @if (status()?.google; as g) {
            <dl class="bg-muted grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md p-3 text-sm">
              <dt class="text-muted-foreground">Issuer ID</dt>
              <dd>{{ g.issuerId }}</dd>
              <dt class="text-muted-foreground">Service account</dt>
              <dd class="truncate">{{ g.clientEmail }}</dd>
            </dl>
          }
          <div class="flex flex-col gap-2">
            <label hlmLabel for="issuer">Issuer ID</label>
            <input hlmInput id="issuer" name="issuerId" inputmode="numeric" placeholder="3388000000012345678" [(ngModel)]="issuerId" />
          </div>
          <div class="flex flex-col gap-2">
            <label hlmLabel for="sa">Service account JSON</label>
            <app-file-picker inputId="saFile" accept=".json,application/json" (picked)="pickServiceAccount($event)" />
            <textarea hlmTextarea id="sa" name="serviceAccount" rows="5" class="font-mono text-xs" placeholder='{"type": "service_account", ...}' [(ngModel)]="serviceAccount"></textarea>
          </div>
          <div>
            <button hlmBtn type="submit" [disabled]="savingGoogle()">{{ savingGoogle() ? 'Saving…' : 'Save Google' }}</button>
          </div>
        </form>
      </section>

      <section hlmAlert class="lg:col-span-2">
        <ng-icon name="lucideCircleAlert" />
        <h3 hlmAlertTitle>Cloudflare Access</h3>
        <div hlmAlertDescription>
          <p>
            Protect the app with an Access application and add a <strong>Bypass</strong> policy for
            <code>/v1/*</code> (iPhones update their passes with the pass token) and <code>/public/*</code> (holder page, pass
            download, images for Google and Google's save/remove callbacks).
          </p>
        </div>
      </section>
    </div>
  `,
})
export class Settings implements OnInit {
  private readonly api = inject(Api);

  protected readonly status = signal<SettingsStatus | null>(null);
  protected readonly savingApple = signal(false);
  protected readonly savingGoogle = signal(false);

  private files: Partial<Record<AppleFile, File>> = {};
  protected p12Password = '';
  protected teamId = '';
  protected passTypeId = '';
  protected apnsKeyId = '';
  protected issuerId = '';
  protected serviceAccount = '';

  ngOnInit() {
    this.load();
  }

  private async load() {
    try {
      this.status.set(await this.api.settings());
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  protected pick(kind: AppleFile, file: File | null) {
    if (file) this.files[kind] = file;
    else delete this.files[kind];
  }

  protected async pickServiceAccount(file: File | null) {
    this.serviceAccount = file ? await file.text() : '';
  }

  protected readonly testing = signal(false);
  protected readonly checks = signal<{ apple: { ok: boolean; detail: string }; google: { ok: boolean; detail: string } } | null>(null);

  protected async test() {
    this.testing.set(true);
    try {
      this.checks.set(await this.api.testSettings());
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.testing.set(false);
    }
  }

  /** Días hasta el vencimiento del certificado de Apple. */
  protected readonly expiry = computed(() => {
    const exp = this.status()?.apple?.certExpires;
    if (!exp) return null;
    return { date: exp, days: Math.floor((Date.parse(exp) - Date.now()) / 86_400_000) };
  });

  protected async saveApple() {
    const form = new FormData();
    for (const [k, f] of Object.entries(this.files)) form.set(k, f);
    if (this.p12Password) form.set('p12Password', this.p12Password);
    if (this.teamId) form.set('teamId', this.teamId);
    if (this.passTypeId) form.set('passTypeId', this.passTypeId);
    if (this.apnsKeyId) form.set('apnsKeyId', this.apnsKeyId);
    this.savingApple.set(true);
    try {
      await this.api.saveApple(form);
      toast.success('Apple credentials saved');
      this.p12Password = '';
      await this.load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.savingApple.set(false);
    }
  }

  protected async saveGoogle() {
    this.savingGoogle.set(true);
    try {
      await this.api.saveGoogle({ issuerId: this.issuerId || this.status()?.google?.issuerId || '', serviceAccount: this.serviceAccount || undefined });
      toast.success('Google credentials saved');
      this.serviceAccount = '';
      await this.load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.savingGoogle.set(false);
    }
  }
}
