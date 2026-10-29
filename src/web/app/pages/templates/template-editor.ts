import { ChangeDetectorRef, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideNfc, lucidePlus, lucideRefreshCw, lucideSave, lucideTrash2, lucideUpload, lucideX } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { FIELD_SECTIONS, NFC_MAX_BYTES, type FieldSection, type ImageSlot, type TemplateInput } from '../../../../worker/types';
import { Api, errorMessage } from '../../core/api.service';
import { syncMessage } from '../../core/sync-message';
import { newTemplate, placeholderKeys, SECTION_LABELS, toInput } from '../../core/template-utils';
import { PassPreview } from '../../shared/pass-preview';

interface ImageSlotInfo {
  slot: ImageSlot;
  label: string;
  hint: string;
}

@Component({
  selector: 'app-template-editor',
  imports: [
    FormsModule,
    RouterLink,
    NgIcon,
    PassPreview,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSeparatorImports,
    HlmSwitchImports,
    HlmTabsImports,
    HlmTextareaImports,
  ],
  providers: [provideIcons({ lucideArrowLeft, lucideNfc, lucidePlus, lucideTrash2, lucideSave, lucideRefreshCw, lucideUpload, lucideX })],
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <a routerLink="/templates" class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ng-icon name="lucideArrowLeft" /> Templates
        </a>
        <h1 class="text-2xl font-semibold tracking-tight">{{ id() ? draft.name || 'Template' : 'New template' }}</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        @if (id()) {
          <button hlmBtn variant="destructive" type="button" (click)="remove()"><ng-icon name="lucideTrash2" /> Delete</button>
          <button hlmBtn variant="outline" type="button" [disabled]="busy()" (click)="save(false)"><ng-icon name="lucideSave" /> Save</button>
          <button hlmBtn type="button" [disabled]="busy()" (click)="save(true)"><ng-icon name="lucideRefreshCw" /> Save and update passes</button>
        } @else {
          <button hlmBtn type="button" [disabled]="busy()" (click)="save(false)"><ng-icon name="lucideSave" /> Create template</button>
        }
      </div>
    </header>

    @if (loaded()) {
      <div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,40rem)]">
        <form class="flex min-w-0 flex-col gap-6" (ngSubmit)="save(false)">
          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>General</h2>
            </div>
            <div hlmCardContent class="grid gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-2">
                <label hlmLabel for="name">Internal name</label>
                <input hlmInput id="name" name="name" required [(ngModel)]="draft.name" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="kind">Pass type</label>
                <select hlmInput id="kind" name="kind" [disabled]="!!id()" [(ngModel)]="draft.kind">
                  <option value="loyalty">Loyalty (storeCard · LoyaltyObject)</option>
                  <option value="generic">Generic (generic · GenericObject)</option>
                </select>
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="org">Organization</label>
                <input hlmInput id="org" name="org" [(ngModel)]="draft.organizationName" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="logoText">Logo text (Apple)</label>
                <input hlmInput id="logoText" name="logoText" [(ngModel)]="draft.logoText" />
              </div>
              <div class="flex flex-col gap-2 sm:col-span-2">
                <label hlmLabel for="desc">Description (Apple accessibility)</label>
                <input hlmInput id="desc" name="desc" [(ngModel)]="draft.description" />
              </div>
              @if (draft.kind === 'loyalty') {
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="program">Program name (Google)</label>
                  <input hlmInput id="program" name="program" [(ngModel)]="draft.google.programName" />
                </div>
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="issuerName">Issuer name (Google)</label>
                  <input hlmInput id="issuerName" name="issuerName" [placeholder]="draft.organizationName" [(ngModel)]="draft.google.issuerName" />
                </div>
              }
            </div>
          </section>

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>Appearance</h2>
            </div>
            <div hlmCardContent class="flex flex-col gap-5">
              <div class="grid gap-4 sm:grid-cols-3">
                @for (c of colorFields; track c.key) {
                  <div class="flex flex-col gap-2">
                    <label hlmLabel [for]="'color-' + c.key">{{ c.label }}</label>
                    <div class="flex items-center gap-2">
                      <input
                        type="color"
                        class="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                        [attr.aria-label]="c.label"
                        [name]="'picker-' + c.key"
                        [(ngModel)]="draft.colors[c.key]"
                      />
                      <input hlmInput class="font-mono" [id]="'color-' + c.key" [name]="'color-' + c.key" [(ngModel)]="draft.colors[c.key]" />
                    </div>
                  </div>
                }
              </div>
              <hlm-separator />
              <div class="grid gap-4 sm:grid-cols-2">
                @for (img of imageSlots(); track img.slot) {
                  <div class="flex flex-col gap-2">
                    <span hlmLabel>{{ img.label }}</span>
                    <div class="border-border flex items-center gap-3 rounded-md border p-2">
                      <span class="bg-muted inline-flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded">
                        @if (draft.images[img.slot]; as imgId) {
                          <img [src]="api.imageUrl(imgId)" alt="" class="size-full object-contain" />
                        }
                      </span>
                      <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <span class="text-muted-foreground text-xs">{{ img.hint }}</span>
                        <div class="flex flex-wrap items-center gap-1">
                          <input #fileInput type="file" accept="image/png" class="hidden" (change)="upload(img.slot, $event)" />
                          <button hlmBtn variant="outline" size="sm" type="button" (click)="fileInput.click()">
                            <ng-icon name="lucideUpload" /> Upload PNG
                          </button>
                          @if (draft.images[img.slot]) {
                            <button hlmBtn variant="ghost" size="icon-sm" type="button" [attr.aria-label]="'Remove ' + img.label" (click)="clearImage(img.slot)">
                              <ng-icon name="lucideX" />
                            </button>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          </section>

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>Fields</h2>
              <p hlmCardDescription>
                Use <code>{{ '{{key}}' }}</code> for per-pass data. Always available:
                <code>{{ '{{holderName}}' }}</code> and <code>{{ '{{serial}}' }}</code>.
              </p>
            </div>
            <div hlmCardContent>
              <hlm-tabs tab="headerFields">
                <hlm-tabs-list class="w-full justify-start overflow-x-auto">
                  @for (s of sections; track s) {
                    <button type="button" [hlmTabsTrigger]="s">{{ sectionLabels[s].title }} ({{ draft[s].length }})</button>
                  }
                </hlm-tabs-list>
                @for (s of sections; track s) {
                  <div [hlmTabsContent]="s" class="flex flex-col gap-3 pt-3">
                    <p class="text-muted-foreground text-xs">{{ sectionLabels[s].hint }}</p>
                    @for (f of draft[s]; track $index; let i = $index) {
                      <div class="border-border grid gap-2 rounded-md border p-3 sm:grid-cols-[7rem_1fr_1.5fr_auto]">
                        <input hlmInput aria-label="Key" placeholder="key" [name]="s + '-key-' + i" [(ngModel)]="f.key" />
                        <input hlmInput aria-label="Label" placeholder="Label" [name]="s + '-label-' + i" [(ngModel)]="f.label" />
                        <input hlmInput aria-label="Value" placeholder="Value or {{ '{{data}}' }}" [name]="s + '-value-' + i" [(ngModel)]="f.value" />
                        <button hlmBtn variant="ghost" size="icon" type="button" aria-label="Remove field" (click)="removeField(s, i)">
                          <ng-icon name="lucideTrash2" />
                        </button>
                        @if (s !== 'backFields') {
                          <input
                            hlmInput
                            class="sm:col-span-3"
                            aria-label="Change message (Apple)"
                            placeholder="Notification on change, e.g. You now have %@ stamps"
                            [name]="s + '-msg-' + i"
                            [(ngModel)]="f.changeMessage"
                          />
                        }
                      </div>
                    }
                    <div>
                      <button hlmBtn variant="outline" size="sm" type="button" (click)="addField(s)"><ng-icon name="lucidePlus" /> Add field</button>
                    </div>
                  </div>
                }
              </hlm-tabs>
            </div>
          </section>

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>Barcode</h2>
            </div>
            <div hlmCardContent class="grid gap-4 sm:grid-cols-3">
              <div class="flex flex-col gap-2">
                <label hlmLabel for="format">Format</label>
                <select hlmInput id="format" name="format" [(ngModel)]="draft.barcode.format">
                  <option value="QR">QR</option>
                  <option value="PDF417">PDF417</option>
                  <option value="AZTEC">Aztec</option>
                  <option value="CODE128">Code 128</option>
                </select>
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="bcMessage">Content</label>
                <input hlmInput id="bcMessage" name="bcMessage" placeholder="Empty = no barcode" [(ngModel)]="draft.barcode.message" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="bcAlt">Text below</label>
                <input hlmInput id="bcAlt" name="bcAlt" [(ngModel)]="draft.barcode.altText" />
              </div>
            </div>
          </section>

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle class="flex items-center gap-2"><ng-icon name="lucideNfc" /> NFC</h2>
              <p hlmCardDescription>
                Tap-to-identify at NFC terminals: Apple Value Added Services and Google Smart Tap.
              </p>
              <div hlmCardAction>
                <hlm-switch id="nfcEnabled" name="nfcEnabled" aria-label="Enable NFC" [(ngModel)]="draft.nfc.enabled" />
              </div>
            </div>
            @if (draft.nfc.enabled) {
              <div hlmCardContent class="flex flex-col gap-4">
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="nfcMessage">Payload</label>
                  <input hlmInput id="nfcMessage" name="nfcMessage" class="font-mono" placeholder="{{ '{{serial}}' }}" [(ngModel)]="draft.nfc.message" />
                  <p class="text-muted-foreground text-xs">
                    Sent to the terminal on tap. Supports placeholders; Apple truncates it to {{ nfcMaxBytes }} bytes
                    ({{ nfcBytes() }} without placeholders).
                  </p>
                </div>
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="nfcKey">Terminal public key (Apple)</label>
                  <textarea
                    hlmTextarea
                    id="nfcKey"
                    name="nfcKey"
                    rows="3"
                    class="font-mono text-xs"
                    placeholder="MDkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDIgAC…"
                    [(ngModel)]="draft.nfc.encryptionPublicKey"
                  ></textarea>
                  <p class="text-muted-foreground text-xs">
                    Base64 X.509 SubjectPublicKeyInfo with the ECDH P-256 key from your terminal provider. Without it, Apple passes are
                    issued without NFC. Requires a Pass Type ID with the NFC entitlement.
                  </p>
                </div>
                <label class="flex items-center justify-between gap-3 text-sm" for="nfcAuth">
                  <span>
                    <span class="font-medium">Require authentication (Apple)</span>
                    <span class="text-muted-foreground block text-xs">Face ID, Touch ID or passcode before sending the payload.</span>
                  </span>
                  <hlm-switch id="nfcAuth" name="nfcAuth" [(ngModel)]="draft.nfc.requiresAuthentication" />
                </label>
                <p class="text-muted-foreground text-xs">
                  Google: enables Smart Tap on the class with your issuer as redemption issuer. Smart Tap must be enabled for your issuer
                  account in the Google Pay &amp; Wallet Console.
                </p>
              </div>
            }
          </section>
        </form>

        <aside class="flex min-w-0 flex-col gap-4 xl:sticky xl:top-8 xl:self-start">
          <app-pass-preview [template]="draft" [holderName]="sampleName" [data]="sample" />
          @if (keys().length) {
            <div hlmCard>
              <div hlmCardHeader>
                <h2 hlmCardTitle class="text-sm">Sample data</h2>
              </div>
              <div hlmCardContent class="grid gap-3 sm:grid-cols-2">
                <div class="flex flex-col gap-1">
                  <label hlmLabel for="sampleName" class="text-xs">holderName</label>
                  <input hlmInput id="sampleName" [(ngModel)]="sampleName" />
                </div>
                @for (k of keys(); track k) {
                  <div class="flex flex-col gap-1">
                    <label hlmLabel class="text-xs" [for]="'sample-' + k">{{ k }}</label>
                    <input hlmInput [id]="'sample-' + k" [(ngModel)]="sample[k]" />
                  </div>
                }
              </div>
            </div>
          }
        </aside>
      </div>
    }
  `,
})
export class TemplateEditor implements OnInit {
  protected readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Route param (/templates/:id); vacío en /templates/new. */
  readonly id = input<string>();

  protected draft: TemplateInput = newTemplate();
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected sampleName = 'Jane Doe';
  protected sample: Record<string, string> = { stamps: '7', reward: 'Free coffee' };

  protected readonly sections: FieldSection[] = FIELD_SECTIONS;
  protected readonly sectionLabels = SECTION_LABELS;
  protected readonly nfcMaxBytes = NFC_MAX_BYTES;
  protected readonly colorFields: { key: keyof TemplateInput['colors']; label: string }[] = [
    { key: 'background', label: 'Background' },
    { key: 'foreground', label: 'Text' },
    { key: 'label', label: 'Labels' },
  ];

  protected keys() {
    return placeholderKeys(this.draft);
  }

  protected nfcBytes() {
    return new TextEncoder().encode(this.draft.nfc.message.replace(/\{\{[^}]*\}\}/g, '')).length;
  }

  protected imageSlots(): ImageSlotInfo[] {
    const slots: ImageSlotInfo[] = [
      { slot: 'icon', label: 'Icon', hint: 'Notifications and lock screen (Apple), 87×87' },
      { slot: 'logo', label: 'Logo', hint: 'Apple 480×150 max; Google shows it as a circle' },
    ];
    if (this.draft.kind === 'loyalty') slots.push({ slot: 'strip', label: 'Strip (Apple)', hint: '1125×432, behind the primary fields' });
    slots.push({ slot: 'hero', label: 'Hero (Google)', hint: '1032×336, at the bottom of the card' });
    return slots;
  }

  async ngOnInit() {
    const id = this.id();
    if (id) {
      try {
        this.draft = toInput(await this.api.template(id));
      } catch (e) {
        toast.error(errorMessage(e));
        await this.router.navigate(['/templates']);
        return;
      }
    }
    this.loaded.set(true);
  }

  protected addField(s: FieldSection) {
    const used = new Set(FIELD_SECTIONS.flatMap((sec) => this.draft[sec].map((f) => f.key)));
    let n = this.draft[s].length + 1;
    while (used.has(`field${n}`)) n++;
    this.draft[s].push({ key: `field${n}`, label: 'LABEL', value: '' });
  }

  protected removeField(s: FieldSection, i: number) {
    this.draft[s].splice(i, 1);
  }

  protected async upload(slot: ImageSlot, ev: Event) {
    const inputEl = ev.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    try {
      const meta = await this.api.uploadImage(file);
      this.draft.images[slot] = meta.id;
      // Zoneless: la mutación ocurre después de un await, fuera de un evento.
      this.cdr.markForCheck();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  protected clearImage(slot: ImageSlot) {
    delete this.draft.images[slot];
  }

  protected async save(publish: boolean) {
    this.busy.set(true);
    try {
      const id = this.id();
      if (id) {
        await this.api.updateTemplate(id, this.draft);
        if (publish) {
          const res = await this.api.publishTemplate(id);
          const msg = syncMessage(res);
          const text = `${res.passes} pass(es) · ${msg.text}`;
          if (msg.ok) toast.success('Template saved and passes updated', { description: text });
          else toast.warning('Template saved with warnings', { description: text });
        } else {
          toast.success('Template saved', { description: 'Existing passes update when you use “Save and update passes”.' });
        }
      } else {
        const t = await this.api.createTemplate(this.draft);
        toast.success('Template created');
        await this.router.navigate(['/templates', t.id]);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove() {
    const id = this.id();
    if (!id || !confirm('Delete this template?')) return;
    try {
      await this.api.deleteTemplate(id);
      toast.success('Template deleted');
      await this.router.navigate(['/templates']);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
}
