import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFileUp, lucideX } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';

/** Selector de archivo con estilo propio: botón + nombre del archivo elegido + quitar. */
@Component({
  selector: 'app-file-picker',
  imports: [NgIcon, HlmButtonImports],
  providers: [provideIcons({ lucideFileUp, lucideX })],
  template: `
    <div class="border-input flex min-h-9 items-center gap-2 rounded-md border border-dashed px-1.5 py-1">
      <input #file type="file" class="sr-only" [id]="inputId()" [accept]="accept()" (change)="changed($event)" />
      <button hlmBtn variant="outline" size="sm" type="button" (click)="file.click()" [attr.aria-describedby]="inputId() + '-name'">
        <ng-icon name="lucideFileUp" /> {{ name() ? 'Replace' : 'Choose file' }}
      </button>
      <span [id]="inputId() + '-name'" class="min-w-0 flex-1 truncate text-sm" [class.text-muted-foreground]="!name()">
        {{ name() || placeholder() }}
      </span>
      @if (name()) {
        <button hlmBtn variant="ghost" size="icon-sm" type="button" [attr.aria-label]="'Remove ' + name()" (click)="clear()">
          <ng-icon name="lucideX" />
        </button>
      }
    </div>
  `,
})
export class FilePicker {
  readonly inputId = input.required<string>();
  readonly accept = input('');
  readonly placeholder = input('No file chosen');
  readonly picked = output<File | null>();
  protected readonly name = signal('');
  private readonly file = viewChild.required<ElementRef<HTMLInputElement>>('file');

  protected changed(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0] ?? null;
    this.name.set(f?.name ?? '');
    this.picked.emit(f);
  }

  protected clear() {
    this.file().nativeElement.value = '';
    this.name.set('');
    this.picked.emit(null);
  }
}
