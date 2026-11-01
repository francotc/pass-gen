import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideArrowUp,
  lucideChevronLeft,
  lucideChevronRight,
  lucideCircleCheck,
  lucideCircleX,
  lucidePlus,
  lucideScanLine,
  lucideSearch,
  lucideTicket,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialog, HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import type { OtpVerifyResult } from '../../../../worker/types';
import { Api, errorMessage, type PassSummary, type TemplateSummary } from '../../core/api.service';
import { PageHeader } from '../../shared/page-header';

type SortKey = 'holderName' | 'updatedAt';
const PAGE_SIZE = 25;

const installed = (p: PassSummary) => (p.apple ?? 0) > 0 || !!p.google;

@Component({
  selector: 'app-pass-list',
  imports: [
    FormsModule,
    RouterLink,
    DatePipe,
    NgIcon,
    PageHeader,
    HlmBadgeImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSkeletonImports,
    HlmTableImports,
  ],
  providers: [
    provideIcons({
      lucidePlus,
      lucideSearch,
      lucideTicket,
      lucideScanLine,
      lucideCircleCheck,
      lucideCircleX,
      lucideArrowUp,
      lucideArrowDown,
      lucideChevronLeft,
      lucideChevronRight,
    }),
  ],
  template: `
    <app-page-header title="Passes" description="Passes issued for Apple Wallet and Google Wallet.">
      <button hlmBtn variant="outline" type="button" (click)="openVerify()"><ng-icon name="lucideScanLine" /> Verify code</button>
      <a hlmBtn routerLink="/passes/new"><ng-icon name="lucidePlus" /> Issue pass</a>
    </app-page-header>

    <hlm-dialog #verifyDlg>
      <hlm-dialog-content *hlmDialogPortal="let ctx" class="sm:max-w-lg">
        <hlm-dialog-header>
          <h2 hlmDialogTitle>Verify a one-time code</h2>
          <p hlmDialogDescription>Scan or paste the code from the pass (format SERIAL.CODE) to check that it is valid right now.</p>
        </hlm-dialog-header>
        <form class="flex flex-col gap-3" (ngSubmit)="verify()">
          <label hlmLabel for="otpValue" class="sr-only">Code</label>
          <div class="flex gap-2">
            <input
              hlmInput
              id="otpValue"
              name="otpValue"
              class="min-w-0 flex-1 font-mono"
              autocomplete="off"
              autofocus
              placeholder="SERIAL.CODE"
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
      </hlm-dialog-content>
    </hlm-dialog>

    @if (loading()) {
      <div class="flex flex-col gap-2">
        <hlm-skeleton class="h-24 w-full" />
        <hlm-skeleton class="h-10 w-full" />
        <hlm-skeleton class="h-10 w-full" />
      </div>
    } @else if (!passes().length) {
      <div class="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
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
      <div class="flex flex-col gap-4">
        <dl class="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Installation stats">
          @for (s of stats(); track s.label) {
            <div class="border-border flex flex-col gap-1 rounded-lg border p-3">
              <dt class="text-muted-foreground text-[13px]">{{ s.label }}</dt>
              <dd class="text-2xl font-semibold tabular-nums">{{ s.value }}</dd>
              <dd class="text-muted-foreground text-[13px]">{{ s.hint }}</dd>
            </div>
          }
        </dl>

        <div class="flex flex-wrap items-end gap-3" role="search">
          <div class="relative min-w-48 flex-1 sm:max-w-sm">
            <ng-icon name="lucideSearch" class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" />
            <input hlmInput type="search" class="w-full pl-8" placeholder="Search holder or serial" aria-label="Search passes" [ngModel]="query()" (ngModelChange)="query.set($event); page.set(0)" />
          </div>
          <select hlmInput class="w-auto" aria-label="Filter by template" [ngModel]="templateFilter()" (ngModelChange)="templateFilter.set($event); page.set(0)">
            <option value="">All templates</option>
            @for (t of templateOptions(); track t.id) {
              <option [value]="t.id">{{ t.name }}</option>
            }
          </select>
          <select hlmInput class="w-auto" aria-label="Filter by status" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event); page.set(0)">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="voided">Voided</option>
          </select>
          <select hlmInput class="w-auto" aria-label="Filter by install" [ngModel]="installFilter()" (ngModelChange)="installFilter.set($event); page.set(0)">
            <option value="">Installed or not</option>
            <option value="yes">Installed</option>
            <option value="no">Not installed</option>
          </select>
          @if (filtersOn()) {
            <button hlmBtn variant="ghost" size="sm" type="button" (click)="clearFilters()">Clear filters</button>
          }
        </div>

        <!-- Celular: tarjetas -->
        <ul class="flex flex-col gap-2 md:hidden" aria-label="Passes">
          @for (p of pageItems(); track p.serial) {
            <li>
              <a [routerLink]="['/passes', p.serial]" class="border-border hover:bg-muted/50 flex flex-col gap-1.5 rounded-lg border p-3">
                <span class="flex items-center justify-between gap-2">
                  <span class="truncate font-medium">{{ p.holderName }}</span>
                  @if (p.voided) {
                    <span hlmBadge variant="destructive">Voided</span>
                  } @else {
                    <span hlmBadge variant="secondary">Active</span>
                  }
                </span>
                <span class="text-muted-foreground truncate text-[13px]">{{ templates().get(p.templateId) ?? '—' }} · {{ p.updatedAt | date: 'dd.MM.yyyy' }}</span>
                <span class="flex items-center justify-between gap-2">
                  <span class="text-muted-foreground font-mono text-xs">{{ p.serial }}</span>
                  <span class="flex gap-1">
                    @if (p.apple) {
                      <span hlmBadge variant="outline">Apple{{ p.apple > 1 ? ' ×' + p.apple : '' }}</span>
                    }
                    @if (p.google) {
                      <span hlmBadge variant="outline">Google</span>
                    }
                  </span>
                </span>
              </a>
            </li>
          } @empty {
            <li class="text-muted-foreground p-6 text-center text-sm">No passes match these filters.</li>
          }
        </ul>

        <!-- Escritorio: tabla -->
        <div hlmTableContainer class="hidden md:block">
          <table hlmTable>
            <thead hlmTHead>
              <tr hlmTr>
                <th hlmTh [attr.aria-sort]="ariaSort('holderName')">
                  <button type="button" class="inline-flex items-center gap-1" (click)="sortBy('holderName')">
                    Holder
                    @if (sort().key === 'holderName') {
                      <ng-icon [name]="sort().dir === 'asc' ? 'lucideArrowUp' : 'lucideArrowDown'" />
                    }
                  </button>
                </th>
                <th hlmTh>Serial</th>
                <th hlmTh>Template</th>
                <th hlmTh>Status</th>
                <th hlmTh>Installed</th>
                <th hlmTh [attr.aria-sort]="ariaSort('updatedAt')">
                  <button type="button" class="inline-flex items-center gap-1" (click)="sortBy('updatedAt')">
                    Updated
                    @if (sort().key === 'updatedAt') {
                      <ng-icon [name]="sort().dir === 'asc' ? 'lucideArrowUp' : 'lucideArrowDown'" />
                    }
                  </button>
                </th>
              </tr>
            </thead>
            <tbody hlmTBody>
              @for (p of pageItems(); track p.serial) {
                <tr hlmTr class="hover:bg-muted/50 cursor-pointer" (click)="open(p)">
                  <td hlmTd>
                    <a class="font-medium hover:underline" [routerLink]="['/passes', p.serial]" (click)="$event.stopPropagation()">{{ p.holderName }}</a>
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
                  <td hlmTd colspan="6" class="text-muted-foreground text-center">No passes match these filters.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (pageCount() > 1) {
          <nav class="flex items-center justify-between gap-2 text-sm" aria-label="Pagination">
            <span class="text-muted-foreground">
              {{ page() * pageSize + 1 }}–{{ Math.min((page() + 1) * pageSize, filtered().length) }} of {{ filtered().length }}
            </span>
            <span class="flex gap-2">
              <button hlmBtn variant="outline" size="sm" type="button" [disabled]="page() === 0" (click)="page.set(page() - 1)">
                <ng-icon name="lucideChevronLeft" /> Previous
              </button>
              <button hlmBtn variant="outline" size="sm" type="button" [disabled]="page() >= pageCount() - 1" (click)="page.set(page() + 1)">
                Next <ng-icon name="lucideChevronRight" />
              </button>
            </span>
          </nav>
        }
      </div>
    }
  `,
})
export class PassList implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly verifyDlg = viewChild<HlmDialog>('verifyDlg');
  protected readonly Math = Math;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly passes = signal<PassSummary[]>([]);
  protected readonly templates = signal(new Map<string, string>());
  protected readonly loading = signal(true);
  protected readonly query = signal('');
  protected readonly templateFilter = signal('');
  protected readonly statusFilter = signal<'' | 'active' | 'voided'>('');
  protected readonly installFilter = signal<'' | 'yes' | 'no'>('');
  protected readonly sort = signal<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'updatedAt', dir: 'desc' });
  protected readonly page = signal(0);
  protected readonly otpValue = signal('');
  protected readonly otpResult = signal<OtpVerifyResult | null>(null);
  protected readonly verifying = signal(false);

  protected readonly templateOptions = computed(() =>
    [...this.templates()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  );

  protected readonly stats = computed(() => {
    const ps = this.passes();
    const pct = (n: number) => (ps.length ? `${Math.round((n / ps.length) * 100)}% of issued` : '');
    const apple = ps.filter((p) => (p.apple ?? 0) > 0);
    const google = ps.filter((p) => p.google).length;
    const inst = ps.filter(installed).length;
    return [
      { label: 'Issued', value: ps.length, hint: `${ps.filter((p) => !p.voided).length} active` },
      { label: 'Installed', value: inst, hint: inst ? pct(inst) : 'None added to a wallet yet' },
      { label: 'Apple Wallet', value: apple.length, hint: `${apple.reduce((n, p) => n + (p.apple ?? 0), 0)} device(s)` },
      { label: 'Google Wallet', value: google, hint: google ? pct(google) : 'None saved yet' },
    ];
  });

  protected readonly filtersOn = computed(() => !!(this.query().trim() || this.templateFilter() || this.statusFilter() || this.installFilter()));

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const { key, dir } = this.sort();
    return this.passes()
      .filter((p) => !q || p.holderName.toLowerCase().includes(q) || p.serial.toLowerCase().includes(q))
      .filter((p) => !this.templateFilter() || p.templateId === this.templateFilter())
      .filter((p) => !this.statusFilter() || (this.statusFilter() === 'voided') === p.voided)
      .filter((p) => !this.installFilter() || (this.installFilter() === 'yes') === installed(p))
      .sort((a, b) => (dir === 'asc' ? 1 : -1) * a[key].localeCompare(b[key]));
  });

  protected readonly pageCount = computed(() => Math.ceil(this.filtered().length / PAGE_SIZE));
  protected readonly pageItems = computed(() => this.filtered().slice(this.page() * PAGE_SIZE, (this.page() + 1) * PAGE_SIZE));

  protected sortBy(key: SortKey) {
    const s = this.sort();
    this.sort.set({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : s.key === key ? 'desc' : key === 'updatedAt' ? 'desc' : 'asc' });
  }

  protected ariaSort(key: SortKey) {
    const s = this.sort();
    return s.key === key ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  protected clearFilters() {
    this.query.set('');
    this.templateFilter.set('');
    this.statusFilter.set('');
    this.installFilter.set('');
    this.page.set(0);
  }

  protected open(p: PassSummary) {
    void this.router.navigate(['/passes', p.serial]);
  }

  protected openVerify() {
    this.otpValue.set('');
    this.otpResult.set(null);
    this.verifyDlg()?.open();
  }

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
      this.passes.set(passes);
      this.templates.set(new Map(templates.map((t: TemplateSummary) => [t.id, t.name])));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
