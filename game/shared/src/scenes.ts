// Screens every kit shares: Boot (loader with per-slot fallback), Title, HowTo and End.
import Phaser from 'phaser';
import { registerFont } from './font';
import { K, anim, makeSfx, beginRun, finishRun, runProps, TitleRow } from './kit';
import { meta } from './meta';
import { hooks } from './hooks';
import { capture } from './analytics';
import { lb } from './leaderboard';
import type { ScoresData } from './scores';
import { text, box, blink, fitScale, W, H, DW, DH, vy, NARROW, fitCam, viewRect, PixelText, CHAR_W, TOUCH as TOUCH_DEVICE, APP } from './ui';

/** Touch hints and buttons: a phone or tablet, and a kit that plays with touch. */
const touchUi = () => TOUCH_DEVICE && !!K.kit?.touch;

function enter(scene: Phaser.Scene, name: string, state: string) {
  hooks.scene = name;
  hooks.state = state;
}

/** Press any of `codes` once (ignores keys held from the previous screen). */
export function onKeys(scene: Phaser.Scene, codes: string[], fn: (code: string) => void, armMs = 250) {
  let armed = false;
  scene.time.delayedCall(armMs, () => (armed = true));
  const h = (e: KeyboardEvent) => {
    if (!armed || e.repeat || !codes.includes(e.code)) return;
    fn(e.code);
  };
  scene.input.keyboard!.on('keydown', h);
  scene.events.once('shutdown', () => scene.input.keyboard?.off('keydown', h));
}

/** Tap (touch or click) once the screen has been up for `armMs`; `fn` gets the game-space point. */
export function onTap(scene: Phaser.Scene, fn: (x: number, y: number) => void, armMs = 250) {
  let armed = false;
  scene.time.delayedCall(armMs, () => (armed = true));
  // In world space (the camera is zoomed to the screen's resolution).
  const h = (p: Phaser.Input.Pointer) => {
    if (!armed) return;
    const wp = scene.cameras.main.getWorldPoint(p.x, p.y);
    fn(wp.x, wp.y);
  };
  scene.input.on('pointerup', h);
  scene.events.once('shutdown', () => scene.input.off('pointerup', h));
}

/** A tap target: at least TAP game pixels tall on touch screens (~40 CSS px on a phone), so a thumb can hit it. */
export const TAP = 24;
export interface Rect { x: number; y: number; w: number; h: number }
export const inside = (r: Rect, x: number, y: number, pad = 2) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

/** A framed touch button with a centred label. `on` highlights it (the current choice), `dim` greys it out (locked). */
export function button(scene: Phaser.Scene, r: Rect, label: string,
  o: { on?: boolean; dim?: boolean; color?: number; scale?: number; depth?: number; fixed?: boolean } = {}) {
  const ui = K.ui, sc = o.scale ?? 1, depth = o.depth ?? 10;
  const g = box(scene, r.x, r.y, r.w, r.h, o.on ? ui.panelInt : ui.bgInt, o.on ? ui.accentInt : ui.textInt, o.on ? ui.accentInt : ui.panelInt)
    .setDepth(depth);
  if (o.fixed) g.setScrollFactor(0);
  const t = text(scene, r.x + r.w / 2, r.y + Math.round((r.h - 7 * sc) / 2), label, { align: 'center', scale: sc, depth: depth + 1,
    color: o.color ?? ui.textInt, maxWidth: r.w - 4, maxLines: 1, fixed: o.fixed }); // on: light text on the brand fill
  if (o.dim) { g.setAlpha(0.35); t.setAlpha(0.35); }
  return [g, t] as Phaser.GameObjects.GameObject[];
}

/** A menu screen: its camera fits the live view; when the view changes (a phone rotating) the screen lays itself out
 * again, by default by restarting. */
export function screen(scene: Phaser.Scene, relayout: () => void = () => scene.scene.restart()) {
  fitCam(scene, scene.cameras.main);
  scene.scale.on('resize', relayout);
  scene.events.once('shutdown', () => scene.scale.off('resize', relayout));
}

/** Touch devices: go fullscreen on the first tap where the browser allows it (not iPhone Safari). */
function tryFullscreen(scene: Phaser.Scene) {
  if (APP || !touchUi() || scene.scale.isFullscreen || !scene.scale.fullscreen.available) return;
  try { scene.scale.startFullscreen(); } catch { /* not allowed here */ }
}

export function startMusic(scene: Phaser.Scene) {
  if (!scene.cache.audio.exists('music')) return;
  const existing = scene.sound.get('music');
  if (existing?.isPlaying) return;
  (existing ?? scene.sound.add('music', { loop: true, volume: 0.35 })).play();
}

/** Drifting pixel stars in brand colours; a cheap, on-theme backdrop for menu screens. */
export function starfield(scene: Phaser.Scene, n = 60) {
  // Spread over the whole live view, at the same density whatever its size.
  const cols = [K.ui.textInt, K.ui.dimInt, K.ui.accentInt, K.ui.panelInt];
  const cam = scene.cameras.main;
  let v = viewRect(cam);
  n = Math.round((n * v.w * v.h) / (DW * DH));
  const stars = Array.from({ length: n }, (_, i) => {
    const s = scene.add.rectangle(v.x + Phaser.Math.Between(0, v.w), v.y + Phaser.Math.Between(0, v.h), 1, 1, cols[i % cols.length])
      .setOrigin(0).setAlpha(Phaser.Math.FloatBetween(0.3, 1));
    return { s, v: Phaser.Math.FloatBetween(4, 18) };
  });
  const reseed = () => {
    v = viewRect(cam);
    stars.forEach(({ s }) => s.setPosition(v.x + Phaser.Math.Between(0, v.w), v.y + Phaser.Math.Between(0, v.h)));
  };
  scene.scale.on('resize', reseed);
  scene.events.once('shutdown', () => scene.scale.off('resize', reseed));
  scene.events.on('update', (_t: number, dt: number) => {
    for (const st of stars) {
      st.s.x -= (st.v * dt) / 1000;
      if (st.s.x < v.x) { st.s.x = v.x + v.w; st.s.y = v.y + Phaser.Math.Between(0, v.h); }
    }
  });
}

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    enter(this, 'Boot', 'boot');
    screen(this, () => {});
    registerFont(this);
    const ui = K.ui;
    const g = this.add.graphics();
    this.load.on('progress', (p: number) => {
      g.clear().fillStyle(ui.textInt).fillRect(W / 2 - 61, H / 2 - 4, 122, 8)
        .fillStyle(ui.bgInt).fillRect(W / 2 - 60, H / 2 - 3, 120, 6)
        .fillStyle(ui.accentInt).fillRect(W / 2 - 60, H / 2 - 3, Math.round(120 * p), 6);
    });
    const themed = K.manifest.sprites ?? {};
    for (const s of K.kit.slots) {
      if (!s.optional) this.load.spritesheet(`d:${s.id}`, `assets/default/${s.id}.png`, { frameWidth: s.w, frameHeight: s.h });
      if (themed[s.id]) this.load.spritesheet(`t:${s.id}`, themed[s.id], { frameWidth: s.w, frameHeight: s.h });
    }
    K.kit.preload?.(this);
    const musicUrl = K.manifest.music || 'assets/default/music.ogg';
    this.load.audio('music', musicUrl);
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      hooks.fallbacks.push(`${file.key}: failed to load ${file.url}`);
      if (file.key === 'music' && K.manifest.music) {
        K.manifest.music = null;
        this.load.audio('music', 'assets/default/music.ogg');
      }
    });
  }

  create() {
    makeSfx(this);
    for (const s of K.kit.slots) {
      const t = `t:${s.id}`;
      let key = `d:${s.id}`;
      if (s.optional && !this.textures.exists(t)) continue; // an optional slot the game doesn't have (no logo)
      if (this.textures.exists(t)) {
        const img = this.textures.get(t).getSourceImage() as HTMLImageElement;
        if (img.width === s.w * s.frames && img.height === s.h) key = t;
        else hooks.fallbacks.push(`${s.id}: themed sprite is ${img.width}x${img.height}, expected ${s.w * s.frames}x${s.h}`);
      }
      K.sprites[s.id] = key;
      if (s.frames > 1 && !this.anims.exists(anim(s.id))) {
        this.anims.create({ key: anim(s.id), frames: this.anims.generateFrameNumbers(key, { start: 0, end: s.frames - 1 }),
          frameRate: s.fps ?? 6, repeat: -1 });
      }
    }
    hooks.ready = true;
    this.scene.launch('Overlay');
    this.scene.start('Splash');
  }
}

/** The splash screen, between loading and the title: the prospect's pixel logo with "powered by PostHog" under it
 * when the game has one (the optional `logo` slot), else the 8-bit PostHog logo. About 2 s; a key or tap skips it. */
export class SplashScene extends Phaser.Scene {
  constructor() { super('Splash'); }

  create() {
    enter(this, 'Splash', 'splash');
    screen(this, () => {});
    const ui = K.ui;
    const custom = this.textures.exists('t:logo');
    this.cameras.main.setBackgroundColor(custom ? ui.bg : '#000000');
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (custom) {
      // The prospect's logo (128x48, padded), as big as fits in whole pixels, with the small PostHog credit under it.
      const s = Math.max(1, Math.floor(Math.min((W * 0.8) / 128, (H * 0.45) / 48)));
      const cy = Math.round(H / 2 - 10);
      parts.push(this.add.image(W / 2, cy, 't:logo').setScale(s));
      const y = cy + 24 * s + 12;
      const label = 'powered by', w = label.length * CHAR_W + 4 + 15 + 4 + 7 * CHAR_W;
      let x = Math.round(W / 2 - w / 2);
      parts.push(text(this, x, y, label, { color: ui.dimInt }));
      x += label.length * CHAR_W + 4;
      parts.push(this.add.image(x, y - 1, K.sprites.posthog_mark ?? 'd:posthog_mark').setOrigin(0, 0));
      x += 15 + 4;
      parts.push(text(this, x, y, 'PostHog', { color: ui.textInt }));
    } else {
      // The 8-bit PostHog lockup: the logomark, and the wordmark sitting on its baseline (the g hangs below).
      const s = W >= 400 ? 3 : 2;
      const w = (39 + 7 + 66) * s, x0 = Math.round(W / 2 - w / 2), y0 = Math.round(H / 2 - (21 * s) / 2);
      const mark = this.add.image(x0, y0, K.sprites.posthog_logo ?? 'd:posthog_logo').setOrigin(0, 0).setScale(s);
      const word = this.add.image(x0 + (39 + 7) * s, y0 + (21 - 12) * s, K.sprites.posthog_wordmark ?? 'd:posthog_wordmark').setOrigin(0, 0).setScale(s);
      parts.push(mark, word);
      // A little hop, like the logo in the PostHog app.
      this.tweens.add({ targets: mark, y: y0 - 4 * s, duration: 180, delay: 450, yoyo: true, ease: 'Quad.Out' });
    }
    parts.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0));
    this.tweens.add({ targets: parts, alpha: 1, duration: 280 });
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      this.tweens.add({ targets: parts, alpha: 0, duration: 220, onComplete: () => this.scene.start('Title') });
    };
    this.time.delayedCall(1900, go);
    onKeys(this, ['Enter', 'Space', 'NumpadEnter', 'Escape'], go, 200);
    onTap(this, go, 200);
  }
}

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    enter(this, 'Title', 'title');
    screen(this);
    const { theme, ui } = K;
    this.cameras.main.setBackgroundColor(ui.bg);
    starfield(this);
    K.kit.titleArt?.(this);
    // Title: as big as fits on one line, else two lines at x2.
    // Laid out for a DH-tall screen; a taller one spreads it: title high, art in the middle, choices at the bottom.
    const sc = fitScale(theme.title, W - 40, 3);
    const t = text(this, W / 2, vy(34, 0.2), theme.title, { scale: sc === 1 ? 2 : sc, align: 'center', color: ui.accentInt,
      maxWidth: W - 40, maxLines: 2, shadow: ui.panelInt, depth: 10 });
    text(this, W / 2, t.y + t.textHeight + 8, theme.tagline, { align: 'center', color: ui.textInt,
      maxWidth: W - 60, maxLines: 2, depth: 10 });
    const rows = titleRows();
    if (!touchUi()) {
      const press = text(this, W / 2, vy(rows.length ? 204 : 214, 1), 'PRESS ENTER', { scale: 2, align: 'center', color: ui.textInt, depth: 10 });
      blink(this, press, 500);
      text(this, W / 2, H - 14, rows.length ? 'Arrows/wheel choose   Enter or double-click start   M mute' : 'Arrows/WASD move   Enter select   M mute',
        { align: 'center', color: ui.dimInt, depth: 10 });
    }
    // Returning players see their record; a first visit shows nothing extra.
    const m = meta.data;
    if (m.runs > 0) {
      const ach = meta.achievementCount();
      const parts = [`BEST ${m.bestScore}`, `RUNS ${m.runs}`, `WINS ${m.wins}`];
      if (ach) parts.push(`ACHIEVEMENTS ${ach}`);
      text(this, W / 2, 5, parts.join('   '), { align: 'center', color: ui.dimInt, depth: 10, maxWidth: W - 8, maxLines: 2 });
    }
    const menu = touchUi() ? titleButtons(this, rows) : titleMenu(this, rows, vy(rows.length > 1 ? 229 : 234, 1));
    const go = () => {
      K.play('select');
      startMusic(this);
      beginRun(menu.pick());
      this.scene.start('HowTo');
    };
    onKeys(this, ['Enter', 'Space', 'NumpadEnter'], go, 150);
    // Touch: tap a choice to select it, tap it again or START to start; a tap anywhere else does nothing.
    // Mouse: click a choice to select it, click it again (double-click) or click off the choices to start.
    onTap(this, (x, y) => {
      startMusic(this);
      const hit = menu.tap(x, y);
      if (hit === 'start' || (!hit && !touchUi())) { tryFullscreen(this); go(); }
    }, 150);
    this.input.keyboard!.once('keydown', () => startMusic(this));
  }
}

export class HowToScene extends Phaser.Scene {
  constructor() { super('HowTo'); }

  create() {
    enter(this, 'HowTo', 'howto');
    screen(this);
    const { theme, ui } = K;
    this.cameras.main.setBackgroundColor(ui.bg);
    starfield(this, 30);
    const narrow = NARROW(), mx = narrow ? 8 : 24, tx = narrow ? 18 : 44;
    box(this, mx, 16, W - mx * 2, H - 32, ui.bgInt, ui.textInt, ui.panelInt);
    const top = vy(28, 0.2);
    text(this, W / 2, top, 'HOW TO PLAY', { scale: 2, align: 'center', color: ui.accentInt });
    const lines = K.kit.howTo(theme);
    let y = top + 28;
    for (const l of lines) {
      const t = text(this, tx, y, l, { maxWidth: W - tx * 2, maxLines: narrow ? 8 : 3, color: ui.textInt });
      y += t.lineCount * 10 + 6;
      if (y > H - 50) break;
    }
    const press = text(this, W / 2, H - 38, touchUi() ? 'TAP TO START' : 'PRESS ENTER TO START', { align: 'center', color: ui.accentInt });
    blink(this, press, 500);
    const start = () => {
      K.play('select');
      startMusic(this);
      capture('game_started', runProps());
      this.scene.start(K.kit.gameScene);
    };
    onKeys(this, ['Enter', 'Space', 'NumpadEnter'], start);
    onTap(this, start, 300);
    onKeys(this, ['Escape'], () => this.scene.start('Title'));
  }
}

export interface EndData {
  won: boolean;
  score: number;
  headline?: string;
  stats?: [string, string | number][];
  props?: Record<string, unknown>; // extra analytics properties
  /** Set when the screen is laid out again after a resize: the run is already recorded. */
  res?: ReturnType<typeof finishRun>;
}

export class EndScene extends Phaser.Scene {
  constructor() { super('End'); }

  create(d: EndData) {
    enter(this, 'End', d.won ? 'win' : 'lose');
    hooks.score = d.score;
    const { theme, ui } = K;
    const firstShow = !d.res;
    const res = d.res ?? finishRun({ won: d.won, score: d.score, stats: d.props });
    screen(this, () => this.scene.restart({ ...d, res })); // a rotate lays it out again without recording the run twice
    if (firstShow) {
      capture('game_finished', { outcome: d.won ? 'win' : 'lose', score: d.score, duration: Math.round(hooks.elapsed), ...runProps(),
        new_best: res.newBest, ...d.props });
      K.play(d.won ? 'win' : 'lose');
    }
    this.cameras.main.setBackgroundColor(ui.bg);
    starfield(this, d.won ? 80 : 20);
    const head = d.headline ?? (d.won ? 'VICTORY!' : 'GAME OVER');
    const narrow = NARROW(), off = Math.round((H - DH) * 0.3); // a taller screen: the whole block sits lower
    text(this, W / 2, 22 + off, head, { scale: fitScale(head, W - 20, 3), align: 'center', color: d.won ? ui.accentInt : 0xf83800, shadow: ui.panelInt });
    text(this, W / 2, 62 + off, d.won ? theme.text.win : theme.text.lose, { align: 'center', maxWidth: W - (narrow ? 24 : 60), maxLines: 3, color: ui.textInt });
    const sc = text(this, W / 2, 100 + off, `SCORE ${d.score}`, { scale: 2, align: 'center', color: ui.accentInt });
    // Best score beside the score; a narrow screen has no room there, so it goes underneath.
    const rx = narrow ? W / 2 : W / 2 + Math.ceil(sc.textWidth / 2) + 10, ry = narrow ? 122 + off : 104 + off;
    const bo = { color: ui.accentInt, align: narrow ? 'center' as const : 'left' as const };
    let y = 128 + off;
    if (res.newBest && res.prevBest > 0) {
      blink(this, text(this, rx, ry, 'NEW BEST!', bo), 300);
      if (narrow) y += 12;
    } else if (meta.data.bestScore > d.score) {
      text(this, rx, ry, `BEST ${meta.data.bestScore}`, { ...bo, color: ui.dimInt });
      if (narrow) y += 12;
    }
    for (const [k, v] of d.stats ?? []) {
      text(this, W / 2 - 8, y, k, { align: 'right', color: ui.dimInt });
      text(this, W / 2 + 8, y, String(v), { color: ui.textInt });
      y += 12;
    }
    // Extra lines: the kit's summary, then new heat level and achievements from this run.
    const extra: string[] = [];
    try { extra.push(...(K.kit.endSummary?.(d, res) ?? []).filter((l) => typeof l === 'string')); } catch (e) { console.warn(e); }
    if (res.heatUnlocked !== null && K.run.choices.heat !== undefined) extra.push(`HEAT ${res.heatUnlocked} UNLOCKED`);
    const fresh = meta.achievements().filter((a) => a.got && (meta.data.achievements[a.id] ?? 0) >= K.run.startedAt);
    if (fresh.length) extra.push(`NEW: ${fresh.map((a) => a.name).join(', ')}`);
    y += extra.length ? 4 : 0;
    for (const l of extra) {
      if (y > H - 96) break; // above the buttons
      const t = text(this, W / 2, y, l, { align: 'center', color: ui.accentInt, maxWidth: W - (narrow ? 24 : 60), maxLines: narrow ? 2 : 1 });
      y += t.lineCount * 10 + 1;
    }

    text(this, W / 2, H - 22, theme.text.credits, { align: 'center', maxWidth: W - 40, maxLines: 2, color: ui.dimInt });
    const again = () => {
      beginRun();
      capture('game_started', { replay: true, ...runProps() });
      this.scene.start(K.kit.gameScene);
    };
    onKeys(this, ['Enter', 'Space', 'NumpadEnter', 'KeyR'], again, 800);
    onKeys(this, ['Escape'], () => this.scene.start('Title'), 800);
    {
      // Buttons above the credits (keys: ENTER and ESC; S for scores); a stray tap does nothing. With leaderboards, a
      // SCORES button in the middle turns into NEW HIGH SCORE when the run made the board.
      const board = lb.enabled(), n = board ? 3 : 2, gap = 6, by = H - 60 - TAP;
      const bw = Math.min(n === 3 ? 124 : 150, Math.floor((W - 16 - gap * (n - 1)) / n)), x0 = Math.round(W / 2 - (n * bw + (n - 1) * gap) / 2);
      const r = (i: number): Rect => ({ x: x0 + i * (bw + gap), y: by, w: bw, h: TAP + 4 });
      const more = r(0), scores = r(1), title = r(n - 1);
      const keys = !touchUi();
      button(this, more, keys ? 'ENTER  ONE MORE RUN' : 'ONE MORE RUN', { color: ui.accentInt });
      button(this, title, keys ? 'ESC  TITLE' : 'TITLE');
      // Leaderboard: is this run on the board? (Once per run, even if the screen is laid out again.)
      const mode = lb.runMode();
      const entry: ScoresData['entry'] = { score: d.score, mode,
        stats: { time: Math.round(hooks.elapsed), ...safeStats(d) } };
      let made = entryFor === K.run.startedAt; // laid out again after a rotate: it already made the board
      let mid: Phaser.GameObjects.GameObject[] = [];
      const drawMid = () => {
        mid.forEach((o) => o.destroy());
        mid = button(this, scores, made ? 'NEW HIGH SCORE!' : keys ? 'S  SCORES' : 'SCORES', { color: made ? 0xf8d878 : undefined });
        if (made) blink(this, mid[1] as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject, 400);
      };
      const toScores = (first?: string) => this.scene.start('Scores', (made
        ? { from: 'end', mode, entry: { ...entry, first } } : { from: 'end', mode }) as ScoresData);
      if (board) {
        drawMid();
        if (d.score > 0 && !made) {
          lb.top(mode).then((top) => {
            if (!top || !this.scene.isActive() || !lb.qualifies(top, d.score)) return;
            made = true;
            entryFor = K.run.startedAt;
            drawMid();
          });
        }
        onKeys(this, ['KeyS'], () => { if (!made) toScores(); }, 800);
        // A letter key starts the initials on a run that made the board.
        const letter = (e: KeyboardEvent) => { if (made && /^Key[A-Z]$/.test(e.code) && !e.repeat) toScores(e.code.slice(3)); };
        window.addEventListener('keydown', letter);
        this.events.once('shutdown', () => window.removeEventListener('keydown', letter));
      }
      onTap(this, (x, y) => {
        if (inside(more, x, y)) again();
        else if (inside(title, x, y)) this.scene.start('Title');
        else if (board && inside(scores, x, y)) toScores();
      }, 800);
    }
  }
}

/** The run whose leaderboard entry was offered (so it's offered once, even if the End screen is laid out again). */
let entryFor = -1;

/** The kit's leaderboard stats for this run; a broken kit hook just means no extra stats. */
function safeStats(d: EndData): Record<string, number | string> {
  try { return K.kit.leaderboard?.stats?.(d) ?? {}; } catch { return {}; }
}

// ---------------------------------------------------------------- title menu

/** Session memory of title picks (not persisted: a fresh visit always defaults to the first choice). */
const lastPick: Record<string, number> = {};

function titleRows(): TitleRow[] {
  let raw: unknown;
  try { raw = K.kit.titleMenu?.(); } catch (e) { console.warn('[titleMenu]', e); return []; }
  if (!Array.isArray(raw) || !raw.length) return [];
  const rows: TitleRow[] = (raw[0] && Array.isArray((raw[0] as TitleRow).choices)) ? raw as TitleRow[] : [{ key: 'mode', choices: raw as any }];
  return rows.map((r) => ({ key: String(r.key || 'mode'), label: r.label,
    choices: (r.choices || []).filter((c) => c && c.label !== undefined).slice(0, 8) }))
    .filter((r) => r.choices.length).slice(0, 2);
}

/** Draw rows of choices; LEFT/RIGHT change, UP/DOWN switch rows, or tap a choice. Returns `pick` (a getter for
 * {key: value}) and `tap(x, y)` (true if the tap landed on a choice and selected it). */
function titleMenu(scene: Phaser.Scene, rows: TitleRow[], y0: number) {
  const ui = K.ui;
  const firstOpen = (r: TitleRow) => Math.max(0, r.choices.findIndex((c) => !c.locked));
  const sel = rows.map((r) => {
    const i = lastPick[r.key];
    return i !== undefined && r.choices[i] && !r.choices[i].locked ? i : firstOpen(r);
  });
  let row = 0, clicked = '';
  let drawn: PixelText[] = [];
  let cellsAt: { ri: number; ci: number; x0: number; x1: number; y: number }[] = [];
  const draw = () => {
    drawn.forEach((t) => t.destroy());
    drawn = [];
    cellsAt = [];
    rows.forEach((r, ri) => {
      const cells: [string, number, number][] = [];
      if (r.label) cells.push([r.label.slice(0, 10).toUpperCase(), ui.dimInt, 1]);
      r.choices.forEach((c, ci) => {
        const lab = String(c.label).slice(0, 10);
        const on = ci === sel[ri];
        const active = on && (ri === row || rows.length === 1);
        cells.push([on ? `<${lab}>` : ` ${lab} `, on ? (active ? ui.accentInt : ui.textInt) : ui.dimInt, c.locked ? 0.35 : 1]);
      });
      const total = cells.reduce((n, [s]) => n + s.length, 0) + (cells.length - 1);
      let x = Math.round(W / 2 - (total * CHAR_W) / 2);
      const off = r.label ? 1 : 0;
      cells.forEach(([s, col, alpha], k) => {
        drawn.push(text(scene, x, y0 + ri * 11, s, { color: col, depth: 10 }).setAlpha(alpha));
        if (k >= off) cellsAt.push({ ri, ci: k - off, x0: x - 3, x1: x + s.length * CHAR_W + 3, y: y0 + ri * 11 + 3 });
        x += (s.length + 1) * CHAR_W;
      });
    });
  };
  const move = (d: number) => {
    const r = rows[row];
    for (let i = 1; i <= r.choices.length; i++) {
      const j = (sel[row] + d * i + r.choices.length * 8) % r.choices.length;
      if (!r.choices[j].locked) { sel[row] = j; break; }
    }
    lastPick[r.key] = sel[row];
    K.play('move', 0.5);
    draw();
  };
  if (rows.length) {
    draw();
    onKeys(scene, ['ArrowLeft', 'KeyA'], () => move(-1), 150);
    onKeys(scene, ['ArrowRight', 'KeyD'], () => move(1), 150);
    onKeys(scene, ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'], () => { row = (row + 1) % rows.length; draw(); }, 150);
  }
  const pick = () => {
    const out: Record<string, string | number> = {};
    rows.forEach((r, i) => { out[r.key] = r.choices[sel[i]].value; });
    return out;
  };
  const tap = (x: number, y: number): 'choice' | 'start' | null => {
    const c = cellsAt.find((k) => x >= k.x0 && x <= k.x1 && Math.abs(y - k.y) <= 7);
    if (!c) return null;
    if (rows[c.ri].choices[c.ci].locked) return 'choice';
    const again = clicked === `${c.ri}:${c.ci}` && sel[c.ri] === c.ci; // a second click on it (a double-click) starts
    clicked = `${c.ri}:${c.ci}`;
    if (again) return 'start';
    row = c.ri; sel[c.ri] = c.ci; lastPick[rows[c.ri].key] = c.ci; K.play('move', 0.5); draw();
    return 'choice';
  };
  // The mouse wheel changes the choice on the active row.
  if (rows.length) {
    const wheel = (_p: unknown, _o: unknown, _dx: number, dy: number) => { if (dy) move(dy > 0 ? 1 : -1); };
    scene.input.on('wheel', wheel);
    scene.events.once('shutdown', () => scene.input.off('wheel', wheel));
  }
  return { pick, tap };
}

/** Touch title menu: each row of choices as buttons (the row's label in front), and a big START button: beside the
 * rows on a wide screen, under them on a narrow one. Pinned to the bottom of the screen. */
function titleButtons(scene: Phaser.Scene, rows: TitleRow[]) {
  const firstOpen = (r: TitleRow) => Math.max(0, r.choices.findIndex((c) => !c.locked));
  const sel = rows.map((r) => {
    const i = lastPick[r.key];
    return i !== undefined && r.choices[i] && !r.choices[i].locked ? i : firstOpen(r);
  });
  const narrow = NARROW(), gap = 4, rowGap = 6, bh = TAP + 2;
  const rowsH = rows.length ? rows.length * bh + (rows.length - 1) * rowGap : 0;
  const startW = narrow || !rows.length ? Math.min(220, W - 16) : 96, startH = narrow || !rows.length ? 32 : Math.max(32, rowsH);
  const rowsW = narrow ? W - 16 : Math.min(W - 16 - startW - 10, 360);
  const layout = rows.map((r) => {
    const labelW = r.label ? r.label.slice(0, 10).length * CHAR_W + 8 : 0, n = r.choices.length;
    const bw = Math.min(64, Math.floor((rowsW - labelW - gap * (n - 1)) / n));
    return { labelW, bw, w: labelW + n * bw + gap * (n - 1) };
  });
  const blockW = narrow || !rows.length ? Math.max(startW, ...layout.map((l) => l.w)) : Math.max(0, ...layout.map((l) => l.w)) + 10 + startW;
  const bottom = H - 10;
  const rowsTop = narrow || !rows.length ? bottom - startH - 10 - rowsH : bottom - rowsH;
  const start: Rect = narrow || !rows.length
    ? { x: Math.round(W / 2 - startW / 2), y: bottom - startH, w: startW, h: startH }
    : { x: Math.round(W / 2 + blockW / 2 - startW), y: bottom - startH, w: startW, h: startH };
  const cells: (Rect & { ri: number; ci: number })[] = [];
  let drawn: Phaser.GameObjects.GameObject[] = [], clicked = '';
  const draw = () => {
    drawn.forEach((o) => o.destroy());
    drawn = [];
    cells.length = 0;
    rows.forEach((r, ri) => {
      const L = layout[ri];
      const rowX = narrow || !rows.length ? Math.round(W / 2 - L.w / 2) : Math.round(W / 2 - blockW / 2);
      const y = rowsTop + ri * (bh + rowGap);
      if (r.label) drawn.push(text(scene, rowX, y + Math.round((bh - 7) / 2), r.label.slice(0, 10).toUpperCase(), { color: K.ui.dimInt, depth: 10 }));
      r.choices.forEach((c, ci) => {
        const rect = { x: rowX + L.labelW + ci * (L.bw + gap), y, w: L.bw, h: bh };
        drawn.push(...button(scene, rect, String(c.label).slice(0, 10), { on: ci === sel[ri], dim: !!c.locked }));
        cells.push({ ...rect, ri, ci });
      });
    });
    drawn.push(...button(scene, start, 'START', { scale: fitScale('START', start.w - 8, 2), color: K.ui.accentInt }));
  };
  draw();
  const pick = () => {
    const out: Record<string, string | number> = {};
    rows.forEach((r, i) => { out[r.key] = r.choices[sel[i]].value; });
    return out;
  };
  const tap = (x: number, y: number): 'choice' | 'start' | null => {
    if (inside(start, x, y)) return 'start';
    const c = cells.find((k) => inside(k, x, y, 1));
    if (!c) return null;
    if (rows[c.ri].choices[c.ci].locked) return 'choice';
    const again = clicked === `${c.ri}:${c.ci}` && sel[c.ri] === c.ci; // tapping it again starts, like START
    clicked = `${c.ri}:${c.ci}`;
    if (again) return 'start';
    sel[c.ri] = c.ci; lastPick[rows[c.ri].key] = c.ci; K.play('move', 0.5); draw();
    return 'choice';
  };
  return { pick, tap };
}
