import { describe, expect, it } from 'vitest';
import {
  centred,
  contrast,
  fitInside,
  flatten,
  keyOutBackground,
  LOGO_H,
  LOGO_W,
  logoFromPixels,
  type Rgba,
  splashBg,
  trim,
} from '../../admin/src/lib/logo';
import { parseSprite } from '../../src/lib/sprite';
import { checkSprite } from '../../src/lib/sprite-check';

/** A w x h image: `paint(x, y)` returns [r, g, b, a]. */
function image(w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(paint(x, y), (y * w + x) * 4);
  return { w, h, data };
}
const at = (im: Rgba, x: number, y: number) => [...im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4)];

// A wide "logo": a green disc and an orange bar on opaque white, like a JPEG.
const onWhite = image(300, 120, (x, y) => {
  const inDisc = (x - 70) ** 2 + (y - 60) ** 2 < 40 ** 2;
  const inBar = x > 140 && x < 270 && y > 45 && y < 75;
  return inDisc ? [10, 125, 90, 255] : inBar ? [244, 87, 46, 255] : [255, 255, 255, 255];
});
const palette = { primary: '#0a7d5a', secondary: '#0b1f33', accent: '#ffd166' };

describe('turning a logo into pixels', () => {
  it('keys out a flat opaque background, and only then', () => {
    const keyed = keyOutBackground(onWhite);
    expect(at(keyed, 2, 2)[3]).toBe(0); // the white is gone
    expect(at(keyed, 70, 60)).toEqual([10, 125, 90, 255]); // the logo stays
    const alreadyTransparent = image(10, 10, (x) => [0, 0, 0, x < 5 ? 0 : 255]);
    expect(keyOutBackground(alreadyTransparent)).toBe(alreadyTransparent); // has real transparency: left alone
  });

  it('trims to what is visible', () => {
    const t = trim(keyOutBackground(onWhite));
    expect([t.w, t.h]).toEqual([239, 79]); // the disc starts at x=31 and the bar ends at x=269; the disc spans y=21..99
  });

  it('shrinks keeping the shape, and never fringes soft edges dark', () => {
    const small = fitInside(trim(keyOutBackground(onWhite)), 124, 44);
    expect(small.w / small.h).toBeCloseTo(239 / 79, 0);
    expect(small.w).toBeLessThanOrEqual(124);
    expect(small.h).toBeLessThanOrEqual(44);
    // an edge between green and nothing averages green, not green-with-black
    const edge = image(2, 1, (x) => (x === 0 ? [10, 125, 90, 255] : [0, 0, 0, 0]));
    const half = fitInside(edge, 1, 1);
    expect(at(half, 0, 0).slice(0, 3)).toEqual([10, 125, 90]);
  });

  it('flattens to hard pixels in few colours', () => {
    const flat = flatten(fitInside(trim(keyOutBackground(onWhite)), 124, 44), 4);
    const colours = new Set<string>();
    for (let i = 0; i < flat.data.length; i += 4) {
      expect([0, 255]).toContain(flat.data[i + 3]);
      if (flat.data[i + 3]) colours.add(`${flat.data[i]},${flat.data[i + 1]},${flat.data[i + 2]}`);
    }
    expect(colours.size).toBeGreaterThanOrEqual(2); // the green and the orange survive
    expect(colours.size).toBeLessThanOrEqual(4);
  });

  it('centres in the 128x48 splash canvas', () => {
    const c = centred(image(10, 10, () => [255, 0, 0, 255]));
    expect([c.w, c.h]).toEqual([LOGO_W, LOGO_H]);
    expect(at(c, 59, 19)[3]).toBe(255);
    expect(at(c, 0, 0)[3]).toBe(0);
  });

  it('gives four options that the server accepts as the logo slot', () => {
    const options = logoFromPixels(onWhite, palette);
    expect(options.map((o) => o.key)).toEqual(['a', 'b', 'c', 'd']);
    for (const o of options) {
      const spr = parseSprite(o.grid);
      expect([spr.w, spr.h, spr.frames.length], o.name).toEqual([128, 48, 1]);
      expect(checkSprite('logo', o.grid).ok, o.name).toBe(true); // the same check the API applies
      expect(Object.keys(spr.legend).length, `${o.name} colours`).toBeLessThanOrEqual(8);
    }
    // 'detailed' keeps the brand colours; 'one colour' is a single flat colour
    expect(Object.values(parseSprite(options[0].grid).legend).map((l) => l.col)).toContain('#0a7d5a');
    expect(Object.keys(parseSprite(options[3].grid).legend)).toHaveLength(1);
    // chunky is made of 2x2 blocks
    const chunky = options[1].image;
    const same = (x: number, y: number) =>
      at(chunky, x, y).join() === at(chunky, x + 1, y).join() && at(chunky, x, y).join() === at(chunky, x, y + 1).join();
    expect(same(60, 20) || same(58, 20)).toBe(true);
  });

  it('copes with a logo that is a single colour, a tiny image, or has nothing in it', () => {
    expect(
      logoFromPixels(
        image(40, 40, () => [255, 255, 255, 255]),
        palette,
      ),
    ).toHaveLength(4); // all background: nothing to show, but no crash
    expect(
      checkSprite(
        'logo',
        logoFromPixels(
          image(3, 2, () => [200, 30, 30, 255]),
          palette,
        )[0].grid,
      ).ok,
    ).toBe(true);
  });

  it('chooses the splash background like the game does, and lights dark logo colours against it', () => {
    expect(splashBg({ primary: '#0a7d5a', secondary: '#0b1f33' })).toMatch(/^#[0-9a-f]{6}$/);
    expect(splashBg({ primary: '#ffffff', secondary: '#fcfcfc' })).toBe('#000000'); // nothing dark enough: black
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
});
