// Companions, release effects, powerup extras and the unhinged set pieces: hog pals (Hedgehog Mode), the DeskHog
// turret, Dopamine Mode agents, Self-Driving Product PRs, the Scout Troop powerup, the Hogzilla drive-by, ALL HANDS
// (a stampede of every hoggie you've unlocked) and the Reaper at wave 13.
import Phaser from 'phaser';
import { spr } from '@shared/kit';
import { burst, floatText, shake } from '@shared/juice';
import { camW, camH } from '@shared/ui';
import type { GameScene, Enemy } from './game';
import { HOG32, HOG64 } from './game';
import { hogFrame } from './hoggies';
import { save } from './save';
import { OWN } from './weapons';

interface Pal { s: Phaser.GameObjects.Image; t: number; off: number }
interface Agent { s: Phaser.GameObjects.Image; life: number; a: number }
interface Scout { s: Phaser.GameObjects.Image; a: number; t: number }
export interface Drive { id: number; horiz: boolean; pos: number; dir: number; t: number; s: Phaser.GameObjects.Image | null; hitHog: boolean }
interface Runner { s: Phaser.GameObjects.Image; vx: number; vy: number; life: number }

export interface SysState {
  pals: Pal[];
  desk: Pal | null;
  agents: Agent[];
  troop: Scout[];
  prT: number;
  drive: Drive | null;
  runners: Runner[];
}
export const newSys = (): SysState => ({ pals: [], desk: null, agents: [], troop: [], prT: 20, drive: null, runners: [] });

/** Companion damage keeps up with the ladder. */
const waveMul = (g: GameScene) => 1 + 0.45 * (g.wave - 1);

export function tickSystems(g: GameScene, dt: number) {
  const S = g.xs, p = g.player;
  // Hedgehog Mode: two pals per stack, picked from the hoggies you've unlocked.
  const want = 2 * (g.releases.get('hedgehog') ?? 0);
  if (S.pals.length < want) {
    const pool = save().hogs.filter((h) => h !== g.hog);
    const id = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'party';
    S.pals.push({ s: g.add.image(p.x, p.y, HOG32, hogFrame(id)).setScale(0.7).setDepth(9).setOrigin(0.5, 0.72), t: Math.random(), off: S.pals.length });
  }
  S.pals.forEach((pal, i) => follow(g, pal, dt, i, 26 + 6 * Math.floor(i / 2), 0.8, 18, 'hedgehog'));
  // DeskHog: a tiny console that follows and shoots.
  if (g.releases.has('deskhog') && !S.desk) S.desk = { s: g.add.image(p.x, p.y, HOG32, hogFrame('desk-wizard')).setScale(0.6).setDepth(9), t: 0, off: 7 };
  if (S.desk) follow(g, S.desk, dt, 7, 20, 0.45, 16, 'deskhog');
  // Dopamine Mode agents: orbit and bump into bugs.
  for (let i = S.agents.length - 1; i >= 0; i--) {
    const a = S.agents[i];
    a.life -= dt; a.a += dt * 3;
    if (a.life <= 0) { a.s.destroy(); S.agents.splice(i, 1); continue; }
    const r = 30 + 8 * (i % 3);
    a.s.setPosition(p.x + Math.cos(a.a + i) * r, p.y + Math.sin(a.a + i) * r * 0.8).setAlpha(a.life < 2 ? 0.5 : 1);
    for (const e of g.near(a.s.x, a.s.y, 6)) {
      if ((e.hitAt.agent ?? 0) > g.elapsed) continue;
      e.hitAt.agent = g.elapsed + 0.3;
      g.damage(e, 14 * waveMul(g), 0, 0, 'dopamine');
    }
  }
  // Self-Driving Product: a PR lands on the biggest crowd every 20 s.
  if (g.releases.has('selfdriving') && !g.interlude) {
    S.prT -= dt;
    if (S.prT <= 0) { S.prT = 20; selfDrivingPr(g); }
  }
  // Scout Troop powerup: 8 drones for a while.
  if (g.pu.troop > 0) {
    while (S.troop.length < 8) S.troop.push({ s: g.add.image(p.x, p.y, spr('drone')).setDepth(11).setTint(0x3cbcfc), a: Math.random() * 6.28, t: Math.random() * 0.5 });
    S.troop.forEach((sc, i) => {
      sc.a += dt * 1.5;
      sc.s.setPosition(p.x + Math.cos(sc.a + i * 0.8) * 70, p.y + Math.sin(sc.a * 1.2 + i) * 55);
      sc.t -= dt;
      if (sc.t > 0) return;
      sc.t = 0.5;
      const t = g.nearest(sc.s.x, sc.s.y, 110);
      if (!t) return;
      t.flagT = g.elapsed + 4;
      g.zapLine(sc.s.x, sc.s.y, t.s.x, t.s.y, 0x3cbcfc);
      g.damage(t, 18 * waveMul(g), 0, 0, 'troop', true);
    });
  } else if (S.troop.length) {
    S.troop.forEach((sc) => sc.s.destroy());
    S.troop = [];
  }
  tickDrive(g, dt);
  tickRunners(g, dt);
}

/** A companion trails the hog and shoots the nearest bug. */
function follow(g: GameScene, c: Pal, dt: number, i: number, r: number, rate: number, dmg: number, src: string) {
  const p = g.player;
  const a = g.elapsed * 0.9 + (i * Math.PI * 2) / 6;
  const tx = p.x + Math.cos(a) * r, ty = p.y + Math.sin(a) * r * 0.6;
  c.s.x += (tx - c.s.x) * Math.min(1, dt * 5);
  c.s.y += (ty - c.s.y) * Math.min(1, dt * 5);
  c.s.setFlipX(tx > c.s.x);
  c.t -= dt;
  if (c.t > 0) return;
  const t = g.nearest(c.s.x, c.s.y, 200);
  if (!t) { c.t = 0.2; return; }
  c.t = rate * g.st.cd;
  const ang = Math.atan2(t.s.y - c.s.y, t.s.x - c.s.x);
  g.shoot('shot', c.s.x, c.s.y - 4, Math.cos(ang) * 230, Math.sin(ang) * 230, dmg * waveMul(g), 1, 2, src).s.setTintFill(src === 'deskhog' ? 0x58d854 : 0xf8d878);
}

export function onLevelUpSys(g: GameScene) {
  if (!g.releases.has('dopamine') || g.xs.agents.length >= 9) return;
  const p = g.player;
  g.xs.agents.push({ s: g.add.image(p.x, p.y, spr('ai_bolt')).setDepth(9).setTint(0xd8b8f8).setScale(1.4), life: 20, a: Math.random() * 6.28 });
}

/** Self-Driving Product: a scout finds the densest crowd and a PR lands on it. */
export function selfDrivingPr(g: GameScene) {
  const cam = g.cameras.main;
  let best: Enemy | null = null, bn = 0;
  for (let k = 0; k < 24 && g.enemies.length; k++) {
    const e = g.enemies[Math.floor(Math.random() * g.enemies.length)];
    if (e.boss || e.arch === 'crate' || e.s.x < cam.worldView.x || e.s.x > cam.worldView.x + camW(cam) || e.s.y < cam.worldView.y || e.s.y > cam.worldView.y + camH(cam)) continue;
    const n = g.near(e.s.x, e.s.y, 60).length;
    if (n > bn) { bn = n; best = e; }
  }
  if (!best) return;
  const x = best.s.x, y = best.s.y;
  for (const e of g.near(x, y, 70)) {
    if (e.boss || e.twin) g.damage(e, e.maxHp * 0.03, 0, 0, 'selfdriving', true, true);
    else if (!e.reaper) g.damage(e, e.maxHp * 0.4 + 30 * waveMul(g), 0, 0, 'selfdriving', true, true);
  }
  g.blast(x, y, 70, 0, 'selfdriving');
  const fx = g.add.graphics().setDepth(OWN + 0.4).setAlpha(g.fxAlpha());
  fx.lineStyle(2, 0x3cbcfc, 1).strokeCircle(x, y, 70).lineStyle(1, 0xfcfcfc, 0.8).strokeCircle(x, y, 60);
  g.tweens.add({ targets: fx, alpha: 0, duration: 400, onComplete: () => fx.destroy() });
  floatText(g, x, y - 20, `PR #${1000 + Math.floor(Math.random() * 9000)} MERGED`, 0x3cbcfc, 0.7);
  g.sfx('bomb', 0.5, 200);
}

// ---------------------------------------------------------------- Hogzilla drive-by
/** A horn, a flashing lane through the hog's position, then Driving Hogzilla barrels across. */
export function startDriveBy(g: GameScene) {
  if (g.xs.drive) return;
  const horiz = Math.random() < 0.6;
  g.xs.drive = { id: 1 + Math.floor(Math.random() * 1e6), horiz, pos: horiz ? g.player.y : g.player.x, dir: Math.random() < 0.5 ? 1 : -1, t: 0, s: null, hitHog: false };
  g.sfx('charge', 0.9, 100);
}

function tickDrive(g: GameScene, dt: number) {
  const d = g.xs.drive;
  if (!d) return;
  d.t += dt;
  const cam = g.cameras.main;
  const warn = 1.8;
  if (d.t < warn) {
    if (Math.floor(d.t * 4) !== Math.floor((d.t - dt) * 4)) g.sfx('elite', 0.4, 100);
    return;
  }
  if (!d.s) {
    d.s = g.add.image(0, 0, HOG64, hogFrame('driving-hogzilla')).setDepth(15).setFlipX(d.dir > 0);
    shake(g, 4, 1200);
  }
  const span = (d.horiz ? camW(cam) : camH(cam)) + 160;
  const k = (d.t - warn) * 560;
  const along = (d.horiz ? cam.worldView.x : cam.worldView.y) + (d.dir > 0 ? -80 + k : span - 80 - k);
  if (d.horiz) d.s.setPosition(along, d.pos - 8); else d.s.setPosition(d.pos, along).setAngle(d.dir > 0 ? 90 : -90);
  // Everything in the lane near the car gets flattened (bosses take a chip).
  const x = d.s.x, y = d.s.y + (d.horiz ? 8 : 0);
  for (const e of g.near(x, y, 30)) {
    if (e.hitAt.drive === d.id || e.reaper) continue;
    e.hitAt.drive = d.id;
    if (e.boss || e.twin) g.damage(e, e.maxHp * 0.04, 0, 0, 'hogzilla', true, true);
    else g.damage(e, e.hp + 1, d.horiz ? d.dir * 300 : 0, d.horiz ? 0 : d.dir * 300, 'hogzilla', true, true);
  }
  const p = g.player;
  if (!d.hitHog && Math.hypot(p.x - x, p.y - y) < 22) {
    d.hitHog = true;
    if (g.pu.autopilot <= 0 && g.pu.hogzilla <= 0 && g.invuln <= 0 && !g.interlude && !g.won) {
      floatText(g, p.x, p.y - 30, 'RUN OVER BY HOGZILLA', 0x58d854, 0.9);
      g.earn('youtube');
      g.hurt(g.st.maxHp * 0.25 / Math.max(0.3, 1 - g.st.armour), 'hogzilla', true);
    }
  }
  if (k > span + 80) { d.s.destroy(); g.xs.drive = null; }
}

/** The warning lane (drawn under everything else in fx). */
function drawDrive(g: GameScene, fx: Phaser.GameObjects.Graphics) {
  const d = g.xs.drive;
  if (!d) return;
  const cam = g.cameras.main;
  const on = d.t < 1.8 ? Math.floor(d.t * 6) % 2 === 0 : true;
  const a = d.t < 1.8 ? (on ? 0.35 : 0.12) : 0.1;
  if (d.horiz) fx.fillStyle(0xf8b800, a).fillRect(cam.worldView.x, d.pos - 22, camW(cam), 44);
  else fx.fillStyle(0xf8b800, a).fillRect(d.pos - 22, cam.worldView.y, 44, camH(cam));
  if (d.t < 1.8 && on) {
    // Chevrons pointing the way it's coming.
    fx.fillStyle(0xf83800, 0.9);
    for (let i = 0; i < 8; i++) {
      const f = (i + 0.5) / 8;
      const cx = d.horiz ? cam.worldView.x + f * camW(cam) : d.pos, cy = d.horiz ? d.pos : cam.worldView.y + f * camH(cam);
      const ax = d.horiz ? d.dir * 6 : 0, ay = d.horiz ? 0 : d.dir * 6;
      fx.fillTriangle(cx + ax, cy + ay, cx - ax + (d.horiz ? 0 : 5), cy - ay + (d.horiz ? 5 : 0), cx - ax - (d.horiz ? 0 : 5), cy - ay - (d.horiz ? 5 : 0));
    }
  }
}

// ---------------------------------------------------------------- ALL HANDS
/** Every hoggie you've unlocked (up to n) stampedes across the screen, flattening bugs on the way. */
export function allHands(g: GameScene, n = 24) {
  const ids = save().hogs;
  if (!ids.length) return;
  const cam = g.cameras.main;
  const dir = Math.random() < 0.5 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const id = ids[i % ids.length];
    const y = cam.worldView.y + 24 + ((i * 37) % (camH(cam) - 48));
    const x = dir > 0 ? cam.worldView.x - 20 - (i % 6) * 26 : cam.worldView.x + camW(cam) + 20 + (i % 6) * 26;
    const s = g.add.image(x, y, HOG32, hogFrame(id)).setDepth(14).setFlipX(dir > 0);
    g.xs.runners.push({ s, vx: dir * (260 + (i % 5) * 30), vy: 0, life: 3.2 });
  }
  g.banner('ALL HANDS!', 'The whole company showed up');
  g.sfx('boss', 0.4, 300);
}

function tickRunners(g: GameScene, dt: number) {
  const R = g.xs.runners;
  for (let i = R.length - 1; i >= 0; i--) {
    const r = R[i];
    r.life -= dt;
    r.s.x += r.vx * dt;
    r.s.y += Math.sin(g.elapsed * 18 + i) * 0.6;
    if (r.life <= 0) { r.s.destroy(); R.splice(i, 1); continue; }
    for (const e of g.near(r.s.x, r.s.y, 12)) {
      if ((e.hitAt.hands ?? 0) > g.elapsed || e.reaper) continue;
      e.hitAt.hands = g.elapsed + 1;
      g.damage(e, e.boss ? e.maxHp * 0.01 : 60 * (1 + 0.6 * (g.wave - 1)), 0, 0, 'allhands', true, e.boss);
    }
  }
}

// ---------------------------------------------------------------- the Reaper
/** Wave 13: Nohog, the endgame boss. A hog-shaped hole in the world (the Reaper's art filled with void) that comes for
 * you, never stops and keeps speeding up. Internally still `reaper`. */
export const VOID = 0x0c0014;
export function spawnReaper(g: GameScene) {
  if (g.enemies.some((e) => e.reaper)) return;
  const [x, y] = g.offscreenPoint();
  const e = g.addEnemy('tank', x, y);
  if (!e) return;
  e.s.stop().setTexture(HOG64, hogFrame('reaper')).setScale(0.75).setDepth(21); // above the fx layer its void is drawn on
  const hp = Math.max(1e6, g.dps() * 240);
  Object.assign(e, { reaper: true, hp, maxHp: hp, speed: 60, dmg: g.st.maxHp * 0.5, r: 16, armour: 1, kb: 0, tint: null, xp: 0 });
  e.s.setTintFill(VOID);
  g.banner('NOHOG.', 'The void has come for this release');
  g.cameras.main.flash(400, 20, 0, 40);
  g.sfx('boss', 1);
}

export function drawSystems(g: GameScene, fx: Phaser.GameObjects.Graphics) {
  drawDrive(g, fx);
  const r = g.enemies.find((e) => e.reaper);
  if (r) {
    // Nohog's void: a black hole with a violet event horizon, and specks of the world spiralling in.
    const t = g.time.now, x = r.s.x, y = r.s.y, R = 30 + Math.sin(t / 220) * 2;
    fx.fillStyle(0x000000, 0.45).fillCircle(x, y, R).fillStyle(0x000000, 0.7).fillCircle(x, y, R * 0.65);
    fx.lineStyle(2, 0x8c3cf8, 0.75).strokeCircle(x, y, R).lineStyle(1, 0xd8b8f8, 0.5).strokeCircle(x, y, R + 3 + Math.sin(t / 90) * 1.5);
    for (let i = 0; i < 16; i++) {
      const f = 1 - ((t / 1100 + i / 16) % 1), a = i * 2.39 + f * 2.2;
      const d = R * 0.5 + f * 56;
      fx.fillStyle(i % 3 ? 0x8c3cf8 : 0xfcfcfc, 0.3 + 0.5 * (1 - f)).fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1);
    }
  }
}
