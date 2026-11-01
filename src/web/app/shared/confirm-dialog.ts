import { Component, input, output, viewChild } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialog, HlmDialogImports } from '@spartan-ng/helm/dialog';

/**
 * Confirmación reutilizable para acciones destructivas o masivas.
 * Uso: <app-confirm #c title="…" (confirmed)="…" /> y c.open().
 */
@Component({
  selector: 'app-confirm',
  imports: [HlmDialogImports, HlmButtonImports],
  template: `
    <hlm-dialog #dlg>
      <hlm-dialog-content *hlmDialogPortal="let ctx" class="sm:max-w-md">
        <hlm-dialog-header>
          <h2 hlmDialogTitle>{{ title() }}</h2>
          @if (description()) {
            <p hlmDialogDescription>{{ description() }}</p>
          }
        </hlm-dialog-header>
        <hlm-dialog-footer>
          <button hlmBtn variant="outline" type="button" hlmDialogClose>Cancel</button>
          <button hlmBtn type="button" [variant]="destructive() ? 'destructive' : 'default'" (click)="confirm()">{{ confirmLabel() }}</button>
        </hlm-dialog-footer>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly confirmLabel = input('Confirm');
  readonly destructive = input(false);
  readonly confirmed = output<void>();
  private readonly dlg = viewChild.required<HlmDialog>('dlg');

  open() {
    this.dlg().open();
  }

  protected confirm() {
    this.dlg().close();
    this.confirmed.emit();
  }
}
