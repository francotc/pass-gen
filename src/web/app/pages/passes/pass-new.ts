import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import type { Template } from '../../../../worker/types';
import { Api, errorMessage, type TemplateSummary } from '../../core/api.service';
import { syncMessage } from '../../core/sync-message';
import { placeholderKeys } from '../../core/template-utils';
import { PassPreview } from '../../shared/pass-preview';

@Component({
  selector: 'app-pass-new',
  imports: [FormsModule, RouterLink, NgIcon, PassPreview, HlmButtonImports, HlmCardImports, HlmInputImports, HlmLabelImports],
  providers: [provideIcons({ lucideArrowLeft })],
  template: `
    <header class="mb-6 flex flex-col gap-1">
      <a routerLink="/passes" class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ng-icon name="lucideArrowLeft" /> Passes
      </a>
      <h1 class="text-2xl font-semibold tracking-tight">Issue pass</h1>
    </header>

    <div class="grid gap-8 xl:grid-cols-[minmax(0,28rem)_minmax(0,40rem)]">
      <form hlmCard (ngSubmit)="issue()">
        <div hlmCardContent class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <label hlmLabel for="tpl">Template</label>
            <select hlmInput id="tpl" name="tpl" required [ngModel]="templateId()" (ngModelChange)="selectTemplate($event)">
              <option value="" disabled>Choose a template</option>
              @for (t of templates(); track t.id) {
                <option [value]="t.id">{{ t.name }}</option>
              }
            </select>
            @if (!templates().length) {
              <p class="text-muted-foreground text-xs">No templates yet. <a routerLink="/templates/new" class="underline">Create one</a>.</p>
            }
          </div>
          <div class="flex flex-col gap-2">
            <label hlmLabel for="holder">Holder name</label>
            <input hlmInput id="holder" name="holder" required autocomplete="off" [(ngModel)]="holderName" />
          </div>
          <div class="flex flex-col gap-2">
            <label hlmLabel for="email">Holder email (optional)</label>
            <input hlmInput id="email" name="email" type="email" autocomplete="off" [(ngModel)]="email" />
            @if (template()?.security?.restrictToEmail) {
              <p class="text-muted-foreground text-xs">This template only lets this email save the pass in Google Wallet.</p>
            }
          </div>
          @for (k of keys(); track k) {
            <div class="flex flex-col gap-2">
              <label hlmLabel [for]="'data-' + k">{{ k }}</label>
              <input hlmInput [id]="'data-' + k" [name]="'data-' + k" [(ngModel)]="data[k]" />
            </div>
          }
          <div>
            <button hlmBtn type="submit" [disabled]="busy() || !template() || !holderName.trim()">
              {{ busy() ? 'Issuing…' : 'Issue pass' }}
            </button>
          </div>
        </div>
      </form>

      @if (template(); as t) {
        <app-pass-preview [template]="t" [holderName]="holderName" [data]="data" />
      }
    </div>
  `,
})
export class PassNew implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly templates = signal<TemplateSummary[]>([]);
  protected readonly templateId = signal('');
  protected readonly template = signal<Template | null>(null);
  protected readonly busy = signal(false);
  protected holderName = '';
  protected email = '';
  protected data: Record<string, string> = {};

  protected keys() {
    const t = this.template();
    return t ? placeholderKeys(t) : [];
  }

  async ngOnInit() {
    try {
      const list = await this.api.templates();
      this.templates.set(list);
      const preset = this.route.snapshot.queryParamMap.get('template') ?? (list.length === 1 ? list[0].id : '');
      if (preset) await this.selectTemplate(preset);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  protected async selectTemplate(id: string) {
    this.templateId.set(id);
    this.template.set(null);
    try {
      this.template.set(await this.api.template(id));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  protected async issue() {
    const t = this.template();
    if (!t) return;
    this.busy.set(true);
    try {
      const keys = new Set(this.keys());
      const data = Object.fromEntries(Object.entries(this.data).filter(([k]) => keys.has(k)));
      const res = await this.api.issuePass({ templateId: t.id, holderName: this.holderName.trim(), data, email: this.email.trim() || undefined });
      const msg = syncMessage(res.sync);
      if (msg.ok) toast.success('Pass issued', { description: msg.text });
      else toast.warning('Pass issued with warnings', { description: msg.text });
      await this.router.navigate(['/passes', res.pass.serial]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
