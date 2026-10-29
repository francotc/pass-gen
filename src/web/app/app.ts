import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLayoutTemplate, lucideSettings, lucideWallet } from '@ng-icons/lucide';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon, HlmToasterImports],
  providers: [provideIcons({ lucideWallet, lucideLayoutTemplate, lucideSettings })],
  template: `
    <div class="flex min-h-dvh flex-col md:flex-row">
      <aside class="border-border bg-sidebar flex shrink-0 flex-col gap-1 border-b p-3 md:w-60 md:border-r md:border-b-0">
        <div class="flex items-center gap-2 px-2 py-3">
          <span class="bg-primary text-primary-foreground inline-flex size-8 items-center justify-center rounded-md">
            <ng-icon name="lucideWallet" />
          </span>
          <span class="font-semibold tracking-tight">Pass Gen</span>
        </div>
        <nav class="flex gap-1 md:flex-col" aria-label="Principal">
          @for (item of nav; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-muted text-foreground"
              class="text-muted-foreground hover:bg-muted hover:text-foreground flex min-h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium"
            >
              <ng-icon [name]="item.icon" />
              {{ item.label }}
            </a>
          }
        </nav>
      </aside>
      <main class="min-w-0 flex-1 p-4 md:p-8">
        <router-outlet />
      </main>
    </div>
    <hlm-toaster richColors position="top-right" />
  `,
})
export class App {
  protected readonly nav = [
    { path: '/pases', label: 'Pases', icon: 'lucideWallet' },
    { path: '/plantillas', label: 'Plantillas', icon: 'lucideLayoutTemplate' },
    { path: '/ajustes', label: 'Ajustes', icon: 'lucideSettings' },
  ];
}
