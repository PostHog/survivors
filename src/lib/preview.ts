// Review images for the agent (and the admin UI): what a sprite, or the whole cast, looks like. The agent is a vision model, so it
// can look at these and judge whether art makes sense, instead of guessing from a grid of letters.
import { Canvas, type Rgb } from './canvas';
import { toB64 } from './crypto';
import { hasDefaultArt, rasteriseDefault } from './default-art';
import { type Palette, parseSprite, rasterise } from './sprite';

const DARK: Rgb = [21, 20, 31]; // about the game's dark arena floor
const LIGHT: Rgb = [200, 200, 210];
const GAP = 10;

export const pngBase64 = (png: Uint8Array) => toB64(png);

/**
 * One sprite, three ways: every frame large on the dark floor (to see the drawing), then the same frames at 1x, 2x and 3x on the
 * dark floor and on a light background (to see how it reads at the size it is really shown), then its silhouette.
 */
export async function renderSpriteReview(grid: string, palette: Partial<Palette>): Promise<Uint8Array<ArrayBuffer>> {
  const spr = parseSprite(grid);
  const frames = rasterise(spr, palette);
  const big = Math.max(2, Math.min(12, Math.floor(256 / Math.max(spr.w, spr.h))));
  const rowH = spr.h * 3;
  const bigW = frames.length * (spr.w * big + GAP) + GAP;
  const smallW = [1, 2, 3].reduce((n, s) => n + frames.length * (spr.w * s + 6) + 10, GAP) + frames.length * (spr.w * 3 + 6) + GAP; // + silhouettes
  const W = Math.max(bigW, smallW);
  const H = GAP + spr.h * big + GAP + (rowH + GAP) * 2 + GAP;
  const c = new Canvas(W, H, [48, 48, 64]);

  frames.forEach((f, i) => {
    const x = GAP + i * (spr.w * big + GAP);
    c.rect(x, GAP, spr.w * big, spr.h * big, DARK);
    c.blit(f, spr.w, spr.h, x, GAP, big);
  });

  let y = GAP + spr.h * big + GAP;
  for (const bg of [DARK, LIGHT]) {
    c.rect(GAP - 4, y - 4, W - 2 * GAP + 8, rowH + 8, bg);
    let x = GAP;
    for (const s of [1, 2, 3]) {
      for (const f of frames) {
        c.blit(f, spr.w, spr.h, x, y + rowH - spr.h * s, s);
        x += spr.w * s + 6;
      }
      x += 10;
    }
    if (bg === DARK) {
      // silhouettes: can you still tell what it is, and tell it from the other bugs?
      for (const f of frames) {
        const sil = new Uint8Array(f.length);
        for (let i = 0; i < f.length; i += 4) if (f[i + 3] >= 128) sil.set([240, 240, 240, 255], i);
        c.blit(sil, spr.w, spr.h, x, y + rowH - spr.h * 3, 3);
        x += spr.w * 3 + 6;
      }
    }
    y += rowH + GAP;
  }
  return c.png();
}

export interface SceneArt {
  /** A hand-drawn grid per slot; any slot not here uses the kit's default art. */
  custom: Record<string, string>;
  palette: Partial<Palette>;
}

/** A slot's first frame (or all of them) as pixels, custom grid first, else the default art, in the prospect's colours. */
function slot(art: SceneArt, id: string) {
  const grid = art.custom[id];
  if (grid) {
    const spr = parseSprite(grid);
    return { w: spr.w, h: spr.h, frames: rasterise(spr, art.palette) };
  }
  return hasDefaultArt(id) ? rasteriseDefault(id, art.palette) : null;
}

/**
 * The cast on the arena floor, as the game shows it: the floor tile repeated, the hog, a few of each bug, the boss and some loot.
 * This is how the agent checks that bugs read against the floor, differ from each other, and share a style.
 */
export async function renderScene(art: SceneArt): Promise<Uint8Array<ArrayBuffer>> {
  const S = 3;
  const c = new Canvas(320 * S, 180 * S, DARK);
  const tile = slot(art, 'tile');
  if (tile) c.tile(tile.frames[0], tile.w, tile.h, S);

  const place = (id: string, x: number, y: number, frame = 0) => {
    const s = slot(art, id);
    if (s) c.blit(s.frames[frame % s.frames.length], s.w, s.h, x * S, y * S, S);
  };
  place('boss', 196, 14);
  place('player', 152, 110);
  for (const [i, id] of (['enemy_1', 'enemy_2', 'enemy_3'] as const).entries()) {
    place(id, 40 + i * 14, 30 + i * 36, 0);
    place(id, 100 + i * 20, 130 - i * 10, 1);
    place(id, 250 - i * 16, 120 + i * 14, 0);
  }
  for (const [i, id] of (['gem', 'orb', 'coin', 'gem'] as const).entries()) place(id, 130 + i * 22, 86 + (i % 2) * 8);
  return c.png();
}
