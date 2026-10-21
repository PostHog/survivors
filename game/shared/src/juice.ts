// Game-feel helpers for Phaser 3, cheap enough to call on every hit. All of them respect the
// "reduced motion" setting in meta (no shake, no punch, fewer particles) and never throw.
//
//   import { shake, hitstop, hitstopped, flash, punch, burst, floatText, toast, setJuiceSpeed } from '@shared/juice';
//   shake(scene, px = 3, ms = 120)       camera shake, `px` = max offset in game pixels
//   hitstop(scene, ms = 50)              freeze scene.time + scene.tweens for `ms` real ms (overlapping calls extend).
//                                        Kits that integrate their own dt must also skip their step while
//                                        hitstopped(scene) is true (or multiply dt by juiceScale(scene)).
//   setJuiceSpeed(n)                     call from debug.speed(n): hitstops get n times shorter so bots stay fast
//   flash(target, colour = white, ms = 70)   tint-fill a sprite/image briefly, then restore its tint
//   punch(target, amount = 0.2, ms = 110)    quick scale pop (UI counters, pickups)
//   burst(scene, x, y, colour, n = 10, opts?) pixel particles (1-2 px squares) drawn by one Graphics per scene
//   floatText(scene, x, y, text, colour?)    rising, fading RetroFont text (damage numbers, "+5"), pooled
//   toast(scene, text)                   top-of-screen banner, queued; drawn by the always-on Overlay scene so it
//                                        survives scene changes. achieve() uses it.
// Everything draws in world space at depth 1000 (burst/floatText); pass world coordinates.
import Phaser from 'phaser';
import { K } from './kit';
import { meta } from './meta';
import { text, box, PixelText, W, fitCam } from './ui';

const reduced = () => { try { return meta.reducedMotion(); } catch { return false; } };

let simSpeed = 1;
/** Kits call this from their debug.speed hook so hitstop scales with the sim speed. */
export function setJuiceSpeed(n: number) { simSpeed = Math.max(1, Number(n) || 1); }

// ---------------------------------------------------------------- camera + time

export function shake(scene: Phaser.Scene, px = 3, ms = 120) {
  if (reduced() || !scene?.cameras?.main) return;
  scene.cameras.main.shake(ms, Math.min(0.05, px / W));
}

interface Stop { until: number; time: number; tweens: number; done: () => void }
const stops = new WeakMap<Phaser.Scene, Stop>();

export function hitstop(scene: Phaser.Scene, ms = 50) {
  if (!scene?.sys?.isActive()) return;
  ms = Math.min(250, ms) / simSpeed;
  if (ms < 8) return;
  const now = performance.now();
  const cur = stops.get(scene);
  if (cur) { cur.until = Math.max(cur.until, now + ms); return; }
  const st: Stop = { until: now + ms, time: scene.time.timeScale, tweens: scene.tweens.timeScale, done: () => {} };
  const tick = () => { if (performance.now() >= st.until) st.done(); };
  st.done = () => {
    if (stops.get(scene) !== st) return;
    stops.delete(scene);
    scene.time.timeScale = st.time;
    scene.tweens.timeScale = st.tweens;
    scene.events.off('preupdate', tick);
    scene.events.off('shutdown', st.done);
  };
  stops.set(scene, st);
  scene.time.timeScale = 0;
  scene.tweens.timeScale = 0;
  scene.events.on('preupdate', tick);
  scene.events.once('shutdown', st.done);
}

export const hitstopped = (scene: Phaser.Scene) => stops.has(scene);
/** 0 during a hitstop, else 1: multiply a kit's own dt by this. */
export const juiceScale = (scene: Phaser.Scene) => (stops.has(scene) ? 0 : 1);

// ---------------------------------------------------------------- per-object

type Tintable = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Tint;

export function flash(target: Tintable, colour = 0xffffff, ms = 70) {
  if (!target?.scene || typeof target.setTintFill !== 'function') return;
  const was = target.isTinted ? target.tintTopLeft : null;
  const wasFill = target.tintFill;
  target.setTintFill(colour);
  target.scene.time.delayedCall(ms, () => {
    if (!target.scene) return;
    if (was === null) target.clearTint();
    else if (wasFill) target.setTintFill(was);
    else target.setTint(was);
  });
}

const punching = new WeakSet<object>();
export function punch(target: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform, amount = 0.2, ms = 110) {
  if (reduced() || !target?.scene || punching.has(target)) return;
  punching.add(target);
  const sx = target.scaleX, sy = target.scaleY;
  target.scene.tweens.add({ targets: target, scaleX: sx * (1 + amount), scaleY: sy * (1 + amount), duration: ms / 2, yoyo: true,
    onComplete: () => { punching.delete(target); target.setScale?.(sx, sy); },
    onStop: () => { punching.delete(target); } });
}

// ---------------------------------------------------------------- particles + float text

const MAX_PARTS = 400;
const MAX_FLOATS = 24;

interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; col: number; size: number; g: number }
interface Float { t: PixelText; age: number; life: number; y0: number; rise: number }
interface Layer { g: Phaser.GameObjects.Graphics; parts: Part[]; n: number; floats: Float[] }
const layers = new WeakMap<Phaser.Scene, Layer>();

function layer(scene: Phaser.Scene): Layer {
  let L = layers.get(scene);
  if (L) return L;
  const g = scene.add.graphics().setDepth(1000);
  L = { g, parts: [], n: 0, floats: [] };
  const LL = L;
  const update = (_t: number, dtMs: number) => {
    const dt = (Math.min(dtMs, 50) / 1000) * juiceScale(scene);
    g.clear();
    let live = 0;
    for (let i = 0; i < LL.n; i++) {
      const p = LL.parts[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vx *= 1 - 3 * dt;
      p.vy = p.vy * (1 - 3 * dt) + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Blink out over the last third instead of alpha-fading: reads as 8-bit.
      if (p.life > p.max / 3 || Math.floor(p.life * 30) % 2 === 0) {
        g.fillStyle(p.col, 1).fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      if (i !== live) { LL.parts[i] = LL.parts[live]; LL.parts[live] = p; }
      live++;
    }
    LL.n = live;
    for (const f of LL.floats) {
      if (!f.t.visible) continue;
      f.age += dt;
      const k = f.age / f.life;
      if (k >= 1) { f.t.setVisible(false); continue; }
      f.t.y = Math.round(f.y0 - f.rise * Math.min(1, k * 2.2));
      f.t.setAlpha(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    }
  };
  scene.events.on('update', update);
  scene.events.once('shutdown', () => { scene.events.off('update', update); layers.delete(scene); });
  layers.set(scene, L);
  return L;
}

export interface BurstOpts {
  speed?: number;   // px/s, default 110
  life?: number;    // seconds, default 0.45
  gravity?: number; // px/s^2, default 120
  size?: number;    // 1 or 2 (default: mix)
  colours?: number[]; // extra colours to mix in
}

export function burst(scene: Phaser.Scene, x: number, y: number, colour = 0xffffff, n = 10, o: BurstOpts = {}) {
  if (!scene?.sys?.isActive()) return;
  const L = layer(scene);
  if (reduced()) n = Math.ceil(n / 2);
  const speed = o.speed ?? 110, life = o.life ?? 0.5, grav = o.gravity ?? 120;
  const cols = [colour, ...(o.colours ?? [])];
  for (let i = 0; i < n; i++) {
    let p: Part;
    if (L.n < L.parts.length) p = L.parts[L.n];
    else if (L.parts.length < MAX_PARTS) { p = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, col: 0, size: 1, g: 0 }; L.parts.push(p); }
    else p = L.parts[Math.floor(Math.random() * L.n)]; // full: recycle a random live one
    if (p === L.parts[L.n]) L.n++;
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.65);
    p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - speed * 0.3;
    p.max = p.life = life * (0.6 + Math.random() * 0.4);
    p.col = cols[i % cols.length];
    p.size = o.size ?? (Math.random() < 0.35 ? 2 : 1);
    p.g = grav;
  }
}

/** Fade this scene's particles (kill bursts, sparks): late-game screens get busy. 1 = fully opaque. */
export function particleAlpha(scene: Phaser.Scene, a: number) {
  if (scene?.sys?.isActive()) layer(scene).g.setAlpha(a);
}

export function floatText(scene: Phaser.Scene, x: number, y: number, str: string | number, colour = 0xfcfcfc, life = 0.7) {
  if (!scene?.sys?.isActive()) return;
  const L = layer(scene);
  let f = L.floats.find((q) => !q.t.visible);
  if (!f) {
    if (L.floats.length < MAX_FLOATS) {
      f = { t: text(scene, 0, 0, '', { align: 'center', depth: 1001 }), age: 0, life, y0: 0, rise: 0 };
      L.floats.push(f);
    } else {
      f = L.floats.reduce((a, b) => (a.age > b.age ? a : b)); // oldest
    }
  }
  f.t.setText(String(str)).setColor(colour).setPosition(Math.round(x), Math.round(y)).setAlpha(1).setVisible(true);
  f.age = 0; f.life = life; f.y0 = Math.round(y); f.rise = reduced() ? 6 : 14;
}

// ---------------------------------------------------------------- toasts (Overlay scene)

const queue: string[] = [];

/** Always-running scene on top of everything; hosts toasts. startKit adds it and Boot launches it. */
export class OverlayScene extends Phaser.Scene {
  private busy = false;
  constructor() { super({ key: 'Overlay', active: false }); }

  create() {
    this.busy = false;
    fitCam(this, this.cameras.main);
    this.events.on('update', () => { if (!this.busy && queue.length) this.show(queue.shift()!); });
  }

  private show(msg: string) {
    this.busy = true;
    this.scene.bringToTop();
    const ui = K.ui;
    const t = text(this, W / 2, 6, msg, { align: 'center', color: ui.textInt, maxWidth: W - 60, maxLines: 1 });
    const w = Math.min(W - 40, Math.max(t.textWidth, 12) + 16);
    const g = box(this, Math.round(W / 2 - w / 2), 0, Math.round(w), 17, ui.bgInt, ui.accentInt, ui.panelInt);
    t.setDepth(1);
    const c = this.add.container(0, -20, [g, t]);
    this.tweens.add({ targets: c, y: 3, duration: reduced() ? 1 : 180, ease: 'Back.Out' });
    this.tweens.add({ targets: c, y: -22, delay: 2000, duration: reduced() ? 1 : 180, ease: 'Quad.In',
      onComplete: () => { c.destroy(); this.busy = false; } });
  }
}

/** Queue a banner at the top of the screen. `scene` is accepted for symmetry; toasts live on the Overlay. */
export function toast(_scene: Phaser.Scene | null, msg: string, sound = true) {
  if (queue.length > 6) return;
  queue.push(String(msg));
  if (sound) {
    const sfx = K.kit?.sfx ?? {};
    K.play(sfx.levelup ? 'levelup' : 'select', 0.6, 200);
  }
}
