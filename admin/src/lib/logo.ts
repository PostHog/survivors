// Turning a company's real logo into the 128x48 pixel sprite for the game's splash screen. A TypeScript port of `pixel.py logo` from
// the game's art tools: work on plain RGBA pixel arrays (so it runs, and is tested, without a browser); lib/logo-load.ts does the
// canvas part of reading an image file.

import { dist, snap } from '@worker/lib/sprite';
import MASTER from '../../../game/shared/palette.json';

export const LOGO_W = 128;
export const LOGO_H = 48;

/** Straight-alpha RGBA pixels, row-major. */
export interface Rgba {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

const make = (w: number, h: number): Rgba => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
const px = (im: Rgba, x: number, y: number) => (y * im.w + x) * 4;

export const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
export const rgbOf = (h: string): [number, number, number] =>
  [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

/** WCAG relative luminance and contrast ratio. */
export function relLum(h: string): number {
  const [r, g, b] = rgbOf(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The splash screen's background for a palette: the game's own UI background (the darker brand colour, if dark enough), else black. */
export function splashBg(palette: { primary: string; secondary: string }): string {
  const master = MASTER as string[];
  const pairs = [palette.primary, palette.secondary].map((c) => ({ orig: c, snapped: snap(c, master) }));
  pairs.sort((a, b) => relLum(a.snapped) - relLum(b.snapped));
  const { orig, snapped } = pairs[0];
  return relLum(snapped) <= 0.08 && dist(orig, snapped) < 120 ? snapped : '#000000';
}

/** A logo on a flat opaque background (a JPG, a PNG without alpha) gets that background keyed out. */
export function keyOutBackground(im: Rgba): Rgba {
  const corners = [px(im, 0, 0), px(im, im.w - 1, 0), px(im, 0, im.h - 1), px(im, im.w - 1, im.h - 1)];
  if (!corners.every((o) => im.data[o + 3] > 250)) return im;
  const tally = new Map<string, number>();
  for (const o of corners) {
    const k = `${im.data[o]},${im.data[o + 1]},${im.data[o + 2]}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const [br, bg, bb] = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])[0][0]
    .split(',')
    .map(Number);
  const out = { ...im, data: new Uint8ClampedArray(im.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (Math.abs(out.data[i] - br) + Math.abs(out.data[i + 1] - bg) + Math.abs(out.data[i + 2] - bb) < 40) out.data[i + 3] = 0;
  }
  return out;
}

/** Crops to the pixels that are visibly there. */
export function trim(im: Rgba): Rgba {
  let [x0, y0, x1, y1] = [im.w, im.h, -1, -1];
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      if (im.data[px(im, x, y) + 3] > 40) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < 0) return im;
  const out = make(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < out.h; y++) out.data.set(im.data.subarray(px(im, x0, y0 + y), px(im, x0, y0 + y) + out.w * 4), y * out.w * 4);
  return out;
}

/** Scales to fit inside w x h, keeping the shape. Shrinking averages the pixels each new pixel covers (alpha-weighted, so soft edges
 *  do not turn into a dark fringe); enlarging repeats pixels. */
export function fitInside(im: Rgba, maxW: number, maxH: number): Rgba {
  const k = Math.min(maxW / im.w, maxH / im.h);
  const w = Math.max(1, Math.round(im.w * k));
  const h = Math.max(1, Math.round(im.h * k));
  const out = make(w, h);
  for (let y = 0; y < h; y++) {
    const sy0 = (y * im.h) / h;
    const sy1 = Math.max(sy0 + 1e-6, ((y + 1) * im.h) / h);
    for (let x = 0; x < w; x++) {
      const sx0 = (x * im.w) / w;
      const sx1 = Math.max(sx0 + 1e-6, ((x + 1) * im.w) / w);
      let [r, g, b, a, wsum] = [0, 0, 0, 0, 0];
      for (let sy = Math.floor(sy0); sy < Math.min(im.h, Math.ceil(sy1)); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.min(im.w, Math.ceil(sx1)); sx++) {
          const cover = (Math.min(sx + 1, sx1) - Math.max(sx, sx0)) * (Math.min(sy + 1, sy1) - Math.max(sy, sy0));
          if (cover <= 0) continue;
          const o = px(im, sx, sy);
          const alpha = im.data[o + 3] / 255;
          r += im.data[o] * alpha * cover;
          g += im.data[o + 1] * alpha * cover;
          b += im.data[o + 2] * alpha * cover;
          a += alpha * cover;
          wsum += cover;
        }
      }
      const o = px(out, x, y);
      if (a > 0) [out.data[o], out.data[o + 1], out.data[o + 2]] = [r / a, g / a, b / a];
      out.data[o + 3] = wsum > 0 ? (a / wsum) * 255 : 0;
    }
  }
  return out;
}

/** The `n` colours that best stand for a set of RGB pixels (median cut). */
function medianCut(pixels: [number, number, number][], n: number): [number, number, number][] {
  let boxes = [pixels];
  while (boxes.length < n) {
    // split the box with the widest spread in any channel
    let [best, bestRange, bestChannel] = [-1, 0, 0];
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        const vals = box.map((p) => p[c]);
        const range = Math.max(...vals) - Math.min(...vals);
        if (range > bestRange) [best, bestRange, bestChannel] = [i, range, c];
      }
    });
    if (best < 0) break;
    const box = [...boxes[best]].sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = Math.floor(box.length / 2);
    boxes = [...boxes.slice(0, best), box.slice(0, mid), box.slice(mid), ...boxes.slice(best + 1)];
  }
  return boxes
    .filter((b) => b.length)
    .map((box) => [0, 1, 2].map((c) => Math.round(box.reduce((s, p) => s + p[c], 0) / box.length)) as [number, number, number]);
}

/** Hard pixels: each pixel is in or out (alpha), and the colours that are in are at most `colours`. */
export function flatten(im: Rgba, colours: number): Rgba {
  const solid: [number, number, number][] = [];
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] >= 128) solid.push([im.data[i], im.data[i + 1], im.data[i + 2]]);
  const palette = medianCut(solid.length ? solid : [[0, 0, 0]], colours);
  const out = make(im.w, im.h);
  for (let i = 0; i < im.data.length; i += 4) {
    if (im.data[i + 3] < 128) continue;
    let [best, bestD] = [palette[0], Number.POSITIVE_INFINITY];
    for (const c of palette) {
      const d = (c[0] - im.data[i]) ** 2 + (c[1] - im.data[i + 1]) ** 2 + (c[2] - im.data[i + 2]) ** 2;
      if (d < bestD) [best, bestD] = [c, d];
    }
    out.data.set([...best, 255], i);
  }
  return out;
}

export function recolour(im: Rgba, fn: (hex: string) => string): Rgba {
  const out = make(im.w, im.h);
  for (let i = 0; i < im.data.length; i += 4) {
    if (!im.data[i + 3]) continue;
    out.data.set([...rgbOf(fn(hex(im.data[i], im.data[i + 1], im.data[i + 2]))), 255], i);
  }
  return out;
}

/** Pastes into the middle of an empty LOGO_W x LOGO_H canvas. */
export function centred(im: Rgba): Rgba {
  const out = make(LOGO_W, LOGO_H);
  const [ox, oy] = [Math.floor((LOGO_W - im.w) / 2), Math.floor((LOGO_H - im.h) / 2)];
  for (let y = 0; y < im.h; y++) out.data.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), px(out, ox, oy + y));
  return out;
}

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$%&*+=?!~^';

/** A .sprite (see src/lib/sprite.ts) for a LOGO_W x LOGO_H image, legend letters assigned darkest first so outlines come out early. */
export function toSpriteText(im: Rgba, concept: string): string {
  const colours = new Map<string, number>();
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] >= 128) colours.set(hex(im.data[i], im.data[i + 1], im.data[i + 2]), 0);
  const ordered = [...colours.keys()].sort((a, b) => relLum(a) - relLum(b));
  if (ordered.length > CHARS.length) throw new Error(`${ordered.length} colours: reduce the palette first`);
  const letter = new Map(ordered.map((c, i) => [c, CHARS[i]]));
  const rows: string[] = [];
  for (let y = 0; y < im.h; y++) {
    let row = '';
    for (let x = 0; x < im.w; x++) {
      const o = px(im, x, y);
      row += im.data[o + 3] >= 128 ? letter.get(hex(im.data[o], im.data[o + 1], im.data[o + 2])) : '.';
    }
    rows.push(row);
  }
  return [
    `size ${im.w}x${im.h}`,
    `concept ${concept}`,
    'legend',
    ...ordered.map((c) => `  ${letter.get(c)} ${c}`),
    'frame',
    ...rows,
    '',
  ].join('\n');
}

export interface LogoOption {
  key: 'a' | 'b' | 'c' | 'd';
  name: string;
  why: string;
  image: Rgba;
  /** The sprite file text, ready to save as the logo slot. */
  grid: string;
}

/** Four ways to turn a logo into pixels, for a person to choose between. `source` is the logo already keyed out and trimmed. */
export function logoOptions(source: Rgba, palette: { primary: string; secondary: string; accent: string }): LogoOption[] {
  const bg = splashBg(palette);
  const light = '#eeefe9';
  const mono = contrast(palette.accent, bg) >= 3 ? palette.accent : light;
  const detailed = flatten(fitInside(source, LOGO_W - 4, LOGO_H - 4), 8);
  const half = flatten(fitInside(source, (LOGO_W - 4) / 2, (LOGO_H - 4) / 2), 5);
  const chunky = make(half.w * 2, half.h * 2);
  for (let y = 0; y < chunky.h; y++)
    for (let x = 0; x < chunky.w; x++)
      chunky.data.set(half.data.subarray(px(half, x >> 1, y >> 1), px(half, x >> 1, y >> 1) + 4), px(chunky, x, y));
  const defs: [LogoOption['key'], string, string, Rgba][] = [
    ['a', 'detailed', 'own colours, full detail', detailed],
    ['b', 'chunky', 'half resolution, doubled', chunky],
    ['c', 'light', 'dark colours made light', recolour(detailed, (h) => (contrast(h, bg) >= 2.2 ? h : light))],
    ['d', 'one colour', `silhouette in ${mono}`, recolour(detailed, () => mono)],
  ];
  return defs.map(([key, name, why, image]) => {
    const placed = centred(image);
    return { key, name, why, image: placed, grid: toSpriteText(placed, `splash logo option ${key.toUpperCase()} (${name}): ${why}`) };
  });
}

const visible = (im: Rgba) => {
  let n = 0;
  for (let i = 3; i < im.data.length; i += 4) if (im.data[i] > 40) n++;
  return n;
};

/** Everything after reading the file: background, trim, four options. If keying out the background would erase (nearly) the whole
 *  image, the image IS one flat colour: keep it as it is rather than produce nothing. */
export function logoFromPixels(im: Rgba, palette: { primary: string; secondary: string; accent: string }) {
  const keyed = keyOutBackground(im);
  const source = visible(keyed) < (im.w * im.h) / 100 ? im : keyed;
  return logoOptions(trim(source), palette);
}
