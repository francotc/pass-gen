import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';

/** Encabezado común de página: link de vuelta, título, descripción y acciones (contenido proyectado). */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, NgIcon],
  providers: [provideIcons({ lucideArrowLeft })],
  host: { class: 'mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3' },
  template: `
    <div class="flex min-w-0 flex-col gap-1">
      @if (back(); as b) {
        <a [routerLink]="b.link" class="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm">
          <ng-icon name="lucideArrowLeft" /> {{ b.label }}
        </a>
      }
      <h1 class="truncate text-2xl font-semibold tracking-tight">{{ title() }}</h1>
      @if (description()) {
        <p class="text-muted-foreground text-sm">{{ description() }}</p>
      }
      <ng-content select="[meta]" />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <ng-content />
    </div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly back = input<{ link: string; label: string } | null>(null);
}
