// Weapon behaviours: one entry per PostHog product, each with its base (levels 1-5) and evolved form.
// Damage passed to g.damage() is before might/crit; the scene applies those.
import Phaser from 'phaser';
import { spr, anim } from '@shared/kit';
import { burst } from '@shared/juice';
import type { GameScene, Enemy } from './game';
import type { WeaponId, Stats } from './content';

export interface Flag { s: Phaser.GameObjects.Image; life: number; zap: number }
export interface Ring { r: number; max: number; hit: Set<Enemy>; x: number; y: number; dmg: number; kb: number }

export interface Spot { x: number; y: number; t: number; life: number; r: number }

export interface WState {
  id: WeaponId;
  level: number;
  evo: boolean;
  timer: number;
  angle: number;
  flags: Flag[];
  orbs: Phaser.GameObjects.Image[];
  rings: Ring[];
  nova: number; // super evolution timer (heatmaps: damage tick timer)
  spots: Spot[];                          // heatmaps: hot tiles on the floor
  drone: Phaser.GameObjects.Sprite | null; // posthog_ai: the Max AI drone
  patch: number;                          // v1.x patches after LV 5 / evolution (x1.12 damage each)
  major: boolean;                         // v2.0 major release
  items: any[];                           // tools: pipes, scanners, turrets, log lines...
  cnt: number;                            // tools: a counter (scout flags, export hits...)
  born: number;                           // run time it was picked up (or evolved): its effects stay bright for a while
}

export const newWeapon = (id: WeaponId): WState => ({ id, level: 1, evo: false, timer: 0.3, angle: 0, flags: [], orbs: [], rings: [], nova: 1,
  spots: [], drone: null, patch: 0, major: false, items: [], cnt: 0, born: 0 });

/** "v0.3", "v1.0", "v1.4", "v2.1": the weapon's version for cards, HUD and pause. */
export const semver = (w: WState) => (w.major ? `v2.${w.patch}` : w.evo ? `v1.${w.patch}` : w.level >= 5 && w.patch ? `v0.5.${w.patch}` : `v0.${w.level}`);

const GOLD = 0xf8d878;
/** Your weapons draw at this depth: under the bugs (5-6) and the hog (10), so threats always read on top of your effects. */
export const OWN = 4.5;

/** Survey aura radius and slow factor (also read by enemy movement and drawing). */
export function aura(w: WState | undefined, s: Stats) {
  if (!w) return { r: 0, slow: 1 };
  return w.evo ? { r: 88 * s.area, slow: 0.3 } : { r: (40 + 8 * w.level) * s.area, slow: 0.6 - 0.05 * w.level };
}

type Fn = (g: GameScene, w: WState, dt: number) => void;

const experiments: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.timer > 0) return;
  const s = g.st, p = g.player, L = w.level;
  if (w.evo) {
    w.timer = 0.45 * s.cd;
    w.angle += 0.37;
    const per = 1 + Math.min(2, s.amount);
    for (let d = 0; d < 8; d++) {
      for (let i = 0; i < per; i++) {
        const a = w.angle + (d * Math.PI) / 4 + (i - (per - 1) / 2) * 0.13;
        g.shoot('shot', p.x, p.y, Math.cos(a) * 240, Math.sin(a) * 240, 30, 0.9, 3, 'experiments').s.setTintFill(d % 2 ? 0x3cbcfc : GOLD);
      }
    }
  } else {
    w.timer = (0.95 - 0.08 * L) * s.cd;
    const per = 1 + Math.floor(L / 2) + s.amount;
    const base = Math.atan2(g.facing.y, g.facing.x);
    for (const side of [0, Math.PI]) {
      for (let i = 0; i < per; i++) {
        const a = base + side + (i - (per - 1) / 2) * 0.2;
        g.shoot('shot', p.x, p.y, Math.cos(a) * 210, Math.sin(a) * 210, 9 + 3 * L, 0.85, L >= 4 ? 2 : 1, 'experiments');
      }
    }
  }
  g.sfx('shoot', 0.35, 70);
};

const errorTracking: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.timer > 0) return;
  const s = g.st, p = g.player, L = w.level;
  const target = g.nearest(p.x, p.y, w.evo ? 320 : 260);
  if (!target) { w.timer = 0.2; return; }
  w.timer = (w.evo ? 0.6 : 1.05 - 0.1 * L) * s.cd; // was 1.3 - 0.15L: too weak as a starting weapon
  const n = (w.evo ? 3 : L >= 5 ? 2 : 1) + s.amount;
  const sp = w.evo ? 210 : 150 + 15 * L;
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(target.s.y - p.y, target.s.x - p.x) + (i - (n - 1) / 2) * 0.6;
    const pr = g.shoot('homing', p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, w.evo ? 42 : 16 + 6 * L, 2.4, w.evo ? 2 : L >= 3 ? 3 : 2,
      'error_tracking');
    pr.homing = target; pr.speed = sp;
    if (w.evo) { pr.chain = 2; pr.s.setTint(GOLD); }
  }
  g.sfx('shoot', 0.3, 70);
};

const sessionReplay: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const n = (w.evo ? 6 : Math.min(5, 2 + L)) + s.amount; // 3 orbs at level 1: a viable starting weapon
  const orbs = w.orbs;
  while (orbs.length < n) {
    const o = g.add.image(p.x, p.y, spr('orb')).setDepth(OWN + 0.3);
    if (w.evo) o.setScale(1.5);
    orbs.push(o);
  }
  const rad = (w.evo ? 50 + 18 * Math.sin(g.elapsed * 2.2) : 26 + 4 * L) * s.area;
  const spin = g.elapsed * (w.evo ? 3.4 : 2.6 + 0.2 * L);
  const dmg = w.evo ? 28 : 7 + 3 * L, hitCd = w.evo ? 0.22 : 0.3, kb = w.evo ? 140 : 90, hitR = w.evo ? 8 : 5;
  orbs.forEach((o, i) => {
    const a = spin + (i / n) * Math.PI * 2;
    o.setPosition(p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad);
    for (const e of g.near(o.x, o.y, hitR)) {
      if ((e.hitAt.orb ?? 0) > g.elapsed) continue;
      e.hitAt.orb = g.elapsed + hitCd;
      const dx = e.s.x - p.x, dy = e.s.y - p.y, d = Math.hypot(dx, dy) || 1;
      g.damage(e, dmg, (dx / d) * kb, (dy / d) * kb, 'session_replay');
    }
  });
  // Super evolution: the orbs also fire stack traces.
  if (g.superNova) {
    w.nova -= dt;
    if (w.nova <= 0) {
      w.nova = 1.1 * s.cd;
      for (const o of orbs) {
        const t = g.nearest(o.x, o.y, 220);
        if (!t) continue;
        const a = Math.atan2(t.s.y - o.y, t.s.x - o.x);
        const pr = g.shoot('homing', o.x, o.y, Math.cos(a) * 220, Math.sin(a) * 220, 40, 1.6, 2, 'super');
        pr.homing = t; pr.speed = 220; pr.s.setTint(0xf878f8);
      }
    }
  }
};

const featureFlags: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const flags = w.flags;
  w.timer -= dt;
  const max = (w.evo ? 6 : L + 1) + s.amount;
  if (w.timer <= 0 && flags.length < max) {
    w.timer = (w.evo ? 0.8 : 2.4 - 0.3 * L) * s.cd;
    const f = g.add.image(p.x, p.y + 4, spr('flag')).setOrigin(0.15, 1).setDepth(4);
    if (w.evo) f.setTint(GOLD);
    flags.push({ s: f, life: w.evo ? 6 : 4.5, zap: 0.1 });
  }
  const range = (w.evo ? 96 : 72) * s.area;
  const dmg = w.evo ? 32 : 11 + 4 * L;
  for (let i = flags.length - 1; i >= 0; i--) {
    const f = flags[i];
    f.life -= dt; f.zap -= dt;
    f.s.setAlpha(f.life < 1 ? (Math.floor(f.life * 10) % 2 ? 1 : 0.3) : 1);
    if (f.zap <= 0) {
      const fx = f.s.x + 4, fy = f.s.y - 14;
      if (w.evo) {
        const ts = g.near(f.s.x, f.s.y - 10, range);
        f.zap = ts.length ? 0.3 : 0.1;
        if (ts.length) {
          ts.sort((a, b) => ((a.s.x - fx) ** 2 + (a.s.y - fy) ** 2) - ((b.s.x - fx) ** 2 + (b.s.y - fy) ** 2));
          let lx = fx, ly = fy;
          for (const t of ts.slice(0, 3)) {
            g.zapLine(lx, ly, t.s.x, t.s.y, GOLD);
            g.damage(t, dmg, 0, 0, 'feature_flags');
            lx = t.s.x; ly = t.s.y;
          }
          g.sfx('zap', 0.3, 90);
        }
      } else {
        const t = g.nearest(f.s.x, f.s.y - 10, range);
        f.zap = t ? Math.max(0.25, 0.5 - 0.04 * L) : 0.1;
        if (t) {
          g.zapLine(fx, fy, t.s.x, t.s.y);
          g.damage(t, dmg, 0, 0, 'feature_flags');
          g.sfx('zap', 0.3, 90);
        }
      }
    }
    if (f.life <= 0) { f.s.destroy(); flags.splice(i, 1); }
  }
};

const productAnalytics: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const rings = w.rings;
  w.timer -= dt;
  if (w.timer <= 0) {
    w.timer = (w.evo ? 1.5 : 3.2 - 0.35 * L) * s.cd;
    const max = (w.evo ? 125 : 60 + 10 * L) * s.area;
    const dmg = w.evo ? 44 : 13 + 5 * L, kb = w.evo ? 260 : 140;
    rings.push({ r: 4, max, hit: new Set(), x: p.x, y: p.y, dmg, kb });
    if (w.evo) rings.push({ r: -50, max, hit: new Set(), x: p.x, y: p.y, dmg, kb });
    g.sfx('pulse', 0.5);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.x = p.x; r.y = p.y;
    r.r += dt * r.max * 2.6;
    if (r.r > 0) {
      for (const e of g.near(r.x, r.y, r.r)) {
        if (r.hit.has(e)) continue;
        const d = Math.hypot(e.s.x - r.x, e.s.y - r.y);
        if (d < r.r - 14) continue; // only the ring's edge hurts
        r.hit.add(e);
        g.damage(e, r.dmg, ((e.s.x - r.x) / (d || 1)) * r.kb, ((e.s.y - r.y) / (d || 1)) * r.kb, 'product_analytics');
      }
    }
    if (r.r >= r.max) rings.splice(i, 1);
  }
};

const surveys: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.timer > 0) return;
  w.timer = w.evo ? 0.3 : 0.5;
  const { r } = aura(w, g.st);
  const dmg = w.evo ? 12 : 2 + 2 * w.level;
  for (const e of g.near(g.player.x, g.player.y, r)) g.damage(e, dmg, 0, 0, 'surveys', true);
  if (w.evo) burst(g, g.player.x + Phaser.Math.Between(-r, r) * 0.7, g.player.y + Phaser.Math.Between(-r, r) * 0.7, 0xfcfcfc, 2,
    { speed: 25, gravity: 20, life: 0.6, size: 1 });
};

// ---------------------------------------------------------------- Act 2 tools

/** Beam geometry for Web Analytics (also used by the drawing). */
export function beams(w: WState, s: Stats) {
  const n = w.evo ? 6 + Math.min(2, s.amount) : Math.min(4, (w.level >= 4 ? 2 : 1) + s.amount);
  const len = (w.evo ? 110 : 70 + 10 * w.level) * s.area;
  return { n, len, angles: Array.from({ length: n }, (_, b) => w.angle + (b * Math.PI * 2) / n) };
}

const webAnalytics: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  // Hot Reload and Ship It spin the beam faster.
  w.angle += dt * (1.5 + 0.15 * L) / Math.max(0.5, s.cd);
  w.timer -= dt;
  if (w.timer > 0) return;
  w.timer = 0.06;
  const { len, angles } = beams(w, s);
  const dmg = w.evo ? 30 : 6 + 3 * L;
  for (const a of angles) {
    const cx = Math.cos(a), cy = Math.sin(a);
    for (const e of g.near(p.x + (cx * len) / 2, p.y + (cy * len) / 2, len / 2 + 4)) {
      const rx = e.s.x - p.x, ry = e.s.y - p.y;
      const along = rx * cx + ry * cy;
      if (along < 0 || along > len + e.r) continue;
      if (Math.abs(-rx * cy + ry * cx) > e.r + 3) continue;
      if ((e.hitAt.beam ?? 0) > g.elapsed) continue;
      e.hitAt.beam = g.elapsed + 0.35;
      g.damage(e, dmg, cx * 30, cy * 30, 'web_analytics');
    }
  }
};

const heatmaps: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const r = (w.evo ? 16 : 8 + 1.5 * L) * s.area;
  w.timer -= dt;
  if (w.timer <= 0) {
    w.timer = 0.2 * Math.max(0.5, s.cd);
    const last = w.spots[w.spots.length - 1];
    // A new hot tile when the hog has moved on, or when the one underfoot is getting old.
    if (!last || Math.hypot(last.x - p.x, last.y - p.y - 6) > r * 0.8 || last.t > 0.7) {
      w.spots.push({ x: p.x, y: p.y + 6, t: 0, life: w.evo ? 4 : 2 + 0.3 * L, r });
      if (w.spots.length > 60) w.spots.shift();
    }
  }
  w.nova -= dt;
  const tick = w.nova <= 0;
  if (tick) w.nova = 0.25;
  const dmg = w.evo ? 15 : 4 + 2.5 * L;
  for (let i = w.spots.length - 1; i >= 0; i--) {
    const q = w.spots[i];
    q.t += dt;
    if (q.t >= q.life) { w.spots.splice(i, 1); continue; }
    if (!tick) continue;
    for (const e of g.near(q.x, q.y, q.r)) {
      if ((e.hitAt.heat ?? 0) > g.elapsed) continue;
      e.hitAt.heat = g.elapsed + 0.3;
      if (w.evo) e.hitAt.slowUntil = g.elapsed + 0.6; // Heat Wave: bugs wade through it
      g.damage(e, dmg, 0, 0, 'heatmaps', true);
    }
  }
};

const posthogAi: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  if (!w.drone) {
    w.drone = g.add.sprite(p.x, p.y - 16, spr('drone')).setDepth(OWN + 0.4);
    w.drone.play(anim('drone'));
    if (w.evo) w.drone.setTint(GOLD);
  }
  const d = w.drone;
  const a = g.elapsed * 1.3;
  const tx = p.x + Math.cos(a) * 20, ty = p.y - 16 + Math.sin(a * 2) * 4;
  const k = Math.min(1, dt * 6);
  d.x += (tx - d.x) * k;
  d.y += (ty - d.y) * k;
  d.setFlipX(tx < p.x);
  w.timer -= dt;
  if (w.timer > 0) return;
  // Max AI goes for the biggest problem first: the highest-HP bug in range (the boss, if it's close).
  let best: Enemy | null = null, bh = 0;
  for (const e of g.near(p.x, p.y, 240)) if (e.arch !== 'crate' && e.hp > bh) { bh = e.hp; best = e; }
  if (!best) { w.timer = 0.2; return; }
  w.timer = (w.evo ? 0.45 : 1.25 - 0.12 * L) * s.cd;
  const n = (w.evo ? 3 : 1 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0)) + Math.min(2, s.amount);
  const sp = 230;
  for (let i = 0; i < n; i++) {
    const ang = Math.atan2(best.s.y - d.y, best.s.x - d.x) + (i - (n - 1) / 2) * 0.5;
    const pr = g.shoot('ai_bolt', d.x, d.y, Math.cos(ang) * sp, Math.sin(ang) * sp, w.evo ? 36 : 14 + 5 * L, 2.2, w.evo ? 2 : 1, 'posthog_ai');
    pr.homing = best; pr.speed = sp;
    if (w.evo) pr.chain = 1;
  }
  g.sfx('zap', 0.25, 90);
};

const dataWarehouse: Fn = (g, w) => {
  const s = g.st, p = g.player, L = w.level;
  const n = Math.min(4, 1 + Math.floor(L / 2) + s.amount);
  while (w.orbs.length < n) w.orbs.push(g.add.image(p.x, p.y, spr('vault')).setDepth(OWN + 0.3).setScale(1.25));
  while (w.orbs.length > n) w.orbs.pop()!.destroy();
  const rad = (56 + 4 * L) * s.area;
  const spin = -g.elapsed * 1.15;
  const dmg = w.evo ? 70 : 20 + 8 * L;
  w.orbs.forEach((o, i) => {
    const a = spin + (i / n) * Math.PI * 2;
    o.setPosition(p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad).setRotation(Math.sin(g.elapsed * 2 + i) * 0.15);
    for (const e of g.near(o.x, o.y, 9)) {
      if ((e.hitAt.vault ?? 0) > g.elapsed) continue;
      e.hitAt.vault = g.elapsed + 0.7;
      const dx = e.s.x - p.x, dy = e.s.y - p.y, d = Math.hypot(dx, dy) || 1;
      g.damage(e, dmg, (dx / d) * 260, (dy / d) * 260, 'data_warehouse');
      if (w.evo && g.projs.length < 240) {
        // Managed Warehouse: the drum shatters the bug into shards that fly on.
        for (let k = 0; k < 3; k++) {
          const a = Math.atan2(dy, dx) + (k - 1) * 0.5;
          g.shoot('shot', e.s.x, e.s.y, Math.cos(a) * 200, Math.sin(a) * 200, 18, 0.5, 2, 'data_warehouse').s.setTintFill(0x3cbcfc);
        }
      }
    }
  });
};

const workflows: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.timer > 0) return;
  const s = g.st, p = g.player, L = w.level;
  let t = g.nearest(p.x, p.y, 150 * s.area);
  if (!t) { w.timer = 0.2; return; }
  w.timer = (1.7 - 0.15 * L) * s.cd;
  const hops = (w.evo ? 8 : 2 + L) + s.amount, dmg = w.evo ? 40 : 12 + 5 * L, reach = 90 * s.area;
  const hit = new Set<Enemy>();
  let lx = p.x, ly = p.y;
  for (let k = 0; k < hops && t; k++) {
    g.zapLine(lx, ly, t.s.x, t.s.y, 0xfca044);
    hit.add(t);
    lx = t.s.x; ly = t.s.y;
    g.damage(t, dmg, 0, 0, 'workflows');
    if (w.evo) {
      // Multi-Channel Blast: every hop forks a side zap to the next-nearest bug.
      const side = g.near(lx, ly, reach).find((e) => !hit.has(e) && e.arch !== 'crate');
      if (side) { hit.add(side); g.zapLine(lx, ly, side.s.x, side.s.y, 0xf8d878); g.damage(side, dmg * 0.7, 0, 0, 'workflows'); }
    }
    let next: Enemy | null = null, nd = reach * reach;
    for (const e of g.near(lx, ly, reach)) {
      if (hit.has(e) || e.arch === 'crate') continue;
      const dd = (e.s.x - lx) ** 2 + (e.s.y - ly) ** 2;
      if (dd < nd) { nd = dd; next = e; }
    }
    t = next;
  }
  g.sfx('zap', 0.35, 90);
};

export const WEAPON_FNS: Partial<Record<WeaponId, Fn>> = {
  experiments, error_tracking: errorTracking, session_replay: sessionReplay, feature_flags: featureFlags,
  product_analytics: productAnalytics, surveys,
  web_analytics: webAnalytics, heatmaps, posthog_ai: posthogAi, data_warehouse: dataWarehouse, workflows,
};

/** Rings (analytics), the survey aura, heat tiles and traffic beams, drawn each frame. */
export function drawWeapons(g: GameScene, gfx: (id: WeaponId) => Phaser.GameObjects.Graphics, auraG: Phaser.GameObjects.Graphics) {
  const sv = g.weapons.get('surveys');
  auraG.clear();
  const hm = g.weapons.get('heatmaps');
  if (hm) {
    for (const q of hm.spots) {
      const k = 1 - q.t / q.life;
      const flick = 0.85 + 0.15 * Math.sin(g.time.now / 60 + q.x);
      auraG.fillStyle(hm.evo ? 0xf8b800 : 0xf83800, 0.28 * k * flick).fillEllipse(q.x, q.y, q.r * 2, q.r * 1.4);
      auraG.fillStyle(hm.evo ? 0xfcfcfc : 0xfca044, 0.34 * k * flick).fillEllipse(q.x, q.y, q.r * 1.2, q.r * 0.8);
      if (k > 0.5) auraG.fillStyle(0xf8d878, 0.4 * k).fillEllipse(q.x, q.y, q.r * 0.5, q.r * 0.35);
    }
  }
  const wa = g.weapons.get('web_analytics');
  if (wa) {
    const fx = gfx('web_analytics');
    const { len, angles } = beams(wa, g.st);
    const px = g.player.x, py = g.player.y;
    for (const a of angles) {
      const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len;
      fx.lineStyle(5, 0x00b800, 0.25).lineBetween(px, py, ex, ey);
      fx.lineStyle(3, 0x58d854, 0.55).lineBetween(px, py, ex, ey);
      fx.lineStyle(1, 0xfcfcfc, 0.9).lineBetween(px, py, ex, ey);
      // Packets of traffic running out along the beam.
      for (let i = 0; i < 4; i++) {
        const f = ((g.time.now / 400 + i / 4) % 1);
        fx.fillStyle(0xb8f818, 1).fillRect(Math.round(px + Math.cos(a) * len * f) - 1, Math.round(py + Math.sin(a) * len * f) - 1, 2, 2);
      }
      fx.fillStyle(0xfcfcfc, 0.8).fillCircle(ex, ey, 2);
    }
  }
  if (sv) {
    const { r: r0 } = aura(sv, g.st);
    const r = r0 + Math.sin(g.time.now / 200) * 2;
    const col = sv.evo ? 0x78c8f8 : 0xf85898;
    auraG.fillStyle(col, sv.evo ? 0.16 : 0.12).fillCircle(g.player.x, g.player.y, r)
      .lineStyle(1, col, 0.6).strokeCircle(g.player.x, g.player.y, r);
  }
  const pa = g.weapons.get('product_analytics');
  if (pa) {
    const fx = gfx('product_analytics');
    for (const r of pa.rings) {
      if (r.r <= 0) continue;
      const n = pa.evo ? 36 : 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const h = 2 + ((i * 7) % 5) + (pa.evo ? 2 : 0);
        const c = pa.evo ? (i % 3 ? GOLD : 0xf87858) : (i % 3 ? 0x3cbcfc : 0x0058f8);
        fx.fillStyle(c, 1 - r.r / r.max / 1.5).fillRect(Math.round(r.x + Math.cos(a) * r.r) - 1, Math.round(r.y + Math.sin(a) * r.r) - h, 3, h);
      }
    }
  }
}

/** Tidy up a weapon's display objects (on evolution the orbs/flags are rebuilt in the new style). */
export function resetVisuals(w: WState) {
  w.orbs.forEach((o) => o.destroy());
  w.orbs = [];
  w.drone?.destroy();
  w.drone = null;
  w.flags.forEach((f) => f.s.destroy());
  w.flags = [];
}
