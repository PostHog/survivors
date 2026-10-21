// Text, boxes and small UI helpers in the kits' shared 8-bit style.
import Phaser from 'phaser';
import { FONT, CHAR_W, LINE_H, cleanText } from './font';
import { hooks } from './hooks';

/** The base size: a landscape screen is at least DW x DH game pixels, a portrait one at least DH x DW. */
export const DW = 480;
export const DH = 270;
/** The live view in game pixels. DW x DH unless the kit is resizable; then it takes the screen's shape, scaled so the
 * short side is ~DH game pixels (and the long side at least DW): the same physical size for text and sprites in either
 * orientation and on every phone. Screens lay themselves out for the live W x H (see NARROW). */
export let W = DW;
export let H = DH;
/** Canvas pixels per game pixel. Resizable kits draw at the screen's full resolution (the canvas is W*PX x H*PX device
 * pixels and every camera zooms by PX), so pixel art stays sharp at any scale. Fixed kits keep 1: a W x H canvas that
 * CSS scales up. Phones get the exact fit; desktops keep a whole number for perfectly even pixels. */
export let PX = 1;

function viewFor(dw: number, dh: number) {
  const short = Math.min(dw, dh), long = Math.max(dw, dh);
  let s = Math.min(short / DH, long / DW);
  s = TOUCH ? Math.max(0.5, s) : Math.max(1, Math.floor(s));
  return { w: Math.floor(dw / s), h: Math.floor(dh / s), s };
}

function devicePx() {
  const dpr = window.devicePixelRatio || 1;
  return [Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr)];
}

/** Recompute W/H/PX for a resizable kit from the window. Returns true when the view changed. */
export function fitView() {
  const [dw, dh] = devicePx();
  const v = viewFor(dw, dh);
  const changed = v.w !== W || v.h !== H || v.s !== PX;
  W = v.w; H = v.h; PX = v.s;
  return changed;
}

/** The biggest view this screen gives in either orientation (worlds size themselves so a rotate still fits). */
export function maxView() {
  const [a, b] = devicePx();
  const v1 = viewFor(a, b), v2 = viewFor(b, a);
  return { w: Math.max(v1.w, v2.w), h: Math.max(v1.h, v2.h) };
}

/** A view narrower than the base width (a phone held upright): screens stack instead of sitting side by side. */
export const NARROW = () => W < DW;

/** How far the game world zooms in beyond the screen's resolution: a bigger (or taller) view shows about the same
 * area of the world as a DW x DH screen, so the play area stays as busy as designed and sprites scale up with it. */
export const worldZoom = () => Math.max(1, Math.sqrt((W * H) / (DW * DH)));

/** A y laid out for a DH-tall screen, moved into a taller one: anchor 0 keeps it at the top, 1 pins it to the bottom,
 * 0.5 keeps it centred. On a DH-tall screen it is unchanged. */
export const vy = (y: number, anchor: number) => y + Math.round((H - DH) * anchor);

/** A screen-space camera: game pixels 1:1 with the live view (zoomed by PX), re-fitted on resize. */
export function fitCam(scene: Phaser.Scene, cam: Phaser.Cameras.Scene2D.Camera, zoom = () => 1) {
  const place = () => cam.setZoom(PX * zoom()).centerOn(W / 2, H / 2);
  place();
  scene.scale.on('resize', place);
  scene.events.once('shutdown', () => scene.scale.off('resize', place));
}

/** The world width / height a camera shows (valid any time, unlike worldView before the first render). */
export const camW = (c: Phaser.Cameras.Scene2D.Camera) => c.width / c.zoom;
export const camH = (c: Phaser.Cameras.Scene2D.Camera) => c.height / c.zoom;

/** The world rectangle a camera shows (valid before its first render, unlike worldView). */
export function viewRect(cam: Phaser.Cameras.Scene2D.Camera) {
  const w = cam.width / cam.zoom, h = cam.height / cam.zoom;
  return { x: cam.scrollX + cam.width / 2 - w / 2, y: cam.scrollY + cam.height / 2 - h / 2, w, h };
}

/** A phone or tablet (no hover, coarse pointer): kits show tap hints and touch controls. */
export const TOUCH = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;

/** Running inside a native app shell (the Android WebView wrapper tags its user agent): already fullscreen, and the
 * whole screen takes touch, not just the canvas. */
export const APP = typeof navigator !== 'undefined' && /\bKitApp\b/.test(navigator.userAgent);

export interface TextOpts {
  scale?: number;
  color?: number;
  align?: 'left' | 'center' | 'right';
  /** Max width in game pixels; text wraps at word boundaries. */
  maxWidth?: number;
  /** Max lines after wrapping; overflow is cut with "..." and reported to __game.textWarnings. */
  maxLines?: number;
  shadow?: number | null;
  depth?: number;
  fixed?: boolean; // ignore camera scroll (HUD)
}

/** Word-wrap to `cols` characters, cutting to `maxLines` with "...". Reports cuts. */
export function wrap(str: string, cols: number, maxLines = 99, where = ''): string[] {
  const words = cleanText(str).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (let w of words) {
    while (w.length > cols) { // break very long words
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(w.slice(0, cols - 1) + '-');
      w = w.slice(cols - 1);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= cols) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    hooks.textWarnings.push(`${where || 'text'} cut: "${str.slice(0, 60)}"`);
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    if (last.length > cols - 3) last = last.slice(0, cols - 3).trimEnd();
    kept[maxLines - 1] = last + '...';
    return kept;
  }
  return lines;
}

/** Pixel text with an optional 1px drop shadow, as one container. */
export class PixelText extends Phaser.GameObjects.Container {
  main: Phaser.GameObjects.BitmapText;
  shade: Phaser.GameObjects.BitmapText | null = null;
  private opts: TextOpts;
  private raw = '';

  constructor(scene: Phaser.Scene, x: number, y: number, str: string, opts: TextOpts = {}) {
    super(scene, x, y);
    this.opts = { scale: 1, color: 0xfcfcfc, align: 'left', shadow: 0x000000, ...opts };
    const s = this.opts.scale!;
    if (this.opts.shadow !== null) {
      this.shade = scene.add.bitmapText(s, s, FONT, '').setScale(s).setTint(this.opts.shadow!);
      this.add(this.shade);
    }
    this.main = scene.add.bitmapText(0, 0, FONT, '').setScale(s).setTint(this.opts.color!);
    this.add(this.main);
    if (opts.depth !== undefined) this.setDepth(opts.depth);
    if (opts.fixed) this.setScrollFactor(0);
    scene.add.existing(this);
    this.setText(str);
  }

  setText(str: string) {
    str = String(str ?? '');
    if (str === this.raw) return this;
    this.raw = str;
    const s = this.opts.scale!;
    let lines: string[];
    if (this.opts.maxWidth) {
      const cols = Math.max(1, Math.floor(this.opts.maxWidth / (CHAR_W * s)));
      lines = str.split('\n').flatMap((p) => (p.trim() ? wrap(p, cols, 99) : ['']));
      if (this.opts.maxLines && lines.length > this.opts.maxLines) lines = wrap(str.replace(/\n/g, ' '), cols, this.opts.maxLines, 'box');
    } else {
      lines = str.split('\n').map((l) => cleanText(l));
    }
    const align = this.opts.align!;
    const widest = Math.max(0, ...lines.map((l) => l.length));
    // BitmapText's own align pads per line; do it ourselves so the origin math stays simple.
    const padded = lines.map((l) => {
      if (align === 'center') return ' '.repeat(Math.floor((widest - l.length) / 2)) + l;
      if (align === 'right') return ' '.repeat(widest - l.length) + l;
      return l;
    }).join('\n');
    const wpx = widest * CHAR_W * s;
    const ox = align === 'center' ? -Math.floor(wpx / 2) : align === 'right' ? -wpx : 0;
    this.main.setText(padded).setPosition(ox, 0);
    this.shade?.setText(padded).setPosition(ox + s, s);
    return this;
  }

  get textWidth() { return this.main.width; }
  get textHeight() { return this.main.height; }
  get lineCount() { return this.main.text.split('\n').length; }
  setColor(c: number) { this.main.setTint(c); return this; }
}

export const text = (scene: Phaser.Scene, x: number, y: number, str: string, opts?: TextOpts) =>
  new PixelText(scene, x, y, str, opts);

/** Largest integer scale (<= max) at which `str` fits in `width` on one line. */
export function fitScale(str: string, width: number, max = 3) {
  const n = cleanText(str).length || 1;
  for (let s = max; s > 1; s--) if (n * CHAR_W * s <= width) return s;
  return 1;
}

/** NES-style box: dark fill, light 1px frame with a brand-coloured inner line. */
export function box(scene: Phaser.Scene, x: number, y: number, w: number, h: number,
  fill: number, frame = 0xfcfcfc, inner?: number) {
  const g = scene.add.graphics();
  g.fillStyle(fill, 1).fillRect(x, y, w, h);
  g.fillStyle(frame, 1)
    .fillRect(x + 1, y, w - 2, 1).fillRect(x + 1, y + h - 1, w - 2, 1)
    .fillRect(x, y + 1, 1, h - 2).fillRect(x + w - 1, y + 1, 1, h - 2);
  if (inner !== undefined) g.lineStyle(1, inner, 1).strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  return g;
}

/** Horizontal bar (HP/XP): frame, empty track, fill. Returns an updater. */
export function bar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill: number, track = 0x000000, frame = 0xfcfcfc) {
  const g = scene.add.graphics().setScrollFactor(0);
  const draw = (frac: number, color = fill) => {
    frac = Phaser.Math.Clamp(frac, 0, 1);
    g.clear();
    g.fillStyle(frame, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(track, 1).fillRect(x, y, w, h);
    if (frac > 0) g.fillStyle(color, 1).fillRect(x, y, Math.max(1, Math.round(w * frac)), h);
  };
  draw(1);
  return { g, draw };
}

export function blink(scene: Phaser.Scene, obj: Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject, ms = 450) {
  return scene.time.addEvent({ delay: ms, loop: true, callback: () => obj.setVisible(!obj.visible) });
}

/** Seconds -> "m:ss". */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export { LINE_H, CHAR_W };
