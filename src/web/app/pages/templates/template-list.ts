import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLayoutTemplate, lucidePlus } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { Api, errorMessage, type TemplateSummary } from '../../core/api.service';

@Component({
  selector: 'app-template-list',
  imports: [RouterLink, DatePipe, NgIcon, HlmBadgeImports, HlmButtonImports, HlmSkeletonImports, HlmTableImports],
  providers: [provideIcons({ lucidePlus, lucideLayoutTemplate })],
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold tracking-tight">Templates</h1>
        <p class="text-muted-foreground text-sm">Shared design for Apple Wallet and Google Wallet.</p>
      </div>
      <a hlmBtn routerLink="/templates/new"><ng-icon name="lucidePlus" /> New template</a>
    </header>

    @if (loading()) {
      <div class="flex max-w-3xl flex-col gap-2">
        <hlm-skeleton class="h-10 w-full" />
        <hlm-skeleton class="h-10 w-full" />
      </div>
    } @else if (!items().length) {
      <div class="border-border flex max-w-3xl flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <ng-icon name="lucideLayoutTemplate" class="text-muted-foreground text-3xl" />
        <p class="font-medium">No templates yet</p>
        <p class="text-muted-foreground text-sm">Create one to define the pass colors, images and fields.</p>
        <a hlmBtn variant="outline" routerLink="/templates/new">Create template</a>
      </div>
    } @else {
      <div hlmTableContainer class="max-w-3xl">
        <table hlmTable>
          <thead hlmTHead>
            <tr hlmTr>
              <th hlmTh>Name</th>
              <th hlmTh>Type</th>
              <th hlmTh>Updated</th>
            </tr>
          </thead>
          <tbody hlmTBody>
            @for (t of items(); track t.id) {
              <tr hlmTr>
                <td hlmTd>
                  <a class="font-medium hover:underline" [routerLink]="['/templates', t.id]">{{ t.name }}</a>
                </td>
                <td hlmTd>
                  <span hlmBadge variant="secondary">{{ t.kind === 'loyalty' ? 'Loyalty' : 'Generic' }}</span>
                </td>
                <td hlmTd class="text-muted-foreground">{{ t.updatedAt | date: 'dd.MM.yyyy HH:mm' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class TemplateList implements OnInit {
  private readonly api = inject(Api);
  protected readonly items = signal<TemplateSummary[]>([]);
  protected readonly loading = signal(true);

  async ngOnInit() {
    try {
      this.items.set((await this.api.templates()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
