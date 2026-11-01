import { Component, computed, input } from '@angular/core';

export type Platform = 'apple' | 'google' | 'both';

/** Chip que indica en qué wallet aplica una opción (reemplaza los "(Apple)" / "(Google)" en el texto). */
@Component({
  selector: 'app-platform',
  host: { class: 'inline-flex gap-1 align-middle' },
  template: `
    @for (c of chips(); track c) {
      <span
        class="border-border text-muted-foreground inline-flex h-[18px] items-center rounded-full border px-1.5 text-[10.5px] font-medium tracking-wide"
        [attr.title]="c + ' Wallet only'"
        >{{ c }}</span
      >
    }
    <span class="sr-only">({{ label() }})</span>
  `,
})
export class PlatformChip {
  readonly p = input.required<Platform>();
  protected readonly chips = computed(() => (this.p() === 'both' ? ['Apple', 'Google'] : [this.p() === 'apple' ? 'Apple' : 'Google']));
  protected readonly label = computed(() => (this.p() === 'both' ? 'Apple and Google' : this.p() === 'apple' ? 'Apple only' : 'Google only'));
}
