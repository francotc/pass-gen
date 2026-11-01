import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import type { Template } from '../../../../worker/types';
import { Api, errorMessage, type TemplateSummary } from '../../core/api.service';
import { syncMessage } from '../../core/sync-message';
import { keyLabel, placeholderKeys } from '../../core/template-utils';
import { PageHeader } from '../../shared/page-header';
import { PassPreview } from '../../shared/pass-preview';

@Component({
  selector: 'app-pass-new',
  imports: [FormsModule, RouterLink, PageHeader, PassPreview, HlmButtonImports, HlmCardImports, HlmInputImports, HlmLabelImports],
  template: `
    <app-page-header title="Issue pass" description="Fill in the holder details; the preview updates as you type." [back]="{ link: '/passes', label: 'Passes' }" />

    <div class="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
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
              <p class="text-muted-foreground text-[13px] leading-snug">No templates yet. <a routerLink="/templates/new" class="underline">Create one</a>.</p>
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
              <p class="text-muted-foreground text-[13px] leading-snug">This template only lets this email save the pass in Google Wallet.</p>
            }
          </div>
          @for (k of keys(); track k) {
            <div class="flex flex-col gap-2">
              <label hlmLabel [for]="'data-' + k">{{ label(k) }}</label>
              <input hlmInput [id]="'data-' + k" [name]="'data-' + k" [(ngModel)]="data[k]" />
              <p class="text-muted-foreground font-mono text-[12px]">{{ '{{' + k + '}}' }}</p>
            </div>
          }
          <div class="flex flex-col gap-2">
            <button hlmBtn type="submit" class="w-fit" [disabled]="busy() || !template() || !holderName.trim()" [attr.aria-describedby]="missing() ? 'issue-hint' : null">
              {{ busy() ? 'Issuing…' : 'Issue pass' }}
            </button>
            @if (missing(); as m) {
              <p id="issue-hint" class="text-muted-foreground text-[13px] leading-snug">{{ m }}</p>
            }
          </div>
        </div>
      </form>

      @if (template(); as t) {
        <app-pass-preview [template]="t" [holderName]="holderName || 'Holder name'" [data]="data" />
      } @else {
        <div class="border-border text-muted-foreground flex min-h-64 items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm">
          Pick a template to preview the pass.
        </div>
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

  protected label(k: string) {
    const t = this.template();
    return t ? keyLabel(t, k) : k;
  }

  protected missing() {
    if (!this.template()) return 'Choose a template to continue.';
    if (!this.holderName.trim()) return 'Enter the holder name to continue.';
    return '';
  }

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
      await this.router.navigate(['/passes', res.pass.serial], { queryParams: { issued: 1 } });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
