import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideLayoutTemplate, lucidePlus, lucideTicket } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { Api, errorMessage, type TemplateSummary } from '../../core/api.service';
import { textOn } from '../../core/color';
import { toInput } from '../../core/template-utils';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-template-list',
  imports: [RouterLink, DatePipe, NgIcon, PageHeader, HlmBadgeImports, HlmButtonImports, HlmSkeletonImports],
  providers: [provideIcons({ lucidePlus, lucideLayoutTemplate, lucideCopy, lucideTicket })],
  template: `
    <app-page-header title="Templates" description="Shared design for Apple Wallet and Google Wallet.">
      <a hlmBtn routerLink="/templates/new"><ng-icon name="lucidePlus" /> New template</a>
    </app-page-header>

    @if (loading()) {
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <hlm-skeleton class="h-44 w-full" />
        <hlm-skeleton class="h-44 w-full" />
        <hlm-skeleton class="h-44 w-full" />
      </div>
    } @else if (!items().length) {
      <div class="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <ng-icon name="lucideLayoutTemplate" class="text-muted-foreground text-3xl" />
        <p class="font-medium">No templates yet</p>
        <p class="text-muted-foreground text-sm">Create one to define the pass colors, images and fields.</p>
        <a hlmBtn variant="outline" routerLink="/templates/new">Create template</a>
      </div>
    } @else {
      <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Templates">
        @for (t of items(); track t.id) {
          <li class="border-border bg-card flex flex-col overflow-hidden rounded-xl border">
            <a [routerLink]="['/templates', t.id]" class="group flex flex-1 flex-col" [attr.aria-label]="'Edit ' + t.name">
              <div class="flex h-20 items-center gap-3 px-4" [style.background]="t.color || '#404040'" [style.color]="ink(t.color)">
                @if (t.logo) {
                  <img [src]="'/public/images/' + t.logo" alt="" class="size-10 rounded-full bg-white/10 object-cover" />
                } @else {
                  <span class="inline-flex size-10 items-center justify-center rounded-full bg-white/15 text-lg font-semibold">{{ initial(t.name) }}</span>
                }
                <span class="truncate font-semibold">{{ t.name }}</span>
              </div>
              <div class="flex flex-1 flex-col gap-1 p-4 text-sm">
                <span class="flex items-center gap-2">
                  <span hlmBadge variant="secondary">{{ t.kind === 'loyalty' ? 'Loyalty' : 'Generic' }}</span>
                  <span class="text-muted-foreground">{{ count(t.id) }} pass{{ count(t.id) === 1 ? '' : 'es' }}</span>
                </span>
                <span class="text-muted-foreground text-[13px]">Updated {{ t.updatedAt | date: 'dd.MM.yyyy HH:mm' }}</span>
              </div>
            </a>
            <div class="border-border flex gap-1 border-t p-2">
              <a hlmBtn variant="ghost" size="sm" routerLink="/passes/new" [queryParams]="{ template: t.id }"><ng-icon name="lucideTicket" /> Issue pass</a>
              <button hlmBtn variant="ghost" size="sm" type="button" [disabled]="busy() === t.id" (click)="duplicate(t)"><ng-icon name="lucideCopy" /> Duplicate</button>
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class TemplateList implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly items = signal<TemplateSummary[]>([]);
  protected readonly counts = signal(new Map<string, number>());
  protected readonly loading = signal(true);
  protected readonly busy = signal<string | null>(null);
  protected readonly count = (id: string) => this.counts().get(id) ?? 0;
  protected readonly initial = (n: string) => (n.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  protected readonly ink = (c?: string) => (c ? textOn(c) : '#ffffff');

  async ngOnInit() {
    try {
      const [templates, passes] = await Promise.all([this.api.templates(), this.api.passes().catch(() => [])]);
      this.items.set(templates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      const m = new Map<string, number>();
      for (const p of passes) m.set(p.templateId, (m.get(p.templateId) ?? 0) + 1);
      this.counts.set(m);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async duplicate(t: TemplateSummary) {
    this.busy.set(t.id);
    try {
      const input = toInput(await this.api.template(t.id));
      const copy = await this.api.createTemplate({ ...input, name: `${input.name} (copy)` });
      toast.success('Template duplicated');
      await this.router.navigate(['/templates', copy.id]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }
}
