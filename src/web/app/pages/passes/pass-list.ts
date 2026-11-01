import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheck, lucideCircleX, lucidePlus, lucideScanLine, lucideSearch, lucideTicket } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import type { OtpVerifyResult } from '../../../../worker/types';
import { Api, errorMessage, type PassSummary, type TemplateSummary } from '../../core/api.service';

@Component({
  selector: 'app-pass-list',
  imports: [FormsModule, RouterLink, DatePipe, NgIcon, HlmBadgeImports, HlmButtonImports, HlmInputImports, HlmLabelImports, HlmSkeletonImports, HlmTableImports],
  providers: [provideIcons({ lucidePlus, lucideSearch, lucideTicket, lucideScanLine, lucideCircleCheck, lucideCircleX })],
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold tracking-tight">Passes</h1>
        <p class="text-muted-foreground text-sm">Passes issued for Apple Wallet and Google Wallet.</p>
      </div>
      <a hlmBtn routerLink="/passes/new"><ng-icon name="lucidePlus" /> Issue pass</a>
    </header>

    <form class="border-border mb-6 flex max-w-4xl flex-col gap-3 rounded-lg border p-4" (ngSubmit)="verify()">
      <div class="flex flex-col gap-1">
        <label hlmLabel for="otpValue" class="flex items-center gap-2"><ng-icon name="lucideScanLine" /> Verify code</label>
        <p class="text-muted-foreground text-xs">Paste or scan an OTP barcode (SERIAL.CODE) to check that it is valid right now.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <input
          hlmInput
          id="otpValue"
          name="otpValue"
          class="min-w-0 flex-1 font-mono"
          autocomplete="off"
          placeholder="ABC123XYZ789.01234567"
          [ngModel]="otpValue()"
          (ngModelChange)="otpValue.set($event); otpResult.set(null)"
        />
        <button hlmBtn type="submit" [disabled]="!otpValue().trim() || verifying()">{{ verifying() ? 'Checking…' : 'Verify' }}</button>
      </div>
      @if (otpResult(); as r) {
        <div
          role="status"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
          [class]="r.valid ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'"
        >
          <ng-icon [name]="r.valid ? 'lucideCircleCheck' : 'lucideCircleX'" />
          @if (r.valid) {
            Valid · {{ r.holderName }} · {{ r.serial }} · {{ r.platform === 'apple' ? 'Apple Wallet' : 'Google Wallet' }}
          } @else {
            {{ r.reason }}{{ r.holderName ? ' · ' + r.holderName : '' }}
          }
        </div>
      }
    </form>

    @if (loading()) {
      <div class="flex max-w-4xl flex-col gap-2">
        <hlm-skeleton class="h-10 w-full" />
        <hlm-skeleton class="h-10 w-full" />
        <hlm-skeleton class="h-10 w-full" />
      </div>
    } @else if (!passes().length) {
      <div class="border-border flex max-w-4xl flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <ng-icon name="lucideTicket" class="text-muted-foreground text-3xl" />
        <p class="font-medium">No passes issued yet</p>
        <p class="text-muted-foreground text-sm">
          @if (templates().size) {
            Pick a template and fill in the holder details.
          } @else {
            Create a template first and set up your credentials in Settings.
          }
        </p>
        @if (templates().size) {
          <a hlmBtn variant="outline" routerLink="/passes/new">Issue pass</a>
        } @else {
          <a hlmBtn variant="outline" routerLink="/templates/new">Create template</a>
        }
      </div>
    } @else {
      <div class="flex max-w-4xl flex-col gap-3">
        <dl class="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Installation stats">
          @for (s of stats(); track s.label) {
            <div class="border-border flex flex-col gap-1 rounded-lg border p-3">
              <dt class="text-muted-foreground text-xs">{{ s.label }}</dt>
              <dd class="text-2xl font-semibold tabular-nums">{{ s.value }}</dd>
              <dd class="text-muted-foreground text-xs">{{ s.hint }}</dd>
            </div>
          }
        </dl>
        <div class="relative max-w-sm">
          <ng-icon name="lucideSearch" class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" />
          <input hlmInput type="search" class="w-full pl-8" placeholder="Search by holder or serial" aria-label="Search passes" [(ngModel)]="query" />
        </div>
        <div hlmTableContainer>
          <table hlmTable>
            <thead hlmTHead>
              <tr hlmTr>
                <th hlmTh>Holder</th>
                <th hlmTh>Serial</th>
                <th hlmTh>Template</th>
                <th hlmTh>Status</th>
                <th hlmTh>Installed</th>
                <th hlmTh>Updated</th>
              </tr>
            </thead>
            <tbody hlmTBody>
              @for (p of filtered(); track p.serial) {
                <tr hlmTr>
                  <td hlmTd>
                    <a class="font-medium hover:underline" [routerLink]="['/passes', p.serial]">{{ p.holderName }}</a>
                  </td>
                  <td hlmTd class="font-mono text-xs">{{ p.serial }}</td>
                  <td hlmTd>{{ templates().get(p.templateId) ?? '—' }}</td>
                  <td hlmTd>
                    @if (p.voided) {
                      <span hlmBadge variant="destructive">Voided</span>
                    } @else {
                      <span hlmBadge variant="secondary">Active</span>
                    }
                  </td>
                  <td hlmTd>
                    <div class="flex flex-wrap gap-1">
                      @if (p.apple) {
                        <span hlmBadge variant="outline" [title]="p.apple + ' Apple device(s)'">Apple{{ p.apple > 1 ? ' ×' + p.apple : '' }}</span>
                      }
                      @if (p.google) {
                        <span hlmBadge variant="outline">Google</span>
                      }
                      @if (!p.apple && !p.google) {
                        <span class="text-muted-foreground">—</span>
                      }
                    </div>
                  </td>
                  <td hlmTd class="text-muted-foreground">{{ p.updatedAt | date: 'dd.MM.yyyy HH:mm' }}</td>
                </tr>
              } @empty {
                <tr hlmTr>
                  <td hlmTd colspan="6" class="text-muted-foreground text-center">No results for “{{ query() }}”</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
})
export class PassList implements OnInit {
  private readonly api = inject(Api);
  protected readonly passes = signal<PassSummary[]>([]);
  protected readonly templates = signal(new Map<string, string>());
  protected readonly loading = signal(true);
  protected readonly query = signal('');
  protected readonly otpValue = signal('');
  protected readonly otpResult = signal<OtpVerifyResult | null>(null);
  protected readonly verifying = signal(false);

  protected readonly stats = computed(() => {
    const ps = this.passes();
    const pct = (n: number) => (ps.length ? `${Math.round((n / ps.length) * 100)}% of issued` : '');
    const apple = ps.filter((p) => (p.apple ?? 0) > 0);
    const google = ps.filter((p) => p.google).length;
    const installed = ps.filter((p) => (p.apple ?? 0) > 0 || p.google).length;
    return [
      { label: 'Issued', value: ps.length, hint: `${ps.filter((p) => !p.voided).length} active` },
      { label: 'Installed', value: installed, hint: pct(installed) },
      { label: 'Apple Wallet', value: apple.length, hint: `${apple.reduce((n, p) => n + (p.apple ?? 0), 0)} device(s)` },
      { label: 'Google Wallet', value: google, hint: pct(google) },
    ];
  });

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.passes();
    return this.passes().filter((p) => p.holderName.toLowerCase().includes(q) || p.serial.toLowerCase().includes(q));
  });

  protected async verify() {
    this.verifying.set(true);
    try {
      this.otpResult.set(await this.api.verifyOtp(this.otpValue()));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.verifying.set(false);
    }
  }

  async ngOnInit() {
    try {
      const [passes, templates] = await Promise.all([this.api.passes(), this.api.templates()]);
      this.passes.set(passes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      this.templates.set(new Map(templates.map((t: TemplateSummary) => [t.id, t.name])));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
