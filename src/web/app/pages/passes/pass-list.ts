import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch, lucideTicket } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { Api, errorMessage, type PassSummary, type TemplateSummary } from '../../core/api.service';

@Component({
  selector: 'app-pass-list',
  imports: [FormsModule, RouterLink, DatePipe, NgIcon, HlmBadgeImports, HlmButtonImports, HlmInputImports, HlmSkeletonImports, HlmTableImports],
  providers: [provideIcons({ lucidePlus, lucideSearch, lucideTicket })],
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold tracking-tight">Pases</h1>
        <p class="text-muted-foreground text-sm">Pases emitidos para Apple Wallet y Google Wallet.</p>
      </div>
      <a hlmBtn routerLink="/pases/nuevo"><ng-icon name="lucidePlus" /> Emitir pase</a>
    </header>

    @if (loading()) {
      <div class="flex max-w-4xl flex-col gap-2">
        <hlm-skeleton class="h-10 w-full" />
        <hlm-skeleton class="h-10 w-full" />
        <hlm-skeleton class="h-10 w-full" />
      </div>
    } @else if (!passes().length) {
      <div class="border-border flex max-w-4xl flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <ng-icon name="lucideTicket" class="text-muted-foreground text-3xl" />
        <p class="font-medium">Todavía no emitiste pases</p>
        <p class="text-muted-foreground text-sm">
          @if (templates().size) {
            Elegí una plantilla y completá los datos del titular.
          } @else {
            Primero creá una plantilla y configurá las credenciales en Ajustes.
          }
        </p>
        @if (templates().size) {
          <a hlmBtn variant="outline" routerLink="/pases/nuevo">Emitir pase</a>
        } @else {
          <a hlmBtn variant="outline" routerLink="/plantillas/nueva">Crear plantilla</a>
        }
      </div>
    } @else {
      <div class="flex max-w-4xl flex-col gap-3">
        <div class="relative max-w-sm">
          <ng-icon name="lucideSearch" class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" />
          <input hlmInput type="search" class="w-full pl-8" placeholder="Buscar por titular o serial" aria-label="Buscar pases" [(ngModel)]="query" />
        </div>
        <div hlmTableContainer>
          <table hlmTable>
            <thead hlmTHead>
              <tr hlmTr>
                <th hlmTh>Titular</th>
                <th hlmTh>Serial</th>
                <th hlmTh>Plantilla</th>
                <th hlmTh>Estado</th>
                <th hlmTh>Actualizado</th>
              </tr>
            </thead>
            <tbody hlmTBody>
              @for (p of filtered(); track p.serial) {
                <tr hlmTr>
                  <td hlmTd>
                    <a class="font-medium hover:underline" [routerLink]="['/pases', p.serial]">{{ p.holderName }}</a>
                  </td>
                  <td hlmTd class="font-mono text-xs">{{ p.serial }}</td>
                  <td hlmTd>{{ templates().get(p.templateId) ?? '—' }}</td>
                  <td hlmTd>
                    @if (p.voided) {
                      <span hlmBadge variant="destructive">Anulado</span>
                    } @else {
                      <span hlmBadge variant="secondary">Activo</span>
                    }
                  </td>
                  <td hlmTd class="text-muted-foreground">{{ p.updatedAt | date: 'dd.MM.yyyy HH:mm' }}</td>
                </tr>
              } @empty {
                <tr hlmTr>
                  <td hlmTd colspan="5" class="text-muted-foreground text-center">Sin resultados para «{{ query() }}»</td>
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

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.passes();
    return this.passes().filter((p) => p.holderName.toLowerCase().includes(q) || p.serial.toLowerCase().includes(q));
  });

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
