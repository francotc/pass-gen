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
      <h1 class="text-2xl font-semibold tracking-tight">Ajustes</h1>
      <p class="text-muted-foreground text-sm">
        Credenciales de Apple Wallet y Google Wallet. Se guardan cifradas en el servidor y nunca se vuelven a mostrar.
      </p>
    </header>

    <div class="grid max-w-5xl gap-6 lg:grid-cols-2">
      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Apple Wallet</h2>
          <p hlmCardDescription>Certificado del Pass Type ID, WWDR y push (APNs).</p>
          <div hlmCardAction>
            @if (status()?.apple) {
              <span hlmBadge variant="secondary"><ng-icon name="lucideShieldCheck" /> Configurado</span>
            } @else {
              <span hlmBadge variant="outline">Sin configurar</span>
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
              <dt class="text-muted-foreground">Certificado</dt>
              <dd class="truncate">{{ a.certSubject }}</dd>
              <dt class="text-muted-foreground">Vence</dt>
              <dd>{{ a.certExpires | date: 'dd.MM.yyyy' }}</dd>
              <dt class="text-muted-foreground">Push</dt>
              <dd>{{ a.apns ? 'Configurado' + (a.apnsKeyId ? ' (clave ' + a.apnsKeyId + ')' : ' (mTLS)') : 'Sin configurar' }}</dd>
            </dl>
          }

          <div class="flex flex-col gap-2">
            <label hlmLabel for="p12">Certificado .p12 del Pass Type ID</label>
            <input hlmInput id="p12" type="file" accept=".p12,.pfx" (change)="pick('p12', $event)" />
          </div>
          <div class="flex flex-col gap-2">
            <label hlmLabel for="p12pw">Contraseña del .p12</label>
            <input hlmInput id="p12pw" type="password" name="p12Password" autocomplete="off" [(ngModel)]="p12Password" />
          </div>
          <details class="text-sm">
            <summary class="text-muted-foreground cursor-pointer">Usar certificado y clave en PEM en lugar del .p12</summary>
            <div class="mt-3 flex flex-col gap-3">
              <div class="flex flex-col gap-2">
                <label hlmLabel for="cert">Certificado (.pem / .cer)</label>
                <input hlmInput id="cert" type="file" accept=".pem,.cer,.crt" (change)="pick('cert', $event)" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="key">Clave privada (.pem, sin contraseña)</label>
                <input hlmInput id="key" type="file" accept=".pem,.key" (change)="pick('key', $event)" />
              </div>
            </div>
          </details>
          <div class="flex flex-col gap-2">
            <label hlmLabel for="wwdr">Certificado WWDR de Apple (G4, .cer o .pem)</label>
            <input hlmInput id="wwdr" type="file" accept=".pem,.cer,.crt" (change)="pick('wwdr', $event)" />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="team">Team ID</label>
              <input hlmInput id="team" name="teamId" placeholder="Se lee del certificado" [(ngModel)]="teamId" />
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="ptid">Pass Type ID</label>
              <input hlmInput id="ptid" name="passTypeId" placeholder="pass.com.ejemplo" [(ngModel)]="passTypeId" />
            </div>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="apnsKey">Clave APNs (.p8)</label>
              <input hlmInput id="apnsKey" type="file" accept=".p8" (change)="pick('apnsKey', $event)" />
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="kid">Key ID de la clave APNs</label>
              <input hlmInput id="kid" name="apnsKeyId" placeholder="ABC123DEFG" [(ngModel)]="apnsKeyId" />
            </div>
          </div>
          <p class="text-muted-foreground text-xs">
            Los campos vacíos conservan el valor guardado. El push también puede usar el certificado por mTLS (ver README).
          </p>
          <div>
            <button hlmBtn type="submit" [disabled]="savingApple()">{{ savingApple() ? 'Guardando…' : 'Guardar Apple' }}</button>
          </div>
        </form>
      </section>

      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Google Wallet</h2>
          <p hlmCardDescription>Issuer ID y service account con acceso a la Google Wallet API.</p>
          <div hlmCardAction>
            @if (status()?.google) {
              <span hlmBadge variant="secondary"><ng-icon name="lucideShieldCheck" /> Configurado</span>
            } @else {
              <span hlmBadge variant="outline">Sin configurar</span>
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
            <label hlmLabel for="sa">JSON del service account</label>
            <input hlmInput id="saFile" type="file" accept=".json,application/json" aria-label="Archivo JSON del service account" (change)="pickServiceAccount($event)" />
            <textarea hlmTextarea id="sa" name="serviceAccount" rows="5" class="font-mono text-xs" placeholder='{"type": "service_account", ...}' [(ngModel)]="serviceAccount"></textarea>
          </div>
          <div>
            <button hlmBtn type="submit" [disabled]="savingGoogle()">{{ savingGoogle() ? 'Guardando…' : 'Guardar Google' }}</button>
          </div>
        </form>
      </section>

      <section hlmAlert class="lg:col-span-2">
        <ng-icon name="lucideCircleAlert" />
        <h3 hlmAlertTitle>Cloudflare Access</h3>
        <div hlmAlertDescription>
          <p>
            Protegé la app con una aplicación de Access y agregá una política <strong>Bypass</strong> para
            <code>/v1/*</code> (web service de Apple: los iPhone se autentican con el token del pase) y
            <code>/public/*</code> (imágenes para Google y descarga del .pkpass por el titular).
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
      toast.success('Credenciales de Apple guardadas');
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
      toast.success('Credenciales de Google guardadas');
      this.serviceAccount = '';
      await this.load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.savingGoogle.set(false);
    }
  }
}
