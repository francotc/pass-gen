import { Component, inject, input, output, signal, viewChildren } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideImagePlus, lucideSparkles, lucideX } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import type { ImageSlot, PassKind } from '../../../worker/types';
import { Api, errorMessage } from '../core/api.service';
import { dominantColor } from '../core/dominant-color';
import { fitToBox, ImageCropper, loadImage } from './image-cropper';

/** Recorte desde la imagen de portada: slot, tamaño de salida y relación de aspecto. */
interface CoverTarget {
  slot: ImageSlot;
  label: string;
  hint: string;
  width: number;
  aspect: number;
}

/**
 * A partir de un logo y una portada genera todas las imágenes del pase:
 * - Logo: recorte cuadrado → logo de Google (660) e ícono de Apple (87); logo de Apple = imagen entera en 480×150.
 * - Portada: strip de Apple, hero de Google y fondo del estilo poster, cada uno con su recorte.
 */
@Component({
  selector: 'app-image-studio',
  imports: [NgIcon, ImageCropper, HlmButtonImports],
  providers: [provideIcons({ lucideImagePlus, lucideSparkles, lucideX })],
  template: `
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <div>
          <span class="text-sm font-medium">Logo</span>
          <p class="text-muted-foreground text-xs">
            Square crop for the Google logo and the Apple icon; Apple's top-left logo keeps the full shape. A PNG with transparency
            works best, and its main color can become the brand color.
          </p>
        </div>
        @if (logo(); as img) {
          <app-image-cropper #logoCrop [image]="img" [aspect]="1" [allowContain]="true" label="Square logo" hint="660 × 660 · icon 87 × 87" />
          <div class="flex flex-wrap gap-2">
            <button hlmBtn type="button" size="sm" [disabled]="busy()" (click)="generateLogo()"><ng-icon name="lucideSparkles" /> Generate logo assets</button>
            <button hlmBtn variant="ghost" size="sm" type="button" (click)="logo.set(null)"><ng-icon name="lucideX" /> Cancel</button>
          </div>
        } @else {
          <input #logoFile type="file" accept="image/png,image/jpeg,image/webp" class="hidden" (change)="pick('logo', $event)" />
          <button hlmBtn variant="outline" type="button" class="h-24 border-dashed" (click)="logoFile.click()">
            <ng-icon name="lucideImagePlus" /> Upload logo
          </button>
        }
      </div>

      <div class="flex flex-col gap-3">
        <div>
          <span class="text-sm font-medium">Cover</span>
          <p class="text-muted-foreground text-xs">One photo, cropped for each place it appears. Drag to move, scroll to zoom.</p>
        </div>
        @if (cover(); as img) {
          @for (t of coverTargets(); track t.slot) {
            <app-image-cropper #coverCrop [image]="img" [aspect]="t.aspect" [label]="t.label" [hint]="t.hint" />
          }
          <div class="flex flex-wrap gap-2">
            <button hlmBtn type="button" size="sm" [disabled]="busy()" (click)="generateCover()"><ng-icon name="lucideSparkles" /> Generate cover assets</button>
            <button hlmBtn variant="ghost" size="sm" type="button" (click)="cover.set(null)"><ng-icon name="lucideX" /> Cancel</button>
          </div>
        } @else {
          <input #coverFile type="file" accept="image/png,image/jpeg,image/webp" class="hidden" (change)="pick('cover', $event)" />
          <button hlmBtn variant="outline" type="button" class="h-24 border-dashed" (click)="coverFile.click()">
            <ng-icon name="lucideImagePlus" /> Upload cover photo
          </button>
        }
      </div>
    </div>
  `,
})
export class ImageStudio {
  private readonly api = inject(Api);

  readonly kind = input.required<PassKind>();
  readonly poster = input(false);
  /** Imágenes generadas y subidas: slot → id. */
  readonly generated = output<Partial<Record<ImageSlot, string>>>();
  /** Color dominante del logo, para sugerirlo como color de marca. */
  readonly logoColor = output<string>();

  protected readonly logo = signal<HTMLImageElement | null>(null);
  protected readonly cover = signal<HTMLImageElement | null>(null);
  protected readonly busy = signal(false);

  private readonly logoCrop = viewChildren<ImageCropper>('logoCrop');
  private readonly coverCrops = viewChildren<ImageCropper>('coverCrop');

  protected coverTargets(): CoverTarget[] {
    const targets: CoverTarget[] = [];
    if (this.kind() === 'loyalty') targets.push({ slot: 'strip', label: 'Strip · Apple', hint: '1125 × 432', width: 1125, aspect: 1125 / 432 });
    targets.push({ slot: 'hero', label: 'Hero · Google', hint: '1032 × 336', width: 1032, aspect: 1032 / 336 });
    if (this.poster()) targets.push({ slot: 'background', label: 'Full-screen background · Apple poster', hint: '750 × 1000', width: 750, aspect: 3 / 4 });
    return targets;
  }

  protected async pick(which: 'logo' | 'cover', ev: Event) {
    const el = ev.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    try {
      const img = await loadImage(file);
      (which === 'logo' ? this.logo : this.cover).set(img);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  private async upload(blob: Blob, name: string) {
    return (await this.api.uploadImage(new File([blob], `${name}.png`, { type: 'image/png' }))).id;
  }

  protected async generateLogo() {
    const crop = this.logoCrop()[0];
    const img = this.logo();
    if (!crop || !img) return;
    this.busy.set(true);
    try {
      const [square, icon, wide] = await Promise.all([crop.export(660), crop.export(87), fitToBox(img, 480, 150)]);
      const [logoSquare, iconId, logoId] = await Promise.all([this.upload(square, 'logo-square'), this.upload(icon, 'icon'), this.upload(wide, 'logo')]);
      this.generated.emit({ logoSquare, icon: iconId, logo: logoId });
      const color = dominantColor(img);
      if (color) this.logoColor.emit(color);
      this.logo.set(null);
      toast.success('Logo assets generated', { description: 'Google logo, Apple icon and Apple logo.' });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async generateCover() {
    const targets = this.coverTargets();
    const crops = this.coverCrops();
    if (!crops.length) return;
    this.busy.set(true);
    try {
      const ids = await Promise.all(targets.map(async (t, i) => [t.slot, await this.upload(await crops[i].export(t.width), t.slot)] as const));
      this.generated.emit(Object.fromEntries(ids));
      this.cover.set(null);
      toast.success('Cover assets generated', { description: targets.map((t) => t.label).join(' · ') });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
