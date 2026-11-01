import { ChangeDetectorRef, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideImage,
  lucideLocateFixed,
  lucideMousePointerClick,
  lucidePipette,
  lucideRotateCcw,
  lucideMapPin,
  lucideNfc,
  lucidePlus,
  lucideRefreshCw,
  lucideSave,
  lucideShieldCheck,
  lucideTrash2,
  lucideUpload,
  lucideX,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import {
  FIELD_SECTIONS,
  MAX_FEATURED_ACTIONS,
  MAX_LINKS,
  MAX_LOCATIONS,
  MAX_MODULES,
  NFC_MAX_BYTES,
  BRAND_FIELDS,
  type BrandField,
  type BrandSettings,
  type Field,
  type FeaturedActionType,
  type FieldSection,
  type ImageSlot,
  type PassButton,
  type TemplateInput,
} from '../../../../worker/types';
import { Api, errorMessage } from '../../core/api.service';
import { applyBrand, BRAND_FIELD_LABELS, brandFromTemplate, COLOR_FIELDS, getField, setField, slugKey } from '../../core/brand';
import { contrast } from '../../core/color';
import { dominantColor } from '../../core/dominant-color';
import { syncMessage } from '../../core/sync-message';
import { newTemplate, placeholderKeys, SECTION_LABELS, toInput } from '../../core/template-utils';
import { ImageStudio } from '../../shared/image-studio';
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
    ImageStudio,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSeparatorImports,
    HlmSwitchImports,
    HlmTabsImports,
    HlmTextareaImports,
  ],
  providers: [provideIcons({ lucidePipette, lucideRotateCcw, lucideArrowLeft, lucideShieldCheck, lucideImage, lucideMousePointerClick, lucideLocateFixed, lucideMapPin, lucideNfc, lucidePlus, lucideTrash2, lucideSave, lucideRefreshCw, lucideUpload, lucideX })],
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
                <input hlmInput id="name" name="name" required [(ngModel)]="draft.name" (ngModelChange)="refresh()" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="kind">Pass type</label>
                <select hlmInput id="kind" name="kind" [disabled]="!!id()" [(ngModel)]="draft.kind">
                  <option value="loyalty">Loyalty (storeCard · LoyaltyObject)</option>
                  <option value="generic">Generic (generic · GenericObject)</option>
                </select>
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="business">Business name</label>
                <input hlmInput id="business" name="business" placeholder="Café Central" [(ngModel)]="brand.businessName" (ngModelChange)="refresh()" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="programName">{{ draft.kind === 'loyalty' ? 'Program name' : 'Pass title' }}</label>
                <input hlmInput id="programName" name="programName" placeholder="Stamp card" [(ngModel)]="brand.programName" (ngModelChange)="refresh()" />
              </div>
              <div class="flex flex-col gap-2 sm:col-span-2">
                <label hlmLabel for="brandColor">Brand color</label>
                <div class="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    class="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                    aria-label="Brand color"
                    name="brandColorPicker"
                    [(ngModel)]="brand.color"
                    (ngModelChange)="refresh()"
                  />
                  <input hlmInput id="brandColor" name="brandColor" class="w-32 font-mono" [(ngModel)]="brand.color" (ngModelChange)="refresh()" />
                  <button hlmBtn variant="outline" size="sm" type="button" [disabled]="!logoImageId()" (click)="useLogoColor()">
                    <ng-icon name="lucidePipette" /> From logo
                  </button>
                  <span class="text-muted-foreground text-xs">Text and label colors are picked for contrast.</span>
                </div>
              </div>

              <details class="sm:col-span-2">
                <summary class="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
                  Generated values ({{ customCount() }} customized) · edit any of them
                </summary>
                <div class="mt-3 flex flex-col gap-2">
                  @for (f of brandFields; track f) {
                    <div class="flex flex-col gap-1">
                      <label hlmLabel class="text-xs" [for]="'bf-' + f">{{ brandLabels[f].label }}</label>
                      <div class="flex items-center gap-2">
                        @if (isColor(f)) {
                          <input
                            type="color"
                            class="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                            [attr.aria-label]="brandLabels[f].label"
                            [name]="'bfc-' + f"
                            [ngModel]="get(f)"
                            (ngModelChange)="override(f, $event)"
                          />
                        }
                        <input hlmInput class="min-w-0 flex-1" [class.font-mono]="isColor(f)" [id]="'bf-' + f" [name]="'bf-' + f" [ngModel]="get(f)" (ngModelChange)="override(f, $event)" />
                        @if (f === 'foreground' || f === 'label') {
                          <span class="text-muted-foreground w-14 shrink-0 text-right text-xs" [class.text-destructive]="contrastOf(f) < (f === 'label' ? 3 : 4.5)">
                            {{ contrastOf(f).toFixed(1) }}:1
                          </span>
                        }
                        @if (isAuto(f)) {
                          <span hlmBadge variant="secondary">Auto</span>
                        } @else {
                          <button hlmBtn variant="ghost" size="sm" type="button" (click)="resetField(f)"><ng-icon name="lucideRotateCcw" /> Auto</button>
                        }
                      </div>
                    </div>
                  }
                </div>
              </details>
            </div>
          </section>

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>Appearance</h2>
            </div>
            <div hlmCardContent class="flex flex-col gap-5">
              <app-image-studio [kind]="draft.kind" [poster]="draft.background.poster" (generated)="applyGenerated($event)" (logoColor)="onLogoColor($event)" />
              <details class="group">
                <summary class="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
                  Generated images ({{ imageCount() }}) · replace one individually
                </summary>
                <div class="mt-3">
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
              </details>
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
                      <div class="border-border grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1.5fr_8rem_auto]">
                        <input hlmInput aria-label="Label" placeholder="Label" [name]="s + '-label-' + i" [ngModel]="f.label" (ngModelChange)="onLabel(f, $event)" />
                        <input hlmInput aria-label="Value" placeholder="Value or {{ '{{data}}' }}" [name]="s + '-value-' + i" [(ngModel)]="f.value" />
                        <input hlmInput class="font-mono text-xs" aria-label="Key (auto from label)" placeholder="key" [name]="s + '-key-' + i" [(ngModel)]="f.key" />
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
                <input hlmInput id="bcMessage" name="bcMessage" placeholder="Empty = no barcode" [(ngModel)]="draft.barcode.message" (ngModelChange)="refresh()" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="bcAlt" class="flex items-center justify-between gap-2">
                  Text below
                  @if (isAuto('altText')) {
                    <span hlmBadge variant="secondary">Auto</span>
                  } @else {
                    <button hlmBtn variant="link" size="xs" type="button" (click)="resetField('altText')">Reset</button>
                  }
                </label>
                <input hlmInput id="bcAlt" name="bcAlt" [ngModel]="get('altText')" (ngModelChange)="override('altText', $event)" />
              </div>
            </div>
          </section>

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle class="flex items-center gap-2"><ng-icon name="lucideShieldCheck" /> One-time code (OTP)</h2>
              <p hlmCardDescription>
                The barcode becomes <code>SERIAL.CODE</code> and is checked with the Verify code tool on Passes. Google rotates the code on
                the phone; Apple changes it every 24 h (daily update at 00:01 UTC) and each code is valid for 48 h.
              </p>
              <div hlmCardAction>
                <hlm-switch id="otpEnabled" name="otpEnabled" aria-label="Enable one-time code" [(ngModel)]="draft.otp.enabled" />
              </div>
            </div>
            @if (draft.otp.enabled) {
              <div hlmCardContent class="flex max-w-xs flex-col gap-2">
                <label hlmLabel for="otpPeriod">Google rotation period (seconds)</label>
                <input hlmInput id="otpPeriod" name="otpPeriod" type="number" min="10" max="300" step="1" [(ngModel)]="draft.otp.googlePeriodSeconds" />
                <p class="text-muted-foreground text-xs">Replaces the barcode content above. Format and placement still apply.</p>
              </div>
            }
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

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle class="flex items-center gap-2"><ng-icon name="lucideImage" /> Full-screen background</h2>
              <p hlmCardDescription>
                Apple: poster style (iOS 27+) with the background image edge to edge; older iPhones show the classic layout. Google has no
                full-screen background: the image is shown full width in the pass details.
              </p>
              <div hlmCardAction>
                <hlm-switch id="poster" name="poster" aria-label="Use the poster style" [(ngModel)]="draft.background.poster" />
              </div>
            </div>
            <div hlmCardContent class="flex flex-col gap-2 text-sm">
              <p class="text-muted-foreground text-xs">
                Upload the image in Appearance → Background. In poster style Apple shows 1 header field, up to 4 primary fields (primary +
                secondary) and 2 footer fields (auxiliary). The poster keys are not in Apple's public pass.json reference yet, so test on
                an iPhone with iOS 27.
              </p>
            </div>
          </section>

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle class="flex items-center gap-2"><ng-icon name="lucideMousePointerClick" /> Buttons &amp; links</h2>
              <p hlmCardDescription>All URLs support placeholders such as <code>{{ '{{serial}}' }}</code>.</p>
            </div>
            <div hlmCardContent class="flex flex-col gap-6">
              <div class="flex flex-col gap-3">
                <div>
                  <span class="text-sm font-medium">Front button (Google)</span>
                  <p class="text-muted-foreground text-xs">AppLinkData: a call-to-action button on the front of the pass.</p>
                </div>
                <div class="grid gap-2 sm:grid-cols-3">
                  <input hlmInput maxlength="30" aria-label="Button label" placeholder="Label (max 30)" name="btnLabel" [(ngModel)]="button.label" />
                  <input hlmInput type="url" aria-label="Button URL" placeholder="https://" name="btnUrl" [(ngModel)]="button.url" />
                  <input hlmInput aria-label="Android package (optional)" placeholder="Android package (optional)" name="btnPkg" [(ngModel)]="button.androidPackage" />
                </div>
              </div>

              <hlm-separator />

              <div class="flex flex-col gap-3">
                <div>
                  <span class="text-sm font-medium">Links (both)</span>
                  <p class="text-muted-foreground text-xs">
                    Google: links section in the details (LinksModuleData). Apple: tappable links on the back (attributedValue). Supports
                    https, tel:, mailto: and geo:.
                  </p>
                </div>
                @for (l of draft.actions.links; track $index; let i = $index) {
                  <div class="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                    <input hlmInput maxlength="40" aria-label="Link label" placeholder="Label" [name]="'link-label-' + i" [(ngModel)]="l.label" />
                    <input hlmInput aria-label="Link URL" placeholder="https:// · tel: · mailto: · geo:" [name]="'link-url-' + i" [(ngModel)]="l.url" />
                    <button hlmBtn variant="ghost" size="icon" type="button" aria-label="Remove link" (click)="draft.actions.links.splice(i, 1)">
                      <ng-icon name="lucideTrash2" />
                    </button>
                  </div>
                }
                <div>
                  <button hlmBtn variant="outline" size="sm" type="button" [disabled]="draft.actions.links.length >= maxLinks" (click)="draft.actions.links.push({ label: '', url: '' })">
                    <ng-icon name="lucidePlus" /> Add link
                  </button>
                </div>
              </div>

              <hlm-separator />

              <div class="flex flex-col gap-3">
                <div>
                  <span class="text-sm font-medium">Value-added modules (Google)</span>
                  <p class="text-muted-foreground text-xs">Cards with image, title (60), text (50) and link. Up to {{ maxModules }}.</p>
                </div>
                @for (m of draft.actions.modules; track $index; let i = $index) {
                  <div class="border-border grid gap-2 rounded-md border p-3 sm:grid-cols-[4rem_1fr_1fr_auto]">
                    <span class="bg-muted row-span-2 inline-flex size-16 items-center justify-center overflow-hidden rounded">
                      @if (m.imageId) {
                        <img [src]="api.imageUrl(m.imageId)" alt="" class="size-full object-cover" />
                      } @else {
                        <input #modImg type="file" accept="image/png" class="hidden" (change)="uploadModuleImage(i, $event)" />
                        <button hlmBtn variant="ghost" size="icon" type="button" aria-label="Upload module image" (click)="modImg.click()">
                          <ng-icon name="lucideUpload" />
                        </button>
                      }
                    </span>
                    <input hlmInput maxlength="60" aria-label="Module title" placeholder="Title" [name]="'mod-h-' + i" [(ngModel)]="m.header" />
                    <input hlmInput maxlength="50" aria-label="Module text" placeholder="Text" [name]="'mod-b-' + i" [(ngModel)]="m.body" />
                    <button hlmBtn variant="ghost" size="icon" type="button" aria-label="Remove module" (click)="draft.actions.modules.splice(i, 1)">
                      <ng-icon name="lucideTrash2" />
                    </button>
                    <input hlmInput class="sm:col-span-2" aria-label="Module link" placeholder="Link (optional)" [name]="'mod-u-' + i" [(ngModel)]="m.url" />
                    @if (m.imageId) {
                      <button hlmBtn variant="ghost" size="sm" type="button" (click)="m.imageId = undefined">Remove image</button>
                    }
                  </div>
                }
                <div>
                  <button hlmBtn variant="outline" size="sm" type="button" [disabled]="draft.actions.modules.length >= maxModules" (click)="draft.actions.modules.push({ header: '', body: '' })">
                    <ng-icon name="lucidePlus" /> Add module
                  </button>
                </div>
              </div>

              <hlm-separator />

              <div class="flex flex-col gap-3">
                <div>
                  <span class="text-sm font-medium">Featured actions (Apple, poster style)</span>
                  <p class="text-muted-foreground text-xs">Up to {{ maxFeatured }} action cards in Wallet (iOS 27+). Only shown with the poster style.</p>
                </div>
                @for (f of draft.actions.featured; track $index; let i = $index) {
                  <div class="grid gap-2 sm:grid-cols-[12rem_1fr_1fr_auto]">
                    <select hlmInput aria-label="Action" [name]="'fa-a-' + i" [(ngModel)]="f.action">
                      @for (a of featuredOptions; track a.value) {
                        <option [value]="a.value">{{ a.label }}</option>
                      }
                    </select>
                    <input hlmInput aria-label="Action URL" placeholder="https:// · tel: · geo:" [name]="'fa-u-' + i" [(ngModel)]="f.url" />
                    <input hlmInput maxlength="40" aria-label="Action label (optional)" placeholder="Label (optional)" [name]="'fa-l-' + i" [(ngModel)]="f.label" />
                    <button hlmBtn variant="ghost" size="icon" type="button" aria-label="Remove action" (click)="draft.actions.featured.splice(i, 1)">
                      <ng-icon name="lucideTrash2" />
                    </button>
                  </div>
                }
                <div>
                  <button
                    hlmBtn
                    variant="outline"
                    size="sm"
                    type="button"
                    [disabled]="draft.actions.featured.length >= maxFeatured"
                    (click)="draft.actions.featured.push({ action: 'membershipBenefits', url: '' })"
                  >
                    <ng-icon name="lucidePlus" /> Add featured action
                  </button>
                </div>
              </div>

              <hlm-separator />

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="appStoreIds">App Store ids (Apple, optional)</label>
                  <input hlmInput id="appStoreIds" name="appStoreIds" inputmode="numeric" placeholder="123456789, 987654321" [(ngModel)]="appStoreIds" />
                  <p class="text-muted-foreground text-xs">Your app shows on the pass and opens from it.</p>
                </div>
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="appLaunchURL">App launch URL (Apple, optional)</label>
                  <input hlmInput id="appLaunchURL" name="appLaunchURL" placeholder="myapp://card/{{ '{{serial}}' }}" [(ngModel)]="draft.actions.appLaunchURL" />
                </div>
              </div>
            </div>
          </section>

          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle class="flex items-center gap-2"><ng-icon name="lucideMapPin" /> Locations</h2>
              <p hlmCardDescription>
                Up to {{ maxLocations }} places where the pass becomes relevant. Apple shows it on the lock screen nearby; Google sends a
                location notification (radius set by Google).
              </p>
            </div>
            <div hlmCardContent class="flex flex-col gap-4">
              @for (l of draft.locations.points; track $index; let i = $index) {
                <div class="border-border grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <input hlmInput aria-label="Location name" placeholder="Name" [name]="'loc-name-' + i" [(ngModel)]="l.name" />
                  <input
                    hlmInput
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    required
                    aria-label="Latitude"
                    placeholder="Latitude"
                    [name]="'loc-lat-' + i"
                    [(ngModel)]="l.latitude"
                  />
                  <input
                    hlmInput
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    required
                    aria-label="Longitude"
                    placeholder="Longitude"
                    [name]="'loc-lng-' + i"
                    [(ngModel)]="l.longitude"
                  />
                  <button hlmBtn variant="ghost" size="icon" type="button" aria-label="Remove location" (click)="draft.locations.points.splice(i, 1)">
                    <ng-icon name="lucideTrash2" />
                  </button>
                  <input
                    hlmInput
                    class="sm:col-span-2"
                    maxlength="100"
                    aria-label="Lock screen text (Apple)"
                    placeholder="Lock screen text (Apple)"
                    [name]="'loc-text-' + i"
                    [(ngModel)]="l.relevantText"
                  />
                  <input
                    hlmInput
                    type="number"
                    step="any"
                    aria-label="Altitude in meters (Apple, optional)"
                    placeholder="Altitude (m)"
                    [name]="'loc-alt-' + i"
                    [(ngModel)]="l.altitude"
                  />
                </div>
              }
              <div class="flex flex-wrap gap-2">
                <button hlmBtn variant="outline" size="sm" type="button" [disabled]="draft.locations.points.length >= maxLocations" (click)="addLocation()">
                  <ng-icon name="lucidePlus" /> Add location
                </button>
                <button
                  hlmBtn
                  variant="outline"
                  size="sm"
                  type="button"
                  [disabled]="locating() || draft.locations.points.length >= maxLocations"
                  (click)="addCurrentLocation()"
                >
                  <ng-icon name="lucideLocateFixed" /> {{ locating() ? 'Locating…' : 'Use my current location' }}
                </button>
              </div>

              <div class="flex max-w-xs flex-col gap-2">
                <label hlmLabel for="maxDistance">Max distance in meters (Apple, optional)</label>
                <input hlmInput id="maxDistance" name="maxDistance" type="number" min="1" step="1" placeholder="System default" [(ngModel)]="draft.locations.maxDistance" />
                <p class="text-muted-foreground text-xs">Apple uses the smaller of this value and its own default for the pass type.</p>
              </div>

              <hlm-separator />

              <div class="flex flex-col gap-3">
                <div>
                  <span class="text-sm font-medium">iBeacons (Apple)</span>
                  <p class="text-muted-foreground text-xs">Up to {{ maxLocations }}. The pass shows up when the iPhone is near one of these beacons.</p>
                </div>
                @for (b of draft.locations.beacons; track $index; let i = $index) {
                  <div class="border-border grid gap-2 rounded-md border p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                    <input
                      hlmInput
                      class="font-mono text-xs"
                      required
                      aria-label="Proximity UUID"
                      placeholder="Proximity UUID"
                      [name]="'bcn-uuid-' + i"
                      [(ngModel)]="b.proximityUUID"
                    />
                    <input hlmInput type="number" min="0" max="65535" step="1" aria-label="Major" placeholder="Major" [name]="'bcn-major-' + i" [(ngModel)]="b.major" />
                    <input hlmInput type="number" min="0" max="65535" step="1" aria-label="Minor" placeholder="Minor" [name]="'bcn-minor-' + i" [(ngModel)]="b.minor" />
                    <button hlmBtn variant="ghost" size="icon" type="button" aria-label="Remove beacon" (click)="draft.locations.beacons.splice(i, 1)">
                      <ng-icon name="lucideTrash2" />
                    </button>
                    <input
                      hlmInput
                      class="sm:col-span-3"
                      maxlength="100"
                      aria-label="Beacon lock screen text"
                      placeholder="Lock screen text"
                      [name]="'bcn-text-' + i"
                      [(ngModel)]="b.relevantText"
                    />
                  </div>
                }
                <div>
                  <button hlmBtn variant="outline" size="sm" type="button" [disabled]="draft.locations.beacons.length >= maxLocations" (click)="addBeacon()">
                    <ng-icon name="lucidePlus" /> Add beacon
                  </button>
                </div>
              </div>
            </div>
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
  protected readonly maxLocations = MAX_LOCATIONS;
  protected readonly maxLinks = MAX_LINKS;
  protected readonly maxModules = MAX_MODULES;
  protected readonly maxFeatured = MAX_FEATURED_ACTIONS;
  /** Botón de Google editable; se guarda solo si tiene datos. */
  protected button: PassButton = { label: '', url: '' };
  /** App Store ids como texto separado por comas. */
  protected appStoreIds = '';
  protected readonly featuredOptions: { value: FeaturedActionType; label: string }[] = [
    { value: 'membershipBenefits', label: 'View membership benefits' },
    { value: 'viewOffersRewards', label: 'View offers and rewards' },
    { value: 'addToBalance', label: 'Add to balance' },
    { value: 'shop', label: 'Shop online or in-app' },
    { value: 'order', label: 'Order delivery or pickup' },
    { value: 'bookAppointment', label: 'Book an appointment' },
    { value: 'call', label: 'Call' },
    { value: 'place', label: 'Go to location' },
    { value: 'bookCar', label: 'Book a car' },
    { value: 'bookFlight', label: 'Book a flight' },
    { value: 'bookStay', label: 'Book a stay' },
    { value: 'viewSchedule', label: 'View schedule' },
    { value: 'watchTrailer', label: 'Watch trailer' },
    { value: 'listenToMusic', label: 'Listen to music' },
  ];
  protected readonly locating = signal(false);
  protected readonly brandFields = BRAND_FIELDS.filter((f) => f !== 'altText');
  protected readonly brandLabels = BRAND_FIELD_LABELS;
  /** Marca del draft (siempre presente en el editor). */
  protected get brand(): BrandSettings {
    return this.draft.brand!;
  }

  protected keys() {
    return placeholderKeys(this.draft);
  }

  protected nfcBytes() {
    return new TextEncoder().encode(this.draft.nfc.message.replace(/\{\{[^}]*\}\}/g, '')).length;
  }

  protected imageCount() {
    return Object.values(this.draft.images).filter(Boolean).length;
  }

  protected applyGenerated(images: Partial<Record<ImageSlot, string>>) {
    Object.assign(this.draft.images, images);
    this.cdr.markForCheck();
  }

  protected imageSlots(): ImageSlotInfo[] {
    const slots: ImageSlotInfo[] = [
      { slot: 'icon', label: 'Icon', hint: 'Notifications and lock screen (Apple), 87×87' },
      { slot: 'logo', label: 'Logo (Apple)', hint: 'Top-left, max 480×150' },
      { slot: 'logoSquare', label: 'Square logo (Google)', hint: 'Shown as a circle, 660×660' },
    ];
    if (this.draft.kind === 'loyalty') slots.push({ slot: 'strip', label: 'Strip (Apple)', hint: '1125×432, behind the primary fields' });
    slots.push({ slot: 'hero', label: 'Hero (Google)', hint: '1032×336, at the bottom of the card' });
    slots.push({ slot: 'background', label: 'Background', hint: 'Full screen on Apple poster style; full width in Google details' });
    return slots;
  }

  async ngOnInit() {
    const id = this.id();
    if (id) {
      try {
        this.draft = toInput(await this.api.template(id));
        this.button = { label: '', url: '', ...this.draft.actions.button };
        this.appStoreIds = this.draft.actions.appStoreIds.join(', ');
      } catch (e) {
        toast.error(errorMessage(e));
        await this.router.navigate(['/templates']);
        return;
      }
    }
    this.draft.brand ??= brandFromTemplate(this.draft);
    applyBrand(this.draft);
    // La vista previa lee el botón desde el draft; se comparte la referencia mientras se edita.
    this.draft.actions.button = this.button;
    this.savedCodeSignature = this.codeSignature(this.draft);
    this.loaded.set(true);
  }

  /** Regenera los valores automáticos (marca, colores, texto del código). */
  protected refresh() {
    applyBrand(this.draft);
  }

  protected get(f: BrandField) {
    return getField(this.draft, f);
  }

  protected isAuto(f: BrandField) {
    return !this.brand.overrides.includes(f);
  }

  protected isColor(f: BrandField) {
    return COLOR_FIELDS.includes(f);
  }

  protected customCount() {
    return this.brand.overrides.filter((f) => f !== 'altText').length;
  }

  protected contrastOf(f: 'foreground' | 'label') {
    return contrast(this.draft.colors[f], this.draft.colors.background);
  }

  /** Editar un valor generado lo deja personalizado (ya no se regenera). */
  protected override(f: BrandField, v: string) {
    setField(this.draft, f, v);
    if (this.isAuto(f)) this.brand.overrides.push(f);
  }

  protected resetField(f: BrandField) {
    this.brand.overrides = this.brand.overrides.filter((x) => x !== f);
    applyBrand(this.draft);
  }

  protected logoImageId() {
    return this.draft.images.logoSquare ?? this.draft.images.logo ?? this.draft.images.icon;
  }

  /** Color dominante del logo subido como color de marca. */
  protected async useLogoColor() {
    const id = this.logoImageId();
    if (!id) return;
    try {
      const img = new Image();
      img.src = this.api.imageUrl(id);
      await img.decode();
      const c = dominantColor(img);
      if (!c) {
        toast.warning('Could not find a clear color in the logo');
        return;
      }
      this.setBrandColor(c);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  protected onLogoColor(c: string) {
    if (c.toLowerCase() === this.brand.color.toLowerCase()) return;
    toast('Use the logo color for the pass?', {
      description: c,
      action: { label: 'Use it', onClick: () => this.setBrandColor(c) },
    });
  }

  private setBrandColor(c: string) {
    this.brand.color = c;
    applyBrand(this.draft);
    this.cdr.markForCheck();
  }

  /** Etiqueta de campo: la clave se genera sola mientras no se haya editado a mano. */
  protected onLabel(f: Field, label: string) {
    const auto = !f.key || /^field\d*$/.test(f.key) || f.key === slugKey(f.label);
    f.label = label;
    if (auto) f.key = this.uniqueKey(slugKey(label), f);
  }

  private uniqueKey(base: string, self: Field) {
    const used = new Set(FIELD_SECTIONS.flatMap((sec) => this.draft[sec].filter((x) => x !== self).map((x) => x.key)));
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
    return key;
  }

  protected addField(s: FieldSection) {
    const used = new Set(FIELD_SECTIONS.flatMap((sec) => this.draft[sec].map((f) => f.key)));
    let n = this.draft[s].length + 1;
    while (used.has(`field${n}`)) n++;
    this.draft[s].push({ key: `field${n}`, label: 'LABEL', value: '' });
  }

  protected addLocation(latitude = 0, longitude = 0) {
    this.draft.locations.points.push({ name: '', latitude, longitude, relevantText: '' });
  }

  protected addCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not available in this browser');
      return;
    }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // 6 decimales ≈ 10 cm, suficiente para el radio de relevancia.
        const round = (n: number) => Math.round(n * 1e6) / 1e6;
        this.addLocation(round(pos.coords.latitude), round(pos.coords.longitude));
        this.locating.set(false);
        // Zoneless: el callback corre fuera de un evento de Angular.
        this.cdr.markForCheck();
      },
      (err) => {
        this.locating.set(false);
        toast.error(`Could not get your location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  protected addBeacon() {
    this.draft.locations.beacons.push({ proximityUUID: '', relevantText: '' });
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

  /** Configuración que define el código escaneable; si cambia, se actualizan los pases al guardar. */
  private savedCodeSignature = '';
  private codeSignature(t: TemplateInput) {
    return JSON.stringify({ otp: t.otp, format: t.barcode.format, message: t.barcode.message, nfc: t.nfc });
  }

  /** Plantilla a guardar: botón vacío = sin botón; App Store ids desde el texto. */
  private payload(): TemplateInput {
    const b = this.button;
    const button = b.label.trim() || b.url.trim() ? { ...b, androidPackage: b.androidPackage?.trim() || undefined } : undefined;
    const appStoreIds = this.appStoreIds
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    return { ...this.draft, actions: { ...this.draft.actions, button, appStoreIds } };
  }

  protected async uploadModuleImage(i: number, ev: Event) {
    const inputEl = ev.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    try {
      const meta = await this.api.uploadImage(file);
      this.draft.actions.modules[i].imageId = meta.id;
      this.cdr.markForCheck();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  protected async save(publish: boolean) {
    const payload = this.payload();
    this.busy.set(true);
    try {
      const id = this.id();
      if (id) {
        await this.api.updateTemplate(id, payload);
        // El código (OTP, formato, NFC) cambia lo que se escanea: los pases emitidos tienen que actualizarse ya.
        const codeChanged = this.codeSignature(payload) !== this.savedCodeSignature;
        this.savedCodeSignature = this.codeSignature(payload);
        if (publish || codeChanged) {
          const res = await this.api.publishTemplate(id);
          const msg = syncMessage(res);
          const text = `${res.passes} pass(es) · ${msg.text}`;
          if (msg.ok) toast.success(publish ? 'Template saved and passes updated' : 'Code settings changed: passes updated', { description: text });
          else toast.warning('Template saved with warnings', { description: text });
        } else {
          toast.success('Template saved', { description: 'Existing passes update when you use “Save and update passes”.' });
        }
      } else {
        const t = await this.api.createTemplate(payload);
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
