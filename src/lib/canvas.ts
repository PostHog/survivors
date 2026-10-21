// A tiny RGBA canvas: enough to lay sprites out into review images, since Workers have no <canvas>.
import { encodePng } from './png';

export type Rgb = [number, number, number];

export class Canvas {
  readonly px: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
    background: Rgb = [0, 0, 0],
  ) {
    this.px = new Uint8Array(w * h * 4);
    this.rect(0, 0, w, h, background);
  }

  rect(x: number, y: number, w: number, h: number, c: Rgb) {
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) this.px.set([...c, 255], (j * this.w + i) * 4);
    }
  }

  /** Draws RGBA pixels (sw x sh) at (x, y), each source pixel `scale` pixels wide; transparent pixels leave the canvas alone. */
  blit(src: Uint8Array, sw: number, sh: number, x: number, y: number, scale = 1) {
    for (let sy = 0; sy < sh; sy++) {
      for (let sx = 0; sx < sw; sx++) {
        const o = (sy * sw + sx) * 4;
        if (src[o + 3] < 128) continue;
        this.rect(x + sx * scale, y + sy * scale, scale, scale, [src[o], src[o + 1], src[o + 2]]);
      }
    }
  }

  /** Fills a region with `src` (sw x sh) repeated, at `scale`. */
  tile(src: Uint8Array, sw: number, sh: number, scale: number) {
    for (let y = 0; y < this.h; y += sh * scale) for (let x = 0; x < this.w; x += sw * scale) this.blit(src, sw, sh, x, y, scale);
  }

  png() {
    return encodePng(this.w, this.h, this.px);
  }
}
