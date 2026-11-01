import { Component, computed, effect, ElementRef, input, signal, viewChild } from '@angular/core';

/**
 * Recorte con relación de aspecto fija: arrastrar para mover, rueda o slider para el zoom.
 * Trabaja en unidades del marco (ancho = 1, alto = 1 / aspect) para ser independiente del tamaño en pantalla.
 */
@Component({
  selector: 'app-image-cropper',
  template: `
    <div class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-sm font-medium">{{ label() }}</span>
        <span class="text-muted-foreground text-[13px] leading-snug">{{ hint() }}</span>
      </div>
      <div
        #frame
        class="border-border relative w-full cursor-grab touch-none overflow-hidden rounded-md border select-none active:cursor-grabbing"
        [style.aspect-ratio]="aspect()"
        [style.background]="checker"
        role="img"
        [attr.aria-label]="'Crop area for ' + label() + '. Drag to move, scroll to zoom.'"
        (pointerdown)="down($event)"
        (pointermove)="move($event)"
        (pointerup)="up($event)"
        (pointercancel)="up($event)"
        (wheel)="wheel($event)"
      >
        <img
          [src]="image().src"
          alt=""
          draggable="false"
          class="pointer-events-none absolute max-w-none"
          [style.left.%]="box().left"
          [style.top.%]="box().top"
          [style.width.%]="box().width"
          [style.height.%]="box().height"
        />
      </div>
      <label class="text-muted-foreground flex items-center gap-2 text-xs">
        Zoom
        <input
          type="range"
          class="flex-1"
          [min]="minZoom()"
          max="4"
          step="0.01"
          [value]="zoom()"
          (input)="setZoom(+$any($event.target).value)"
          [attr.aria-label]="'Zoom ' + label()"
        />
      </label>
    </div>
  `,
})
export class ImageCropper {
  readonly image = input.required<HTMLImageElement>();
  /** Ancho / alto del recorte. */
  readonly aspect = input.required<number>();
  readonly label = input('');
  readonly hint = input('');
  /** Permite achicar hasta que entre toda la imagen (los bordes quedan transparentes). */
  readonly allowContain = input(false);

  private readonly frame = viewChild.required<ElementRef<HTMLDivElement>>('frame');

  protected readonly checker = 'repeating-conic-gradient(#e5e5e5 0 25%, #fafafa 0 50%) 0 0 / 16px 16px';

  protected readonly zoom = signal(1);
  /** Centro de la imagen en unidades del marco. */
  private readonly cx = signal(0.5);
  private readonly cy = signal(0.5);
  private drag: { x: number; y: number; cx: number; cy: number; id: number } | null = null;

  private readonly frameH = computed(() => 1 / this.aspect());
  /** Escala (unidades de marco por px de imagen) con la que la imagen cubre el marco. */
  private readonly coverScale = computed(() => {
    const img = this.image();
    return Math.max(1 / img.naturalWidth, this.frameH() / img.naturalHeight);
  });
  private readonly containScale = computed(() => {
    const img = this.image();
    return Math.min(1 / img.naturalWidth, this.frameH() / img.naturalHeight);
  });
  protected readonly minZoom = computed(() => (this.allowContain() ? this.containScale() / this.coverScale() : 1));

  private readonly size = computed(() => {
    const img = this.image();
    const s = this.coverScale() * this.zoom();
    return { w: img.naturalWidth * s, h: img.naturalHeight * s };
  });

  protected readonly box = computed(() => {
    const { w, h } = this.size();
    const H = this.frameH();
    return { left: (this.cx() - w / 2) * 100, top: ((this.cy() - h / 2) / H) * 100, width: w * 100, height: (h / H) * 100 };
  });

  constructor() {
    // Imagen o proporción nueva: centrar, cubriendo (o entera si se permite contain).
    effect(() => {
      this.image();
      this.aspect();
      this.zoom.set(this.allowContain() ? this.minZoom() : 1);
      this.cx.set(0.5);
      this.cy.set(this.frameH() / 2);
    });
  }

  /** Mantiene la imagen cubriendo el marco, o dentro de él si es más chica. */
  private clamp(cx: number, cy: number) {
    const { w, h } = this.size();
    const H = this.frameH();
    const range = (c: number, d: number, f: number) => {
      const [a, b] = d >= f ? [f - d / 2, d / 2] : [d / 2, f - d / 2];
      return Math.min(Math.max(c, Math.min(a, b)), Math.max(a, b));
    };
    this.cx.set(range(cx, w, 1));
    this.cy.set(range(cy, h, H));
  }

  protected setZoom(z: number) {
    this.zoom.set(Math.min(4, Math.max(this.minZoom(), z)));
    this.clamp(this.cx(), this.cy());
  }

  protected wheel(ev: WheelEvent) {
    ev.preventDefault();
    this.setZoom(this.zoom() * (ev.deltaY < 0 ? 1.08 : 1 / 1.08));
  }

  protected down(ev: PointerEvent) {
    // Evita que el arrastre seleccione el texto de alrededor.
    ev.preventDefault();
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.drag = { x: ev.clientX, y: ev.clientY, cx: this.cx(), cy: this.cy(), id: ev.pointerId };
  }

  protected move(ev: PointerEvent) {
    if (!this.drag || ev.pointerId !== this.drag.id) return;
    const px = this.frame().nativeElement.clientWidth;
    this.clamp(this.drag.cx + (ev.clientX - this.drag.x) / px, this.drag.cy + (ev.clientY - this.drag.y) / px);
  }

  protected up(ev: PointerEvent) {
    if (this.drag?.id === ev.pointerId) this.drag = null;
  }

  /** Exporta el recorte como PNG de `width` px (alto según la proporción). */
  export(width: number): Promise<Blob> {
    const height = Math.round(width / this.aspect());
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    const { w, h } = this.size();
    const k = width; // px por unidad de marco
    ctx.drawImage(this.image(), (this.cx() - w / 2) * k, (this.cy() - h / 2) * k, w * k, h * k);
    return canvasToPng(canvas);
  }
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export the image'))), 'image/png'));
}

/** Imagen entera ajustada dentro de maxW × maxH, sin recortar (para el logo de Apple). */
export function fitToBox(img: HTMLImageElement, maxW: number, maxH: number): Promise<Blob> {
  const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * s));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * s));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasToPng(canvas);
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This file is not an image the browser can read'));
    img.src = URL.createObjectURL(file);
  });
}
