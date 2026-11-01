import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideKeyRound, lucideShieldCheck } from '@ng-icons/lucide';
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
  ],
  providers: [provideIcons({ lucideShieldCheck, lucideKeyRound, lucideCircleAlert })],
  template: `
    <header class="mb-6 flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
      <p class="text-muted-foreground text-sm">
        Apple Wallet and Google Wallet credentials. They are stored encrypted on the server and never shown again.
      </p>
    </header>

    <div class="grid max-w-5xl gap-6 lg:grid-cols-2">
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
              <dd>{{ a.certExpires | date: 'dd.MM.yyyy' }}</dd>
              <dt class="text-muted-foreground">Push</dt>
              <dd>{{ a.apns ? 'Configured' + (a.apnsKeyId ? ' (key ' + a.apnsKeyId + ')' : ' (mTLS)') : 'Not configured' }}</dd>
            </dl>
          }

          <div class="flex flex-col gap-2">
            <label hlmLabel for="p12">Pass Type ID certificate (.p12)</label>
            <input hlmInput id="p12" type="file" accept=".p12,.pfx" (change)="pick('p12', $event)" />
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
                <input hlmInput id="cert" type="file" accept=".pem,.cer,.crt" (change)="pick('cert', $event)" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="key">Private key (.pem, unencrypted)</label>
                <input hlmInput id="key" type="file" accept=".pem,.key" (change)="pick('key', $event)" />
              </div>
            </div>
          </details>
          <div class="flex flex-col gap-2">
            <label hlmLabel for="wwdr">Apple WWDR certificate (G4, .cer or .pem)</label>
            <input hlmInput id="wwdr" type="file" accept=".pem,.cer,.crt" (change)="pick('wwdr', $event)" />
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
              <input hlmInput id="apnsKey" type="file" accept=".p8" (change)="pick('apnsKey', $event)" />
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
            <input hlmInput id="saFile" type="file" accept=".json,application/json" aria-label="Service account JSON file" (change)="pickServiceAccount($event)" />
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
            <code>/v1/*</code> (Apple web service: iPhones authenticate with the pass token) and
            <code>/public/*</code> (images for Google and the holder's .pkpass download).
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

  protected pick(kind: AppleFile, ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (file) this.files[kind] = file;
    else delete this.files[kind];
  }

  protected async pickServiceAccount(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.serviceAccount = await file.text();
  }

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
