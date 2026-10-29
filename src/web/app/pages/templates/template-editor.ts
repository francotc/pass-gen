import { ChangeDetectorRef, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucidePlus, lucideRefreshCw, lucideSave, lucideTrash2, lucideUpload, lucideX } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { FIELD_SECTIONS, type FieldSection, type ImageSlot, type TemplateInput } from '../../../../worker/types';
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
    HlmTabsImports,
    HlmTextareaImports,
  ],
  providers: [provideIcons({ lucideArrowLeft, lucidePlus, lucideTrash2, lucideSave, lucideRefreshCw, lucideUpload, lucideX })],
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <a routerLink="/plantillas" class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ng-icon name="lucideArrowLeft" /> Plantillas
        </a>
        <h1 class="text-2xl font-semibold tracking-tight">{{ id() ? draft.name || 'Plantilla' : 'Nueva plantilla' }}</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        @if (id()) {
          <button hlmBtn variant="destructive" type="button" (click)="remove()"><ng-icon name="lucideTrash2" /> Eliminar</button>
          <button hlmBtn variant="outline" type="button" [disabled]="busy()" (click)="save(false)"><ng-icon name="lucideSave" /> Guardar</button>
          <button hlmBtn type="button" [disabled]="busy()" (click)="save(true)"><ng-icon name="lucideRefreshCw" /> Guardar y actualizar pases</button>
        } @else {
          <button hlmBtn type="button" [disabled]="busy()" (click)="save(false)"><ng-icon name="lucideSave" /> Crear plantilla</button>
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
                <label hlmLabel for="name">Nombre interno</label>
                <input hlmInput id="name" name="name" required [(ngModel)]="draft.name" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="kind">Tipo de pase</label>
                <select hlmInput id="kind" name="kind" [disabled]="!!id()" [(ngModel)]="draft.kind">
                  <option value="loyalty">Fidelidad (storeCard · LoyaltyObject)</option>
                  <option value="generic">Genérico (generic · GenericObject)</option>
                </select>
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="org">Organización</label>
                <input hlmInput id="org" name="org" [(ngModel)]="draft.organizationName" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="logoText">Texto junto al logo (Apple)</label>
                <input hlmInput id="logoText" name="logoText" [(ngModel)]="draft.logoText" />
              </div>
              <div class="flex flex-col gap-2 sm:col-span-2">
                <label hlmLabel for="desc">Descripción (accesibilidad en Apple)</label>
                <input hlmInput id="desc" name="desc" [(ngModel)]="draft.description" />
              </div>
              @if (draft.kind === 'loyalty') {
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="program">Nombre del programa (Google)</label>
                  <input hlmInput id="program" name="program" [(ngModel)]="draft.google.programName" />
                </div>
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="issuerName">Emisor (Google)</label>
                  <input hlmInput id="issuerName" name="issuerName" [placeholder]="draft.organizationName" [(ngModel)]="draft.google.issuerName" />
                </div>
              }
            </div>
          </section>

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>Apariencia</h2>
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
                            <ng-icon name="lucideUpload" /> Subir PNG
                          </button>
                          @if (draft.images[img.slot]) {
                            <button hlmBtn variant="ghost" size="icon-sm" type="button" [attr.aria-label]="'Quitar ' + img.label" (click)="clearImage(img.slot)">
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
              <h2 hlmCardTitle>Campos</h2>
              <p hlmCardDescription>
                Usá <code>{{ '{{clave}}' }}</code> para datos de cada pase. Siempre disponibles:
                <code>{{ '{{holderName}}' }}</code> y <code>{{ '{{serial}}' }}</code>.
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
                        <input hlmInput aria-label="Clave" placeholder="clave" [name]="s + '-key-' + i" [(ngModel)]="f.key" />
                        <input hlmInput aria-label="Etiqueta" placeholder="Etiqueta" [name]="s + '-label-' + i" [(ngModel)]="f.label" />
                        <input hlmInput aria-label="Valor" placeholder="Valor o {{ '{{dato}}' }}" [name]="s + '-value-' + i" [(ngModel)]="f.value" />
                        <button hlmBtn variant="ghost" size="icon" type="button" aria-label="Quitar campo" (click)="removeField(s, i)">
                          <ng-icon name="lucideTrash2" />
                        </button>
                        @if (s !== 'backFields') {
                          <input
                            hlmInput
                            class="sm:col-span-3"
                            aria-label="Mensaje al cambiar (Apple)"
                            placeholder="Notificación al cambiar, ej: Ahora tenés %@ sellos"
                            [name]="s + '-msg-' + i"
                            [(ngModel)]="f.changeMessage"
                          />
                        }
                      </div>
                    }
                    <div>
                      <button hlmBtn variant="outline" size="sm" type="button" (click)="addField(s)"><ng-icon name="lucidePlus" /> Agregar campo</button>
                    </div>
                  </div>
                }
              </hlm-tabs>
            </div>
          </section>

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>Código</h2>
            </div>
            <div hlmCardContent class="grid gap-4 sm:grid-cols-3">
              <div class="flex flex-col gap-2">
                <label hlmLabel for="format">Formato</label>
                <select hlmInput id="format" name="format" [(ngModel)]="draft.barcode.format">
                  <option value="QR">QR</option>
                  <option value="PDF417">PDF417</option>
                  <option value="AZTEC">Aztec</option>
                  <option value="CODE128">Code 128</option>
                </select>
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="bcMessage">Contenido</label>
                <input hlmInput id="bcMessage" name="bcMessage" placeholder="Vacío = sin código" [(ngModel)]="draft.barcode.message" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="bcAlt">Texto debajo</label>
                <input hlmInput id="bcAlt" name="bcAlt" [(ngModel)]="draft.barcode.altText" />
              </div>
            </div>
          </section>
        </form>

        <aside class="flex min-w-0 flex-col gap-4 xl:sticky xl:top-8 xl:self-start">
          <app-pass-preview [template]="draft" [holderName]="sampleName" [data]="sample" />
          @if (keys().length) {
            <div hlmCard>
              <div hlmCardHeader>
                <h2 hlmCardTitle class="text-sm">Datos de ejemplo</h2>
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

  /** Route param (/plantillas/:id); vacío en /plantillas/nueva. */
  readonly id = input<string>();

  protected draft: TemplateInput = newTemplate();
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected sampleName = 'María González';
  protected sample: Record<string, string> = { stamps: '7', reward: 'Café gratis' };

  protected readonly sections: FieldSection[] = FIELD_SECTIONS;
  protected readonly sectionLabels = SECTION_LABELS;
  protected readonly colorFields: { key: keyof TemplateInput['colors']; label: string }[] = [
    { key: 'background', label: 'Fondo' },
    { key: 'foreground', label: 'Texto' },
    { key: 'label', label: 'Etiquetas' },
  ];

  protected keys() {
    return placeholderKeys(this.draft);
  }

  protected imageSlots(): ImageSlotInfo[] {
    const slots: ImageSlotInfo[] = [
      { slot: 'icon', label: 'Ícono', hint: 'Notificaciones y pantalla de bloqueo (Apple), 87×87' },
      { slot: 'logo', label: 'Logo', hint: 'Apple 480×150 máx.; Google lo muestra circular' },
    ];
    if (this.draft.kind === 'loyalty') slots.push({ slot: 'strip', label: 'Strip (Apple)', hint: '1125×432, detrás de los campos principales' });
    slots.push({ slot: 'hero', label: 'Hero (Google)', hint: '1032×336, al pie de la tarjeta' });
    return slots;
  }

  async ngOnInit() {
    const id = this.id();
    if (id) {
      try {
        this.draft = toInput(await this.api.template(id));
      } catch (e) {
        toast.error(errorMessage(e));
        await this.router.navigate(['/plantillas']);
        return;
      }
    }
    this.loaded.set(true);
  }

  protected addField(s: FieldSection) {
    const used = new Set(FIELD_SECTIONS.flatMap((sec) => this.draft[sec].map((f) => f.key)));
    let n = this.draft[s].length + 1;
    while (used.has(`campo${n}`)) n++;
    this.draft[s].push({ key: `campo${n}`, label: 'ETIQUETA', value: '' });
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
          const text = `${res.passes} pase(s) · ${msg.text}`;
          if (msg.ok) toast.success('Plantilla guardada y pases actualizados', { description: text });
          else toast.warning('Plantilla guardada con avisos', { description: text });
        } else {
          toast.success('Plantilla guardada', { description: 'Los pases existentes se actualizan al usar «Guardar y actualizar pases».' });
        }
      } else {
        const t = await this.api.createTemplate(this.draft);
        toast.success('Plantilla creada');
        await this.router.navigate(['/plantillas', t.id]);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove() {
    const id = this.id();
    if (!id || !confirm('¿Eliminar esta plantilla?')) return;
    try {
      await this.api.deleteTemplate(id);
      toast.success('Plantilla eliminada');
      await this.router.navigate(['/plantillas']);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
}
