// The wave-ladder PostHog tools: Data Pipelines, Batch Exports, Scouts, HogQL, Logs, Replay Vision, AI Observability,
// Revenue Analytics, Endpoints and PostHog Desktop. Same contract as weapons.ts: one function per tool (base LV 1-5 and
// evolved form), damage before might/crit (the scene applies those), drawing in drawTools().
import Phaser from 'phaser';
import { spr } from '@shared/kit';
import { burst, floatText } from '@shared/juice';
import { camW, camH } from '@shared/ui';
import type { GameScene, Enemy } from './game';
import { HOG64 } from './game';
import { hogFrame } from './hoggies';
import type { WeaponId } from './content';
import { OWN, type WState } from './weapons';

type Fn = (g: GameScene, w: WState, dt: number) => void;
const GOLD = 0xf8d878;

interface Scout { s: Phaser.GameObjects.Image; a: number; t: number }
interface Scanner { x: number; y: number; a: number; t: number; life: number; kind: number; zap: number }
interface Turret { s: Phaser.GameObjects.Image; t: number; life: number }

/** Distance from (px, py) to the segment (x1,y1)-(x2,y2), and how far along it (0-1). */
function seg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): [number, number] {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  const t = Phaser.Math.Clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return [Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t)), t];
}

/** The direction toward the most bugs near the hog (sampled). */
function crowdDir(g: GameScene, r: number): [number, number] {
  const p = g.player;
  let sx = 0, sy = 0;
  for (const e of g.near(p.x, p.y, r)) {
    if (e.arch === 'crate') continue;
    const dx = e.s.x - p.x, dy = e.s.y - p.y, d = Math.hypot(dx, dy) || 1;
    sx += dx / d; sy += dy / d;
  }
  const l = Math.hypot(sx, sy);
  if (l < 0.01) { const a = Math.random() * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; }
  return [sx / l, sy / l];
}

// ---------------------------------------------------------------- Data Pipelines
/** A pipeline run: seconds sucking in, then the blast out the back. At most once a minute (cooldowns don't touch it). */
export const PIPE = { every: 60, first: 6, suck: 1.4, blow: 0.9 };
const PIPE_RING = 520; // px/s the blast ring sweeps out at

interface PipeRun { id: number; t: number; dx: number; dy: number; half: number; eaten: number; ring: number }
let pipeId = 1;

const onScreen = (g: GameScene, x: number, y: number, pad = 8) => {
  const v = g.cameras.main.worldView, cam = g.cameras.main;
  return x > v.x - pad && x < v.x + camW(cam) + pad && y > v.y - pad && y < v.y + camH(cam) + pad;
};

/** Pipeline: every 60 s the hog vacuums up every small bug in front of it (elites too on v2.0), then blasts them out the
 * back in a ring that wipes the screen: small bugs die, elites lose half their HP, bosses take a chip. The hog can't be
 * hurt for the whole run. Evolved (Hog Transformations) it sucks from every side. */
const dataPipelines: Fn = (g, w, dt) => {
  const p = g.player;
  const runs = w.items as PipeRun[];
  let run = runs[0];
  if (!run) {
    if (!w.cnt) { w.cnt = 1; w.timer = PIPE.first; }
    w.timer -= dt;
    if (w.timer > 0 || g.interlude) return;
    w.timer = PIPE.every;
    const f = g.facing;
    run = { id: pipeId++, t: 0, dx: f.x, dy: f.y, half: w.evo ? Math.PI : 0.6 + 0.12 * w.level, eaten: 0, ring: 0 };
    runs.push(run);
    floatText(g, p.x, p.y - 30, 'PIPELINE RUN', 0xfca044, 1);
    g.sfx('vacuum', 0.9, 200);
  }
  run.t += dt;
  const end = PIPE.suck + PIPE.blow;
  g.invuln = Math.max(g.invuln, end + 0.3 - run.t);
  const grab = (e: Enemy) => !e.boss && !e.twin && !e.reaper && e.arch !== 'crate' && (!e.elite || w.major);
  if (run.t < PIPE.suck) {
    // Suck: everything small in the cone on screen gets pulled in, faster and faster, and is ingested at the mouth.
    const pull = 160 + 620 * (run.t / PIPE.suck);
    for (const e of [...g.enemies]) {
      if (!e.alive || !grab(e)) continue;
      const ex = e.s.x - p.x, ey = e.s.y - p.y, d = Math.hypot(ex, ey) || 1;
      if (e.hitAt.suck !== run.id) {
        if (!onScreen(g, e.s.x, e.s.y)) continue;
        const dot = (ex * run.dx + ey * run.dy) / d;
        if (Math.acos(Phaser.Math.Clamp(dot, -1, 1)) > run.half) continue;
        e.hitAt.suck = run.id;
      }
      if (d < 10) { run.eaten++; g.damage(e, e.hp + 1, 0, 0, 'data_pipelines', true, true); continue; }
      const step = Math.min(d, pull * dt);
      e.s.x -= (ex / d) * step; e.s.y -= (ey / d) * step;
      e.kx = 0; e.ky = 0;
    }
    return;
  }
  if (!run.ring) {
    // Blow: the ingested bugs come out the back as broken events, and the blast ring starts sweeping out.
    run.ring = 1;
    g.sfx('bomb', 0.8, 200);
    g.cameras.main.flash(160, 252, 160, 68);
    const n = Math.min(24, run.eaten);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(-run.dy, -run.dx) + (Math.random() - 0.5) * 0.9, sp = 260 + Math.random() * 140;
      g.shoot('shot', p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, 40, 0.9, 99, 'data_pipelines').s.setTintFill(i % 2 ? 0xfca044 : 0xfcfcfc);
    }
  }
  run.ring = Math.max(1, (run.t - PIPE.suck) * PIPE_RING);
  for (const e of [...g.enemies]) {
    if (!e.alive || e.reaper || e.hitAt.wipe === run.id) continue;
    if ((e.s.x - p.x) ** 2 + (e.s.y - p.y) ** 2 > run.ring * run.ring || !onScreen(g, e.s.x, e.s.y)) continue;
    e.hitAt.wipe = run.id;
    if (e.boss || e.twin) g.damage(e, e.maxHp * 0.08, 0, 0, 'data_pipelines', true, true);
    else if (e.elite) g.damage(e, e.maxHp * 0.5, 0, 0, 'data_pipelines', true, true);
    else g.damage(e, e.hp + 1, 0, 0, 'data_pipelines', true, true);
  }
  if (run.t >= end) runs.length = 0;
};

/** Pipeline effects: the intake cone and hose while sucking, then the exhaust and the blast ring. Drawn on the threat
 * layer at full strength: it's a once-a-minute screen event and you should see it. */
function drawPipeline(g: GameScene, fx: Phaser.GameObjects.Graphics) {
  const w = g.weapons.get('data_pipelines');
  const run = (w?.items as PipeRun[] | undefined)?.[0];
  if (!run) return;
  const p = g.player, t = g.time.now, a0 = Math.atan2(run.dy, run.dx);
  if (run.t < PIPE.suck) {
    const k = Math.min(1, run.t / 0.2), R = 200;
    fx.fillStyle(0xfca044, 0.1 * k).slice(p.x, p.y, R, a0 - run.half, a0 + run.half).fillPath();
    // Streaks flowing into the mouth.
    for (let i = 0; i < 18; i++) {
      const a = a0 + (((i * 0.618) % 1) * 2 - 1) * run.half, f = 1 - ((t / 260 + i / 18) % 1);
      const r = 14 + f * (R - 14);
      fx.fillStyle(0xfcfcfc, 0.7 * k * (1 - f * 0.5)).fillRect(Math.round(p.x + Math.cos(a) * r) - 1, Math.round(p.y + Math.sin(a) * r) - 1, 2, 2);
    }
    const hx = p.x + run.dx * 14, hy = p.y + run.dy * 14;
    fx.lineStyle(7, 0x3c3c3c, 1).lineBetween(p.x, p.y, hx, hy).lineStyle(4, 0xe45c10, 1).lineBetween(p.x, p.y, hx, hy);
    fx.fillStyle(0x3c3c3c, 1).fillCircle(hx, hy, 5).lineStyle(1, 0xfca044, 1).strokeCircle(hx, hy, 6 + Math.sin(t / 40));
    return;
  }
  const k = 1 - (run.t - PIPE.suck) / PIPE.blow;
  const bx = p.x - run.dx * 360, by = p.y - run.dy * 360;
  fx.lineStyle(18, 0xfca044, 0.25 * k).lineBetween(p.x, p.y, bx, by).lineStyle(6, 0xfcfcfc, 0.6 * k).lineBetween(p.x, p.y, bx, by);
  fx.lineStyle(4, 0xfca044, 0.8 * k).strokeCircle(p.x, p.y, run.ring).lineStyle(1, 0xfcfcfc, k).strokeCircle(p.x, p.y, run.ring - 3);
}

// ---------------------------------------------------------------- Batch Exports
/** Every hit tags the bug with the damage dealt (called from damage()); the export turns a share of it into a bulk hit. */
export function batchTag(g: GameScene, e: Enemy, d: number) {
  if (g.weapons.has('batch_exports')) e.batch = (e.batch ?? 0) + d;
}

const batchExports: Fn = (g, w, dt) => {
  const L = w.level;
  w.timer -= dt;
  if (w.items.length && w.items[0].at <= g.elapsed) { const b = w.items.shift(); runExport(g, w, b.k, true); }
  if (w.timer > 0) return;
  w.timer = Math.max(5, 10.5 - 0.9 * L) * Math.max(0.6, g.st.cd);
  const k = w.evo ? 0.45 : 0.2 + 0.05 * L;
  runExport(g, w, k, false);
  if (w.evo) w.items.push({ at: g.elapsed + 1, k: k * 0.5 }); // Backfill: the export replays at half strength
};

function runExport(g: GameScene, w: WState, k: number, replay: boolean) {
  let rows = 0;
  for (const e of [...g.enemies]) {
    const b = e.batch ?? 0;
    if (b <= 0 || !e.alive) continue;
    if (!replay) e.batch = 0;
    rows++;
    g.damage(e, b * k * (e.boss ? 0.35 : 1), 0, 0, 'batch_exports', true, true);
  }
  if (!rows) return;
  if (!replay && rows > w.cnt) w.cnt = rows;
  if (rows >= 100) g.earn('batch-exports');
  const p = g.player;
  floatText(g, p.x, p.y - 30, `${replay ? 'BACKFILLED' : 'EXPORTED'} ${rows} ROWS`, 0x3cbcfc, 0.9);
  for (let i = 0; i < Math.min(8, rows); i++) {
    const b = g.add.image(p.x, p.y, spr('crate')).setDepth(OWN + 0.4).setScale(0.5);
    const cam = g.cameras.main;
    g.tweens.add({ targets: b, x: cam.worldView.x + camW(cam) + 20, y: cam.worldView.y + Phaser.Math.Between(20, camH(cam) - 20), duration: 600 + i * 40,
      ease: 'Quad.In', onComplete: () => b.destroy() });
  }
  g.sfx('chest', 0.4, 200);
}

// ---------------------------------------------------------------- Scouts
const scouts: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const troop = w.items as Scout[];
  const n = Math.min(8, 1 + L + s.amount + (w.evo ? 2 : 0));
  while (troop.length < n) troop.push({ s: g.add.image(p.x, p.y, spr('drone')).setDepth(OWN + 0.4).setTint(w.evo ? GOLD : 0x3cbcfc), a: Math.random() * 6.28, t: Math.random() });
  const flagFor = w.major ? 8 : 4;
  troop.forEach((sc, i) => {
    sc.a += dt * (0.8 + (i % 3) * 0.2);
    const r = 60 + 30 * Math.sin(g.elapsed * 0.7 + i * 1.7);
    const tx = p.x + Math.cos(sc.a + i) * r, ty = p.y + Math.sin(sc.a * 1.3 + i) * r * 0.8;
    sc.s.x += (tx - sc.s.x) * Math.min(1, dt * 3);
    sc.s.y += (ty - sc.s.y) * Math.min(1, dt * 3);
    sc.t -= dt;
    if (sc.t > 0) return;
    sc.t = Math.max(0.4, 1.3 - 0.12 * L) * s.cd;
    // Flag the nearest unflagged bug: flagged bugs take +40% from everything.
    let best: Enemy | null = null, bd = 90 * 90 * s.area * s.area;
    for (const e of g.near(sc.s.x, sc.s.y, 90 * s.area)) {
      if (e.arch === 'crate' || (e.flagT ?? 0) > g.elapsed) continue;
      const d = (e.s.x - sc.s.x) ** 2 + (e.s.y - sc.s.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    best.flagT = g.elapsed + flagFor;
    g.zapLine(sc.s.x, sc.s.y, best.s.x, best.s.y, 0x3cbcfc);
    g.damage(best, 6 + 2 * L, 0, 0, 'scouts', true);
    w.cnt++;
    if (w.evo && w.cnt % 12 === 0) prLaser(g);
  });
};

/** Troop of 90: twelve signals make a report, and the report opens a PR: a laser through the flagged bugs. */
function prLaser(g: GameScene) {
  const p = g.player;
  let far: Enemy | null = null, fd = 0;
  for (const e of g.enemies) {
    if ((e.flagT ?? 0) < g.elapsed) continue;
    const d = (e.s.x - p.x) ** 2 + (e.s.y - p.y) ** 2;
    if (d > fd && d < 320 * 320) { fd = d; far = e; }
  }
  if (!far) return;
  const a = Math.atan2(far.s.y - p.y, far.s.x - p.x), ex = p.x + Math.cos(a) * 340, ey = p.y + Math.sin(a) * 340;
  for (const e of g.near((p.x + ex) / 2, (p.y + ey) / 2, 175)) {
    if (seg(e.s.x, e.s.y, p.x, p.y, ex, ey)[0] < 10 + e.r) g.damage(e, 90, Math.cos(a) * 120, Math.sin(a) * 120, 'scouts');
  }
  const fx = g.add.graphics().setDepth(OWN + 0.4).setAlpha(g.wAlpha('scouts'));
  fx.lineStyle(7, 0x3cbcfc, 0.35).lineBetween(p.x, p.y, ex, ey).lineStyle(2, 0xfcfcfc, 1).lineBetween(p.x, p.y, ex, ey);
  g.tweens.add({ targets: fx, alpha: 0, duration: 260, onComplete: () => fx.destroy() });
  floatText(g, p.x, p.y - 26, 'PR MERGED', 0x3cbcfc, 0.8);
  g.sfx('bossshot', 0.5, 150);
}

// ---------------------------------------------------------------- HogQL
export const hogqlThreshold = (w: WState) => (w.evo ? 0.15 : 0.05 + 0.01 * w.level);

const hogql: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.items.length && w.items[0] <= g.elapsed) { w.items.shift(); runQuery(g, w); }
  if (w.timer > 0) return;
  w.timer = (w.evo ? 3 : Math.max(3.5, 6.5 - 0.5 * w.level)) * Math.max(0.6, g.st.cd);
  runQuery(g, w);
  if (w.major) w.items.push(g.elapsed + 0.6);
};

function runQuery(g: GameScene, w: WState) {
  const thr = hogqlThreshold(w);
  const cam = g.cameras.main;
  let n = 0;
  for (const e of [...g.enemies]) {
    if (!e.alive || e.arch === 'crate') continue;
    if (e.s.x < cam.worldView.x - 8 || e.s.x > cam.worldView.x + camW(cam) + 8 || e.s.y < cam.worldView.y - 8 || e.s.y > cam.worldView.y + camH(cam) + 8) continue;
    if (e.reaper) continue;
    if (e.boss || e.twin) { g.damage(e, e.maxHp * 0.008, 0, 0, 'hogql', true, true); continue; }
    if (e.hp < e.maxHp * thr) { n++; g.damage(e, e.hp + 1, 0, 0, 'hogql', true, true); }
  }
  const p = g.player;
  floatText(g, p.x, p.y - 34, `DELETE FROM bugs WHERE hp < ${Math.round(thr * 100)}%`, 0x58d854, 0.55);
  if (n) floatText(g, p.x, p.y - 24, `${n} rows deleted`, 0xfcfcfc, 0.5);
  g.hogqlFlash = 0.18;
  g.sfx('zap', 0.4, 200);
}

// ---------------------------------------------------------------- Logs
/** Logs: every 10-15 s Hogzilla tears across the screen through the thick of the bugs, dropping log bombs down the road.
 * No screen shake. Evolved (Firehose): two cars on crossing lanes. */
interface Bomber { s: Phaser.GameObjects.Image; horiz: boolean; pos: number; dir: number; along: number; end: number; drop: number; id: number }
interface LogBomb { x: number; y: number; t: number }
let bomberId = 1;
const BOMBER_SPEED = 380, BOMB_FUSE = 0.35, BOMB_EVERY = 20;

const logs: Fn = (g, w, dt) => {
  const s = g.st, L = w.level, p = g.player;
  const st = (w.items[0] ??= { cars: [] as Bomber[], bombs: [] as LogBomb[] }) as { cars: Bomber[]; bombs: LogBomb[] };
  w.timer -= dt;
  if (w.timer <= 0 && !st.cars.length && !g.interlude) {
    w.timer = w.evo ? 10 : 15 - L;
    const cam = g.cameras.main, v = cam.worldView;
    const [cx, cy] = crowdDir(g, 170);
    const tx = p.x + cx * 50, ty = p.y + cy * 50;
    const first = Math.random() < 0.5;
    for (const horiz of w.evo ? [true, false] : [first]) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const lo = horiz ? v.x : v.y, len = horiz ? camW(cam) : camH(cam);
      const along = dir > 0 ? lo - 50 : lo + len + 50;
      const car = g.add.image(0, 0, HOG64, hogFrame('driving-hogzilla')).setDepth(OWN + 0.5).setScale(0.75);
      if (horiz) car.setFlipX(dir > 0); else car.setAngle(dir > 0 ? 90 : -90);
      st.cars.push({ s: car, horiz, pos: horiz ? ty : tx, dir, along, end: dir > 0 ? lo + len + 50 : lo - 50, drop: 0, id: bomberId++ });
    }
    g.sfx('charge', 0.5, 200);
  }
  const R = (22 + 2 * L) * s.area * (w.major ? 1.5 : 1), dmg = w.evo ? 70 : 24 + 9 * L;
  for (let i = st.cars.length - 1; i >= 0; i--) {
    const c = st.cars[i];
    const step = BOMBER_SPEED * dt;
    c.along += c.dir * step;
    const x = c.horiz ? c.along : c.pos, y = c.horiz ? c.pos : c.along;
    c.s.setPosition(x, y - (c.horiz ? 6 : 0));
    // Log bombs every BOMB_EVERY px, zig-zagging either side of the road.
    c.drop += step;
    while (c.drop >= BOMB_EVERY) {
      c.drop -= BOMB_EVERY;
      const side = (st.bombs.length % 2 ? 1 : -1) * 12;
      st.bombs.push({ x: x + (c.horiz ? 0 : side), y: y + (c.horiz ? side : 0), t: 0 });
    }
    // The car itself runs bugs over.
    for (const e of g.near(x, y, 16)) {
      if (e.hitAt.bomber === c.id || e.reaper) continue;
      e.hitAt.bomber = c.id;
      g.damage(e, dmg * 1.5, c.horiz ? c.dir * 200 : 0, c.horiz ? 0 : c.dir * 200, 'logs', true);
    }
    if ((c.dir > 0 && c.along > c.end) || (c.dir < 0 && c.along < c.end)) { c.s.destroy(); st.cars.splice(i, 1); }
  }
  for (let i = st.bombs.length - 1; i >= 0; i--) {
    const b = st.bombs[i];
    b.t += dt;
    if (b.t < BOMB_FUSE) continue;
    g.blast(b.x, b.y, R, dmg, 'logs');
    st.bombs.splice(i, 1);
    if (i % 3 === 0) g.sfx('explode', 0.25, 90);
  }
};

function drawLogs(g: GameScene, fx: Phaser.GameObjects.Graphics) {
  const st = g.weapons.get('logs')?.items[0] as { bombs: LogBomb[] } | undefined;
  if (!st) return;
  // A log bomb: a little scroll with a blinking fuse.
  for (const b of st.bombs) {
    fx.fillStyle(0x3c3c3c, 1).fillRect(b.x - 4, b.y - 2, 8, 4).fillStyle(0xb8f818, 1).fillRect(b.x - 3, b.y - 1, 6, 1);
    if (Math.floor(b.t * 20) % 2 === 0) fx.fillStyle(0xf83800, 1).fillRect(b.x + 3, b.y - 4, 2, 2);
  }
}

// ---------------------------------------------------------------- Replay Vision
const replayVision: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const sc = w.items as Scanner[];
  w.timer -= dt;
  const max = (w.evo ? 4 : 1 + Math.floor(L / 2)) + Math.min(1, s.amount);
  if (w.timer <= 0 && sc.length < max) {
    w.timer = (w.evo ? 1.5 : 3.2 - 0.25 * L) * s.cd;
    sc.push({ x: p.x, y: p.y, a: Math.random() * 6.28, t: 0, life: w.evo ? 8 : 6, kind: w.cnt++ % 4, zap: 0.2 });
  }
  const range = (w.evo ? 120 : 85 + 5 * L) * s.area, half = (0.45 + 0.04 * L) * (w.evo ? 1.3 : 1);
  const dmg = w.evo ? 30 : 12 + 5 * L;
  for (let i = sc.length - 1; i >= 0; i--) {
    const q = sc[i];
    q.t += dt; q.a += dt * 1.6; q.zap -= dt;
    if (q.t >= q.life) { sc.splice(i, 1); continue; }
    const inCone = g.near(q.x, q.y, range).filter((e) => {
      if (e.arch === 'crate') return false;
      const a = Math.atan2(e.s.y - q.y, e.s.x - q.x);
      return Math.abs(Phaser.Math.Angle.Wrap(a - q.a)) < half;
    });
    for (const e of inCone) e.hitAt.seen = g.elapsed + 0.3; // reveals Heisenbugs
    if (q.zap > 0 || !inCone.length) continue;
    q.zap = w.major ? 0.2 : 0.4;
    // Sees Everything: Monitor zaps the nearest, Scorer the toughest (x2), Classifier slows, Summarizer pulls gems.
    const kind = w.evo ? q.kind : 0;
    let t = inCone[0];
    if (kind === 1) t = inCone.reduce((a, b) => (b.hp > a.hp ? b : a), t);
    else t = inCone.reduce((a, b) => ((b.s.x - q.x) ** 2 + (b.s.y - q.y) ** 2 < (a.s.x - q.x) ** 2 + (a.s.y - q.y) ** 2 ? b : a), t);
    g.zapLine(q.x, q.y, t.s.x, t.s.y, kind === 1 ? GOLD : 0xa4e4fc);
    g.damage(t, dmg * (kind === 1 ? 2 : 1), 0, 0, 'replay_vision');
    if (kind === 2) for (const e of inCone) e.hitAt.slowUntil = g.elapsed + 0.8;
    if (kind === 3) g.pullGems(q.x, q.y, range);
  }
};

// ---------------------------------------------------------------- AI Observability
const aiObservability: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.timer > 0) return;
  const s = g.st, p = g.player, L = w.level;
  const root = g.nearest(p.x, p.y, 200 * s.area);
  if (!root) { w.timer = 0.2; return; }
  w.timer = (w.evo ? 0.9 : 1.7 - 0.15 * L) * s.cd;
  const depth = (L >= 4 ? 3 : 2) + (w.evo ? 1 : 0), branch = 2 + (w.major ? 1 : 0) + Math.min(1, s.amount);
  const hit = new Set<Enemy>([root]);
  const fx = g.add.graphics().setDepth(OWN + 0.4).setAlpha(g.wAlpha('ai_observability'));
  const dmg0 = w.evo ? 40 : 18 + 6 * L;
  const spanHit = (e: Enemy, dmg: number) => {
    // Evaluations: a span on a bug that was already traced lands as a crit.
    const again = w.evo && (e.hitAt.trace ?? 0) > g.elapsed;
    e.hitAt.trace = g.elapsed + 3;
    g.damage(e, dmg * (again ? g.st.critMul : 1), 0, 0, 'ai_observability', again);
  };
  spanHit(root, dmg0);
  let frontier = [root];
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next: Enemy[] = [];
    for (const n of frontier) {
      const kids = g.near(n.s.x, n.s.y, 70 * s.area).filter((e) => !hit.has(e) && e.arch !== 'crate')
        .sort((a, b) => ((a.s.x - n.s.x) ** 2 + (a.s.y - n.s.y) ** 2) - ((b.s.x - n.s.x) ** 2 + (b.s.y - n.s.y) ** 2)).slice(0, branch);
      for (const k of kids) {
        hit.add(k);
        fx.lineStyle(1, 0xd800cc, 0.9).lineBetween(n.s.x, n.s.y, k.s.x, k.s.y);
        spanHit(k, dmg0 * 0.75 ** d);
        next.push(k);
      }
    }
    frontier = next;
  }
  fx.fillStyle(0xf878f8, 1).fillCircle(root.s.x, root.s.y, 3);
  g.tweens.add({ targets: fx, alpha: 0, duration: 220, onComplete: () => fx.destroy() });
  g.sfx('zap', 0.3, 90);
};

// ---------------------------------------------------------------- Revenue Analytics
export const mrrMul = (g: GameScene, w: WState) => Math.min(6, 1 + g.goldGrabbed / 150) * (w.evo ? 1.25 ** Math.max(0, g.wave - 1) : 1);

const revenue: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.timer > 0) return;
  const s = g.st, p = g.player, L = w.level;
  const t = g.nearest(p.x, p.y, 240);
  if (!t) { w.timer = 0.2; return; }
  w.timer = (1.6 - 0.12 * L) * s.cd;
  const n = 1 + Math.min(2, s.amount);
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(t.s.y - p.y, t.s.x - p.x) + (i - (n - 1) / 2) * 0.25;
    const pr = g.shoot('coin', p.x, p.y, Math.cos(a) * 170, Math.sin(a) * 170, (20 + 6 * L) * mrrMul(g, w), 1.8, 3, 'revenue');
    pr.s.setScale(1.6);
    if (w.major) pr.boom = 30;
  }
  g.sfx('coin', 0.35, 90);
};

// ---------------------------------------------------------------- Endpoints
const endpoints: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const tur = w.items as Turret[];
  const max = w.evo ? 3 : 1 + (w.major ? 1 : 0);
  w.timer -= dt;
  if (w.timer <= 0) {
    w.timer = (w.evo ? 4 : 7 - 0.6 * L) * s.cd;
    if (tur.length >= max) tur.shift()!.s.destroy();
    const im = g.add.image(p.x, p.y + 4, g.crestKey(), g.crestFrameOf('platform-features')).setDepth(4);
    tur.push({ s: im, t: 0.3, life: w.evo ? Infinity : 9 });
    g.tweens.add({ targets: im, y: im.y - 6, duration: 120, yoyo: true });
  }
  const dmg = w.evo ? 34 : 14 + 6 * L, rate = Math.max(0.3, 0.9 - 0.08 * L) * s.cd * (w.evo ? 0.7 : 1);
  for (let i = tur.length - 1; i >= 0; i--) {
    const q = tur[i];
    q.life -= dt; q.t -= dt;
    if (q.life <= 0) { q.s.destroy(); tur.splice(i, 1); continue; }
    if (q.life < 1.5) q.s.setAlpha(Math.floor(q.life * 10) % 2 ? 1 : 0.4);
    if (q.t > 0) continue;
    const t = g.nearest(q.s.x, q.s.y, 200);
    if (!t) { q.t = 0.2; continue; }
    q.t = rate;
    const a = Math.atan2(t.s.y - q.s.y, t.s.x - q.s.x);
    g.shoot('shot', q.s.x, q.s.y - 4, Math.cos(a) * 240, Math.sin(a) * 240, dmg, 1, 2, 'endpoints').s.setTintFill(0x9878f8);
  }
};

// ---------------------------------------------------------------- PostHog Desktop
const desktop: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const n = Math.min(9, (w.evo ? 9 : 2 + L) + s.amount);
  while (w.orbs.length < n) w.orbs.push(g.add.image(p.x, p.y, spr('ai_bolt')).setDepth(OWN + 0.3).setTint(w.evo ? GOLD : 0xd8b8f8));
  while (w.orbs.length > n) w.orbs.pop()!.destroy();
  if (n >= 9) g.earn('posthog-desktop');
  const rad = 34 * s.area, spin = g.elapsed * 1.2;
  w.orbs.forEach((o, i) => o.setPosition(p.x + Math.cos(spin + (i / n) * 6.283) * rad, p.y + Math.sin(spin + (i / n) * 6.283) * rad * 0.8));
  w.timer -= dt;
  w.nova -= dt;
  const dmg = w.evo ? 22 : 8 + 3 * L;
  const fire = (o: Phaser.GameObjects.Image, volley: number) => {
    const t = g.nearest(o.x, o.y, 220);
    if (!t) return;
    for (let k = 0; k < volley; k++) {
      const a = Math.atan2(t.s.y - o.y, t.s.x - o.x) + (k - (volley - 1) / 2) * 0.3;
      const pr = g.shoot('ai_bolt', o.x, o.y, Math.cos(a) * 230, Math.sin(a) * 230, dmg, 1.4, 1, 'desktop');
      pr.homing = t; pr.speed = 230;
    }
  };
  if (w.timer <= 0) {
    // One agent at a time, round the ring.
    w.timer = (1.8 / n) * s.cd * (w.major ? 0.5 : 1);
    const o = w.orbs[w.cnt++ % n];
    if (o) fire(o, 1);
  }
  if (w.evo && w.nova <= 0) {
    // Dopamine Mode: every 5 s all nine fire a volley.
    w.nova = 5 * Math.max(0.5, s.cd);
    w.orbs.forEach((o) => fire(o, 3));
    burst(g, p.x, p.y, 0xd8b8f8, 16, { speed: 140, gravity: 0 });
    g.sfx('zap', 0.5, 150);
  }
};

export const TOOL_FNS: Record<string, Fn> = {
  data_pipelines: dataPipelines, batch_exports: batchExports, scouts, hogql, logs, replay_vision: replayVision,
  ai_observability: aiObservability, revenue, endpoints, desktop,
};

/** Pipes, log lines and scanner cones, drawn each frame. */
export function drawTools(g: GameScene, gfx: (id: WeaponId) => Phaser.GameObjects.Graphics) {
  drawPipeline(g, g.fx);
  if (g.weapons.has('logs')) drawLogs(g, gfx('logs'));
  const rv = g.weapons.get('replay_vision');
  if (rv) {
    const fx = gfx('replay_vision');
    const range = (rv.evo ? 120 : 85 + 5 * rv.level) * g.st.area, half = (0.45 + 0.04 * rv.level) * (rv.evo ? 1.3 : 1);
    for (const q of rv.items as Scanner[]) {
      const a = Math.min(1, (q.life - q.t) / 0.5);
      const col = rv.evo ? [0xa4e4fc, GOLD, 0x58d854, 0xf878f8][q.kind] : 0xa4e4fc;
      fx.fillStyle(col, 0.08 * a).slice(q.x, q.y, range, q.a - half, q.a + half).fillPath();
      fx.lineStyle(1, col, 0.4 * a).beginPath().arc(q.x, q.y, range, q.a - half, q.a + half).strokePath();
      fx.fillStyle(0xfcfcfc, a).fillCircle(q.x, q.y, 3).fillStyle(0x151515, a).fillCircle(q.x + Math.cos(q.a) * 1.5, q.y + Math.sin(q.a) * 1.5, 1.5);
    }
  }
}
