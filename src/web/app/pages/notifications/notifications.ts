import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBellRing, lucideLanguages, lucidePlus, lucideSend, lucideTrash2 } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { render } from '../../../../worker/lib/render';
import type { AppleMessagePlacement, NotificationInput, NotificationResult } from '../../../../worker/types';
import { Api, errorMessage, type NotificationSummary, type PassSummary, type TemplateSummary } from '../../core/api.service';

interface Draft {
  targetType: 'pass' | 'template';
  serial: string;
  templateId: string;
  header: string;
  body: string;
  link: string;
  translations: { language: string; header: string; body: string }[];
  apple: { enabled: boolean; placement: AppleMessagePlacement; changeMessage: string };
  google: { enabled: boolean; notify: boolean; scope: 'object' | 'class'; displayStart: string; displayEnd: string };
}

const newDraft = (): Draft => ({
  targetType: 'pass',
  serial: '',
  templateId: '',
  header: '',
  body: '',
  link: '',
  translations: [],
  apple: { enabled: true, placement: 'backFields', changeMessage: '%@' },
  google: { enabled: true, notify: true, scope: 'object', displayStart: '', displayEnd: '' },
});

/** datetime-local (hora local, sin zona) → ISO 8601 UTC. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : undefined);

@Component({
  selector: 'app-notifications',
  imports: [
    FormsModule,
    DatePipe,
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSwitchImports,
    HlmTableImports,
    HlmTextareaImports,
  ],
  providers: [provideIcons({ lucideBellRing, lucideLanguages, lucidePlus, lucideSend, lucideTrash2 })],
  template: `
    <header class="mb-6 flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">Notifications</h1>
      <p class="text-muted-foreground text-sm">Send a message to pass holders in Apple Wallet and Google Wallet.</p>
    </header>

    <div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <form class="flex min-w-0 flex-col gap-6" (ngSubmit)="send()">
        <section hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Recipients</h2>
          </div>
          <div hlmCardContent class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="targetType">Send to</label>
              <select hlmInput id="targetType" name="targetType" [(ngModel)]="d.targetType" (ngModelChange)="onTargetType()">
                <option value="pass">One pass</option>
                <option value="template">All active passes of a template</option>
              </select>
            </div>
            @if (d.targetType === 'pass') {
              <div class="flex flex-col gap-2">
                <label hlmLabel for="serial">Pass</label>
                <select hlmInput id="serial" name="serial" required [(ngModel)]="d.serial">
                  <option value="" disabled>Choose a pass</option>
                  @for (p of passes(); track p.serial) {
                    <option [value]="p.serial">{{ p.holderName }} · {{ p.serial }}</option>
                  }
                </select>
              </div>
            } @else {
              <div class="flex flex-col gap-2">
                <label hlmLabel for="template">Template</label>
                <select hlmInput id="template" name="template" required [(ngModel)]="d.templateId">
                  <option value="" disabled>Choose a template</option>
                  @for (t of templates(); track t.id) {
                    <option [value]="t.id">{{ t.name }} ({{ activeCount(t.id) }} active)</option>
                  }
                </select>
              </div>
            }
          </div>
        </section>

        <section hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Message</h2>
            <p hlmCardDescription>
              Supports pass placeholders like <code>{{ '{{holderName}}' }}</code>, <code>{{ '{{serial}}' }}</code> or any pass data key.
            </p>
          </div>
          <div hlmCardContent class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="header">Header</label>
              <input hlmInput id="header" name="header" maxlength="100" required placeholder="Double stamps this weekend" [(ngModel)]="d.header" />
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="body">Message</label>
              <textarea
                hlmTextarea
                id="body"
                name="body"
                rows="3"
                maxlength="1000"
                required
                placeholder="Hi {{ '{{holderName}}' }}, every visit counts twice until Sunday."
                [(ngModel)]="d.body"
              ></textarea>
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="link">Link (optional)</label>
              <input hlmInput id="link" name="link" type="url" placeholder="https://" [(ngModel)]="d.link" />
              <p class="text-muted-foreground text-xs">Apple shows it as a link on the back of the pass; Google appends it to the message.</p>
            </div>

            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-2">
                <span class="flex items-center gap-2 text-sm font-medium"><ng-icon name="lucideLanguages" /> Translations (Google)</span>
                <button hlmBtn variant="outline" size="sm" type="button" (click)="addTranslation()"><ng-icon name="lucidePlus" /> Add language</button>
              </div>
              @for (tr of d.translations; track $index; let i = $index) {
                <div class="border-border grid gap-2 rounded-md border p-3 sm:grid-cols-[6rem_1fr_auto]">
                  <input hlmInput aria-label="Language tag" placeholder="es" [name]="'tr-lang-' + i" [(ngModel)]="tr.language" />
                  <input hlmInput aria-label="Translated header" placeholder="Header" [name]="'tr-header-' + i" [(ngModel)]="tr.header" />
                  <button hlmBtn variant="ghost" size="icon" type="button" aria-label="Remove translation" (click)="d.translations.splice(i, 1)">
                    <ng-icon name="lucideTrash2" />
                  </button>
                  <textarea
                    hlmTextarea
                    class="sm:col-span-2"
                    rows="2"
                    aria-label="Translated message"
                    placeholder="Message"
                    [name]="'tr-body-' + i"
                    [(ngModel)]="tr.body"
                  ></textarea>
                </div>
              }
            </div>
          </div>
        </section>

        <section hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Apple Wallet</h2>
            <p hlmCardDescription>
              Wallet has no free-form push: the message becomes a pass field with a change message, and the iPhone shows a lock screen
              notification when its value changes.
            </p>
            <div hlmCardAction>
              <hlm-switch inputId="appleEnabled" name="appleEnabled" aria-label="Send to Apple Wallet" [(ngModel)]="d.apple.enabled" />
            </div>
          </div>
          @if (d.apple.enabled) {
            <div hlmCardContent class="grid gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-2">
                <label hlmLabel for="placement">Show the message on</label>
                <select hlmInput id="placement" name="placement" [(ngModel)]="d.apple.placement">
                  <option value="backFields">Back of the pass (supports links)</option>
                  <option value="secondaryFields">Front, secondary row</option>
                  <option value="auxiliaryFields">Front, auxiliary row</option>
                </select>
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="changeMessage">Lock screen text</label>
                <input hlmInput id="changeMessage" name="changeMessage" class="font-mono" [(ngModel)]="d.apple.changeMessage" />
                <p class="text-muted-foreground text-xs">
                  <code>%&#64;</code> is replaced by the message. Also supports <code>{{ '{{header}}' }}</code>.
                </p>
              </div>
              <p class="text-muted-foreground text-xs sm:col-span-2">
                Needs push configured in Settings. Sending the exact same text twice does not notify again. The message stays on the pass
                until the next one replaces it.
              </p>
            </div>
          }
        </section>

        <section hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Google Wallet</h2>
            <p hlmCardDescription>Adds a message to the pass details; optionally also sends a push notification.</p>
            <div hlmCardAction>
              <hlm-switch inputId="googleEnabled" name="googleEnabled" aria-label="Send to Google Wallet" [(ngModel)]="d.google.enabled" />
            </div>
          </div>
          @if (d.google.enabled) {
            <div hlmCardContent class="grid gap-4 sm:grid-cols-2">
              <label class="flex items-center justify-between gap-3 text-sm sm:col-span-2" for="googleNotify">
                <span>
                  <span class="font-medium">Push notification</span>
                  <span class="text-muted-foreground block text-xs">
                    TEXT_AND_NOTIFY. Google allows 3 notifications per pass every 24 hours; off sends a silent message (TEXT).
                  </span>
                </span>
                <hlm-switch inputId="googleNotify" name="googleNotify" [(ngModel)]="d.google.notify" />
              </label>
              @if (d.targetType === 'template') {
                <div class="flex flex-col gap-2 sm:col-span-2">
                  <label hlmLabel for="scope">Delivery</label>
                  <select hlmInput id="scope" name="scope" [(ngModel)]="d.google.scope">
                    <option value="object">One message per pass (supports placeholders)</option>
                    <option value="class">One shared message on the template (single API call, no placeholders)</option>
                  </select>
                </div>
              }
              <div class="flex flex-col gap-2">
                <label hlmLabel for="displayStart">Show from (optional)</label>
                <input hlmInput id="displayStart" name="displayStart" type="datetime-local" [(ngModel)]="d.google.displayStart" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="displayEnd">Show until (optional)</label>
                <input hlmInput id="displayEnd" name="displayEnd" type="datetime-local" [(ngModel)]="d.google.displayEnd" />
              </div>
            </div>
          }
        </section>

        <div>
          <button hlmBtn type="submit" [disabled]="busy()"><ng-icon name="lucideSend" /> {{ busy() ? 'Sending…' : 'Send notification' }}</button>
        </div>
      </form>

      <aside class="flex min-w-0 flex-col gap-4 xl:sticky xl:top-8 xl:self-start">
        <span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">Preview{{ sample() ? ' · ' + sample()!.holderName : '' }}</span>
        @if (d.apple.enabled) {
          <figure class="flex flex-col gap-2">
            <figcaption class="text-muted-foreground text-xs">iPhone lock screen</figcaption>
            <div class="flex items-start gap-3 rounded-2xl bg-neutral-200/70 p-3 backdrop-blur dark:bg-neutral-800/70">
              <span class="bg-primary text-primary-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-lg">
                <ng-icon name="lucideBellRing" />
              </span>
              <div class="min-w-0 text-sm">
                <div class="font-semibold">Wallet</div>
                <div class="break-words">{{ appleText() || '…' }}</div>
              </div>
            </div>
          </figure>
        }
        @if (d.google.enabled) {
          <figure class="flex flex-col gap-2">
            <figcaption class="text-muted-foreground text-xs">Google Wallet message</figcaption>
            <div class="border-border rounded-2xl border p-4 text-sm">
              <div class="font-medium">{{ r(d.header) || 'Header' }}</div>
              <div class="text-muted-foreground mt-1 break-words whitespace-pre-line">{{ r(d.body) || 'Message' }}{{ d.link ? '\n' + d.link : '' }}</div>
              @if (d.google.notify) {
                <span hlmBadge variant="secondary" class="mt-3">Sends a push</span>
              }
            </div>
          </figure>
        }
      </aside>
    </div>

    <section class="mt-10 flex max-w-5xl flex-col gap-3">
      <h2 class="text-lg font-semibold tracking-tight">History</h2>
      @if (!history().length) {
        <p class="text-muted-foreground text-sm">No notifications sent yet.</p>
      } @else {
        <div hlmTableContainer>
          <table hlmTable>
            <thead hlmTHead>
              <tr hlmTr>
                <th hlmTh>Sent</th>
                <th hlmTh>Header</th>
                <th hlmTh>Recipients</th>
                <th hlmTh>Channels</th>
                <th hlmTh>Status</th>
              </tr>
            </thead>
            <tbody hlmTBody>
              @for (n of history(); track n.id) {
                <tr hlmTr>
                  <td hlmTd class="text-muted-foreground whitespace-nowrap">{{ n.createdAt | date: 'dd.MM.yyyy HH:mm' }}</td>
                  <td hlmTd class="max-w-64 truncate font-medium">{{ n.header }}</td>
                  <td hlmTd>{{ targetLabel(n) }} · {{ n.passes }} pass(es)</td>
                  <td hlmTd class="whitespace-nowrap">
                    @if (n.apple) {
                      <span hlmBadge variant="outline">Apple</span>
                    }
                    @if (n.google) {
                      <span hlmBadge variant="outline">Google</span>
                    }
                  </td>
                  <td hlmTd>
                    @if (n.failed) {
                      <span hlmBadge variant="destructive">{{ n.failed }} failed</span>
                    } @else {
                      <span hlmBadge variant="secondary">Sent</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class Notifications implements OnInit {
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);

  protected d: Draft = newDraft();
  protected readonly passes = signal<PassSummary[]>([]);
  protected readonly templates = signal<TemplateSummary[]>([]);
  protected readonly history = signal<NotificationSummary[]>([]);
  protected readonly busy = signal(false);

  async ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('pass')) this.d.serial = q.get('pass')!;
    if (q.get('template')) {
      this.d.targetType = 'template';
      this.d.templateId = q.get('template')!;
    }
    try {
      const [passes, templates, history] = await Promise.all([this.api.passes(), this.api.templates(), this.api.notifications()]);
      this.passes.set(passes.filter((p) => !p.voided).sort((a, b) => a.holderName.localeCompare(b.holderName)));
      this.templates.set(templates);
      this.history.set(history.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  protected onTargetType() {
    if (this.d.targetType === 'pass') this.d.google.scope = 'object';
  }

  protected activeCount(templateId: string) {
    return this.passes().filter((p) => p.templateId === templateId).length;
  }

  /** Pase usado para la vista previa: el elegido o el primero de la plantilla. */
  protected sample() {
    const list = this.passes();
    return this.d.targetType === 'pass' ? list.find((p) => p.serial === this.d.serial) : list.find((p) => p.templateId === this.d.templateId);
  }

  /** La lista solo trae titular y serial; el resto de los placeholders se resuelve al enviar. */
  protected r(s: string) {
    const p = this.sample();
    return p ? render(s, { holderName: p.holderName, serial: p.serial }, true) : s;
  }

  protected appleText() {
    const header = this.r(this.d.header);
    return this.d.apple.changeMessage.replace(/\{\{\s*header\s*\}\}/g, header).replace('%@', this.r(this.d.body));
  }

  protected addTranslation() {
    this.d.translations.push({ language: '', header: '', body: '' });
  }

  protected targetLabel(n: NotificationSummary) {
    const t = n.target;
    if (t.type === 'pass') return this.passes().find((p) => p.serial === t.serial)?.holderName ?? t.serial;
    return this.templates().find((x) => x.id === t.templateId)?.name ?? 'Template';
  }

  protected async send() {
    const d = this.d;
    const input: NotificationInput = {
      target: d.targetType === 'pass' ? { type: 'pass', serial: d.serial } : { type: 'template', templateId: d.templateId },
      header: d.header,
      body: d.body,
      link: d.link || undefined,
      translations: d.translations,
      apple: d.apple,
      google: {
        enabled: d.google.enabled,
        notify: d.google.notify,
        scope: d.targetType === 'template' ? d.google.scope : 'object',
        displayStart: toIso(d.google.displayStart),
        displayEnd: toIso(d.google.displayEnd),
      },
    };
    this.busy.set(true);
    try {
      const rec = await this.api.sendNotification(input);
      const msg = summary(rec.result);
      if (msg.ok) toast.success('Notification sent', { description: msg.text });
      else toast.warning('Notification sent with warnings', { description: msg.text });
      this.history.set([
        {
          id: rec.id,
          createdAt: rec.createdAt,
          header: rec.header,
          target: rec.target,
          passes: rec.result.passes,
          apple: rec.apple.enabled,
          google: rec.google.enabled,
          failed: rec.result.apple.failed + rec.result.google.failed,
        },
        ...this.history(),
      ]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

function summary(r: NotificationResult): { ok: boolean; text: string } {
  const parts = [`${r.passes} pass(es)`];
  let ok = true;
  if (r.apple.skipped && !r.apple.sent) {
    parts.push(r.apple.skipped.startsWith('Apple') ? r.apple.skipped : `Apple: ${r.apple.skipped}`);
    ok = false;
  } else if (r.apple.updated) {
    parts.push(`Apple: ${r.apple.updated} updated, ${r.apple.sent} device(s) notified${r.apple.failed ? `, ${r.apple.failed} failed` : ''}`);
    if (r.apple.failed) ok = false;
  }
  if (r.google.skipped) {
    parts.push(r.google.skipped);
    ok = false;
  }
  else if (r.google.sent || r.google.failed) {
    parts.push(`Google: ${r.google.sent} sent${r.google.failed ? `, ${r.google.failed} failed (${r.google.errors[0]})` : ''}`);
    if (r.google.failed) ok = false;
  }
  return { ok, text: parts.join(' · ') };
}
