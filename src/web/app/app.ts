import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBell, lucideLayoutTemplate, lucideMonitor, lucideMoon, lucideSettings, lucideSun, lucideWallet } from '@ng-icons/lucide';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';
import { Theme } from './core/theme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon, HlmToasterImports],
  providers: [provideIcons({ lucideWallet, lucideLayoutTemplate, lucideBell, lucideSettings, lucideSun, lucideMoon, lucideMonitor })],
  template: `
    <div class="flex min-h-dvh flex-col md:flex-row">
      <!-- Escritorio: barra lateral. Celular: barra superior + pestañas abajo. -->
      <aside
        class="border-border bg-sidebar sticky top-0 z-30 flex shrink-0 items-center justify-between gap-1 border-b px-3 py-1 md:h-dvh md:w-60 md:flex-col md:items-stretch md:justify-start md:border-r md:border-b-0 md:p-3"
      >
        <a routerLink="/passes" class="flex items-center gap-2 px-2 py-2 md:py-3">
          <span class="bg-primary text-primary-foreground inline-flex size-8 items-center justify-center rounded-md">
            <ng-icon name="lucideWallet" />
          </span>
          <span class="font-semibold tracking-tight">Pass Gen</span>
        </a>
        <nav class="hidden flex-col gap-1 md:flex" aria-label="Main">
          @for (item of nav; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-muted text-foreground"
              ariaCurrentWhenActive="page"
              class="text-muted-foreground hover:bg-muted hover:text-foreground flex min-h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium"
            >
              <ng-icon [name]="item.icon" />
              {{ item.label }}
            </a>
          }
        </nav>
        <button
          type="button"
          class="text-muted-foreground hover:bg-muted hover:text-foreground flex min-h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium md:mt-auto"
          [attr.aria-label]="'Theme: ' + themeLabel() + '. Change theme'"
          (click)="theme.cycle()"
        >
          <ng-icon [name]="themeIcon()" />
          <span class="hidden md:inline">{{ themeLabel() }}</span>
        </button>
      </aside>
      <main class="min-w-0 flex-1 px-4 pt-5 pb-24 md:p-8">
        <div class="mx-auto w-full max-w-6xl">
          <router-outlet />
        </div>
      </main>
      <nav
        class="border-border bg-sidebar/95 fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Main"
      >
        @for (item of nav; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="text-foreground"
            ariaCurrentWhenActive="page"
            class="text-muted-foreground flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium"
          >
            <ng-icon [name]="item.icon" class="text-lg" />
            {{ item.label }}
          </a>
        }
      </nav>
    </div>
    <hlm-toaster richColors position="top-right" [theme]="toasterTheme()" />
  `,
})
export class App {
  protected readonly theme = inject(Theme);
  protected readonly nav = [
    { path: '/passes', label: 'Passes', icon: 'lucideWallet' },
    { path: '/templates', label: 'Templates', icon: 'lucideLayoutTemplate' },
    { path: '/notifications', label: 'Notifications', icon: 'lucideBell' },
    { path: '/settings', label: 'Settings', icon: 'lucideSettings' },
  ];
  protected readonly themeIcon = computed(() => ({ system: 'lucideMonitor', light: 'lucideSun', dark: 'lucideMoon' })[this.theme.mode()]);
  protected readonly themeLabel = computed(() => ({ system: 'System theme', light: 'Light theme', dark: 'Dark theme' })[this.theme.mode()]);
  protected readonly toasterTheme = computed(() => this.theme.mode());
}
