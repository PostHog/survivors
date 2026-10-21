// .sprite text grids -> PNG sprite sheets. A TypeScript port of the parts of shared/pixel.py the game needs at run time
// (load, brand_palette, ramp, colour, to_images), so a sprite stored as text in D1 renders identically to what the Python
// pipeline would have produced. The format is documented at the top of shared/pixel.py in the games repo.
import { encodePng } from './png';

export interface Sprite {
  w: number;
  h: number;
  legend: Record<string, { col: string; note: string }>;
  frames: string[][];
  meta: Record<string, string>;
}

/** A message the agent can read and act on: what is wrong with the grid, in words. */
export class SpriteError extends Error {}

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
}
export const DEFAULT_BRAND: Palette = { primary: '#f83800', secondary: '#0000bc', accent: '#f8b800' };

const LEGEND_LINE = /^\S\s+(#[0-9a-fA-F]{6}|@[1-5][dl]?)(\s|$)/;

export function parseSprite(text: string): Sprite {
  const legend: Sprite['legend'] = {},
    frames: string[][] = [],
    meta: Record<string, string> = {};
  let cur: string[] | null = null,
    mode: 'legend' | 'frame' | null = null;
  for (const raw of text.split('\n')) {
    const s = raw.trim();
    if (!s || s.startsWith('#')) continue;
    if (s === 'legend') {
      mode = 'legend';
      continue;
    }
    if (s === 'frame') {
      mode = 'frame';
      cur = [];
      frames.push(cur);
      continue;
    }
    if (mode === 'legend' && LEGEND_LINE.test(s)) {
      const [ch, col, ...note] = s.split(/\s+/);
      legend[ch] = { col: col.toLowerCase(), note: note.join(' ') };
      continue;
    }
    if (mode === 'frame') {
      cur!.push(s);
      continue;
    }
    const i = s.indexOf(' ');
    meta[i < 0 ? s : s.slice(0, i)] = i < 0 ? '' : s.slice(i + 1);
  }
  const m = /^(\d+)x(\d+)$/.exec(meta.size ?? '');
  if (!m) throw new SpriteError('missing "size WxH" line (for example "size 16x16")');
  const w = +m[1],
    h = +m[2];
  if (!frames.length) throw new SpriteError('no "frame" sections');
  frames.forEach((f, i) => {
    if (f.length !== h) throw new SpriteError(`frame ${i} has ${f.length} rows, want ${h}`);
    f.forEach((row, y) => {
      if (row.length !== w) throw new SpriteError(`frame ${i} row ${y} is ${row.length} wide, want ${w}`);
      for (const ch of row)
        if (ch !== '.' && !legend[ch]) throw new SpriteError(`frame ${i} row ${y} uses "${ch}", which is not in the legend`);
    });
  });
  return { w, h, legend, frames, meta };
}

// ---- colour maths (Python's colorsys and round(), so results match the pipeline pixel for pixel) ----

type RGB = [number, number, number];
const rgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
/** Python's round(): halves go to the even neighbour. */
const pyRound = (x: number) => {
  const f = Math.floor(x),
    d = x - f;
  return d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1;
};
const hex = (c: number[]) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

function rgbToHls(r: number, g: number, b: number): [number, number, number] {
  const maxc = Math.max(r, g, b),
    minc = Math.min(r, g, b),
    l = (minc + maxc) / 2;
  if (minc === maxc) return [0, l, 0];
  const s = l <= 0.5 ? (maxc - minc) / (maxc + minc) : (maxc - minc) / (2 - maxc - minc);
  const rc = (maxc - r) / (maxc - minc),
    gc = (maxc - g) / (maxc - minc),
    bc = (maxc - b) / (maxc - minc);
  let h = r === maxc ? bc - gc : g === maxc ? 2 + rc - bc : 4 + gc - rc;
  h = (h / 6) % 1;
  return [h < 0 ? h + 1 : h, l, s];
}

function hlsToRgb(h: number, l: number, s: number): RGB {
  if (s === 0) return [l, l, l];
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s,
    m1 = 2 * l - m2;
  const v = (hue: number) => {
    hue = ((hue % 1) + 1) % 1;
    return hue < 1 / 6 ? m1 + (m2 - m1) * hue * 6 : hue < 0.5 ? m2 : hue < 2 / 3 ? m1 + (m2 - m1) * (2 / 3 - hue) * 6 : m1;
  };
  return [v(h + 1 / 3), v(h), v(h - 1 / 3)];
}

/** Hue-shifted shade: shadows cooler/more saturated and darker, highlights warmer and lighter. */
function ramp(base: string, step: string, n = 1): string {
  let [hh, ll, ss] = rgbToHls(...(rgb(base).map((v) => v / 255) as RGB));
  for (let i = 0; i < n; i++) {
    if (step === 'd') {
      ll = ll * 0.68;
      ss = Math.min(1, ss * 1.1 + 0.05);
      hh = hh + (0.66 - hh) * 0.08;
    } else {
      ll = ll + (0.95 - ll) * 0.42;
      hh = hh + (0.14 - hh) * 0.08;
    }
  }
  return hex(hlsToRgb(((hh % 1) + 1) % 1, Math.max(0, Math.min(1, ll)), Math.max(0, Math.min(1, ss))).map((v) => pyRound(v * 255)));
}

/** @1 primary, @2 secondary, @3 accent (exact theme hex), @4 dark and @5 light primary; a d/l suffix steps any of them. */
export function brandPalette(p: Partial<Palette> = {}): Record<string, string> {
  const q = { ...DEFAULT_BRAND, ...p };
  return { '1': q.primary, '2': q.secondary, '3': q.accent, '4': ramp(q.primary, 'd', 2), '5': ramp(q.primary, 'l', 2) };
}

// ---- the older default art (art.py letter grids) recolours through the 36-colour master palette, not through ramp() ----

/** Perceptual-ish RGB distance used by sprites.py to snap a colour to the master palette. */
export function dist(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}
/** The master colour nearest to h; the first one wins a tie, like Python's min(). */
export function snap(h: string, master: string[]): string {
  let best = master[0];
  let bestDist = dist(h, best);
  for (const c of master) {
    const d = dist(h, c);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}
const lum = (h: string) => {
  const [r, g, b] = rgb(h);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
/** A darker (f<1) or lighter (f>1: blend towards white) version of h, snapped to the master palette and guaranteed to differ. */
function shade(h: string, f: number, master: string[]): string {
  let [r, g, b] = rgb(h);
  if (f < 1) [r, g, b] = [r * f, g * f, b * f];
  else [r, g, b] = [r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1)];
  const c = hex([Math.trunc(r), Math.trunc(g), Math.trunc(b)]);
  const out = snap(c, master);
  if (out !== snap(h, master)) return out;
  const nearest = [...master].sort((x, y) => dist(c, x) - dist(c, y));
  return nearest.find((m) => lum(m) < lum(h) === f < 1 && m !== snap(h, master)) ?? out;
}

/** sprites.py brand(): digits 1-5 in the older default art. */
export function masterBrandPalette(p: Partial<Palette>, master: string[]): Record<string, string> {
  const q = { ...DEFAULT_BRAND, ...p };
  const prim = snap(q.primary, master);
  return {
    '1': prim,
    '2': snap(q.secondary, master),
    '3': snap(q.accent, master),
    '4': shade(prim, 0.55, master),
    '5': shade(prim, 1.45, master),
  };
}

const colour = (tok: string, pal: Record<string, string>) =>
  tok.startsWith('@') ? (tok.length > 2 ? ramp(pal[tok[1]], tok[2]) : pal[tok[1]]) : tok;

/** Which colour maths resolves a grid's @tokens: `brand` for .sprite art, `master` (with the master palette) for the older art.py grids. */
export type PaletteMode = { mode: 'brand' } | { mode: 'master'; master: string[] };

/** A sprite's frames as RGBA pixels (w*h*4 bytes each), with its @tokens resolved for a brand palette. */
export function rasterise(spr: Sprite, brand: Partial<Palette> = {}, how: PaletteMode = { mode: 'brand' }): Uint8Array[] {
  const pal = how.mode === 'master' ? masterBrandPalette(brand, how.master) : brandPalette(brand);
  const resolve = how.mode === 'master' ? (tok: string) => (tok.startsWith('@') ? pal[tok[1]] : tok) : (tok: string) => colour(tok, pal);
  const rgbOf = new Map<string, RGB>(); // a legend colour is resolved once, not once per pixel
  return spr.frames.map((frame) => {
    const px = new Uint8Array(spr.w * spr.h * 4);
    for (const [y, row] of frame.entries()) {
      for (const [x, ch] of [...row].entries()) {
        if (ch === '.') continue;
        const tok = spr.legend[ch].col;
        let c = rgbOf.get(tok);
        if (!c) {
          c = rgb(resolve(tok));
          rgbOf.set(tok, c);
        }
        px.set([...c, 255], (y * spr.w + x) * 4);
      }
    }
    return px;
  });
}

/** Frames side by side in one PNG, the layout the game's sprite slots load. */
export async function renderSheet(
  spr: Sprite,
  brand: Partial<Palette> = {},
  how: PaletteMode = { mode: 'brand' },
): Promise<Uint8Array<ArrayBuffer>> {
  const W = spr.w * spr.frames.length;
  const px = new Uint8Array(W * spr.h * 4);
  for (const [i, frame] of rasterise(spr, brand, how).entries()) {
    for (let y = 0; y < spr.h; y++) px.set(frame.subarray(y * spr.w * 4, (y + 1) * spr.w * 4), (y * W + i * spr.w) * 4);
  }
  return encodePng(W, spr.h, px);
}
