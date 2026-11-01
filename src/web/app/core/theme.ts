import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'passgen.theme';

/** Tema claro/oscuro: sigue al sistema salvo que el usuario elija uno. El script de index.html evita el flash inicial. */
@Injectable({ providedIn: 'root' })
export class Theme {
  readonly mode = signal<ThemeMode>(read());
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.media.addEventListener('change', () => this.apply());
    this.apply();
  }

  set(mode: ThemeMode) {
    this.mode.set(mode);
    try {
      if (mode === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch {
      /* sin storage: solo esta sesión */
    }
    this.apply();
  }

  /** Rota system → light → dark. */
  cycle() {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    this.set(order[(order.indexOf(this.mode()) + 1) % order.length]);
  }

  private apply() {
    const dark = this.mode() === 'dark' || (this.mode() === 'system' && this.media.matches);
    document.documentElement.classList.toggle('dark', dark);
  }
}

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}
