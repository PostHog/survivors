// Kit contract and boot: every kit calls startKit(kitDef). The engine loads theme/theme.json and
// theme/manifest.json (written per prospect by build-game), sanitises the theme against the kit's
// schema, and runs Boot -> Title -> HowTo -> kit scenes -> End. Nothing per prospect touches code.
import Phaser from 'phaser';
import { sanitize } from './schema';
import { deriveUi, snap, Ui } from './palette';
import { hooks, sharedDebug } from './hooks';
import { initAnalytics, capture } from './analytics';
import { Sfx, ZzfxParams } from './zzfx';
import { W, H, TOUCH, APP, PX, fitView } from './ui';
import { BootScene, SplashScene, TitleScene, HowToScene, EndScene, EndData } from './scenes';
import { meta, initMeta, achieve, dailySeed, randomSeed, AchievementDef, RunResult } from './meta';
import { OverlayScene, toast, burst, floatText, shake, hitstop } from './juice';
import { ScoresScene } from './scores';
import type { LbMode } from './leaderboard';

export interface Slot {
  id: string;
  w: number;
  h: number;
  frames: number;
  fps?: number;
  /** Art brief (sprite prompt) template with {theme.path} placeholders; absent = fixed kit art, never generated. */
  prompt?: string;
  kind?: string; // 'sprite' (default) or 'tile'
  /** No default art: only a game that installs one has it (the prospect's logo on the splash screen). */
  optional?: boolean;
  /** Art every kit shares (shared/sprites/<id>.sprite), e.g. the PostHog logo. */
  shared?: boolean;
}

export interface Manifest {
  slug?: string;
  sprites?: Record<string, string>; // slot id -> path of a generated/recoloured sprite
  music?: string | null;
  posthog?: { key?: string; host?: string } | null;
  draft?: boolean;
}

export interface KitDef {
  id: string;
  name: string;
  schema: any;
  defaultTheme: any;
  slots: Slot[];
  sfx: Record<string, ZzfxParams>;
  howTo: (theme: any) => string[];
  /** The kit plays with touch (drag/tap); shared screens then show tap hints on phones. */
  touch?: boolean;
  /** The view takes the screen's shape (ui.W/H are live and every screen lays out for them). Off: a fixed 480x270. */
  resizable?: boolean;
  /** Queue extra kit-fixed assets in the Boot scene's preload (sheets that aren't theme slots). */
  preload?: (scene: Phaser.Scene) => void;
  /** Draw kit art on the title screen (sprites, lineup). */
  titleArt?: (scene: Phaser.Scene) => void;
  /** Kit-specific fix-ups after schema sanitising (e.g. cross-field rules). */
  postSanitize?: (theme: any, issues: string[]) => void;
  scenes: Phaser.Types.Scenes.SceneType[];
  gameScene: string;
  /** Optional title-screen choices (LEFT/RIGHT to change, UP/DOWN between rows). Return a flat list for one
   * row (its values become K.run.mode) or rows with a `key` ('mode', 'heat' or anything -> K.run.choices[key]).
   * Enter always starts at once; untouched rows use their first unlocked choice. heatRow() builds a HEAT row. */
  titleMenu?: () => TitleChoice[] | TitleRow[];
  /** Optional extra End-screen lines (run stats, new unlocks). Keep them short: ~3 lines fit. */
  endSummary?: (data: EndData, result: RunResult) => string[];
  /** Achievement table; unlock with achieve(id) from '@shared/meta'. */
  achievements?: AchievementDef[];
  /** Opt in to online leaderboards (top 20 per mode, 3-letter initials; see leaderboard.ts). The End screen offers
   * initials entry when a run makes the board, and the 'Scores' scene shows the boards. */
  leaderboard?: {
    modes?: LbMode[];                                         // boards to show (default one: 'run')
    mode?: () => string;                                      // the board the current run counts for
    stats?: (d: EndData) => Record<string, number | string>;  // stats to keep with an entry (time is added)
    columns?: [string, string][];                             // stat columns on the board: [key, header]
  };
}

export interface TitleChoice { label: string; value: string | number; locked?: boolean }
export interface TitleRow { key: string; label?: string; choices: TitleChoice[] }

/** The current run's settings, chosen on the title (or defaults). Always set, even before the title. */
export interface Run {
  mode: string;          // value of the 'mode' row, else 'standard'
  heat: number;          // value of the 'heat' row, else 0
  seed: number;          // dailySeed() when mode is 'daily', else random per run
  daily: boolean;
  number: number;        // 1-based run count for this game on this browser
  choices: Record<string, string | number>; // every row's chosen value by key
  recorded?: boolean;    // meta.recordRun already called for this run
  startedAt: number;     // Date.now() at beginRun
}

/** Standard HEAT 0..max row; levels above meta.heatUnlocked() are locked. */
export function heatRow(max = 5, label = 'HEAT'): TitleRow {
  const top = meta.heatUnlocked();
  return { key: 'heat', label, choices: Array.from({ length: max + 1 }, (_, i) => ({ label: String(i), value: i, locked: i > top })) };
}

/** Start a new run with the given choices (or the previous run's): fresh seed, run number, analytics props. */
export function beginRun(choices: Record<string, string | number> = K.run.choices): Run {
  const mode = String(choices.mode ?? 'standard');
  const heat = Math.max(0, Math.min(5, Math.floor(Number(choices.heat) || 0)));
  const daily = mode === 'daily';
  K.run = { mode, heat, seed: daily ? dailySeed() : randomSeed(), daily, number: meta.data.runs + 1, choices: { ...choices },
    startedAt: Date.now() };
  hooks.run = K.run;
  return K.run;
}

/** Record the current run in meta once (EndScene calls this for you; call it earlier if the kit needs the
 * RunResult first, e.g. to bank coins or show unlocks). Later calls for the same run return the same result. */
export function finishRun(r: { won: boolean; score: number; stats?: Record<string, unknown> }): RunResult {
  if (K.run.recorded && K.lastResult) return K.lastResult;
  K.run.recorded = true;
  K.lastResult = meta.recordRun({ won: r.won, score: r.score, durationS: hooks.elapsed, heat: K.run.heat, mode: K.run.mode, stats: r.stats });
  return K.lastResult;
}

export const runProps = () => ({ run_number: K.run.number, heat: K.run.heat, mode: K.run.mode });

/** Everything the scenes need, set once at boot. */
export const K = {
  kit: null as unknown as KitDef,
  theme: null as any,
  ui: null as unknown as Ui,
  manifest: {} as Manifest,
  sfx: null as unknown as Sfx,
  /** slot id -> texture key actually in use (themed or default) */
  sprites: {} as Record<string, string>,
  lastResult: null as RunResult | null,
  run: { mode: 'standard', heat: 0, seed: 0, daily: false, number: 1, choices: {}, startedAt: 0 } as Run,
  /** play one ZzFX preset */
  play: (name: string, vol = 1, gap = 40) => K.sfx?.play(name, vol, gap),
};

export { meta, achieve };

export const spr = (id: string) => K.sprites[id] ?? `d:${id}`;
export const anim = (id: string) => `${id}-anim`;

async function getJson(url: string) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function hashPitch(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return 0.9 + ((Math.abs(h) % 1000) / 1000) * 0.2; // 0.9..1.1: each prospect's game sounds a bit different
}

export async function startKit(kit: KitDef) {
  hooks.kit = kit.id;
  K.kit = kit;
  const [raw, manifest] = await Promise.all([getJson('theme/theme.json'), getJson('theme/manifest.json')]);
  const issues: string[] = [];
  if (!raw) issues.push('theme.json missing or unreadable: using the default theme');
  const theme = sanitize(raw ?? kit.defaultTheme, kit.schema, kit.defaultTheme, '', issues);
  theme.palette = { primary: snap(theme.palette.primary), secondary: snap(theme.palette.secondary), accent: snap(theme.palette.accent) };
  kit.postSanitize?.(theme, issues);
  hooks.themeIssues.push(...issues);
  if (issues.length) console.warn('[theme] fixed fields:', issues);
  K.theme = theme;
  K.ui = deriveUi(theme.palette);
  K.manifest = manifest ?? {};
  // The public home page carries its own descriptive title for search results; every other game takes its title from its theme.
  if (!document.querySelector('[data-seo]')) document.title = theme.title;
  document.body.style.background = K.ui.bg;
  initAnalytics(K.manifest.posthog ?? undefined, K.manifest.slug ?? 'default', kit.id);
  initMeta(kit.id, K.manifest.slug ?? 'default', kit.achievements, (a) => toast(null, `ACHIEVEMENT: ${a.name}`));
  beginRun({});

  // Resizable kits: the view is the screen's shape at a whole number of device pixels per game pixel (crisp, full screen).
  // Fixed kits: desktop gets whole-number zoom for crisp pixels; phones fill the screen (a fractional zoom beats a tiny canvas).
  if (kit.resizable) fitView();
  const zoom = () => {
    if (kit.resizable) return 1 / (window.devicePixelRatio || 1); // the canvas is already device pixels
    const z = Math.min(window.innerWidth / W, window.innerHeight / H);
    return TOUCH ? Math.max(0.5, Math.floor(z * 8) / 8) : Math.max(1, Math.floor(z));
  };
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: Math.round(W * PX),
    height: Math.round(H * PX),
    zoom: zoom(),
    pixelArt: true,
    roundPixels: true,
    backgroundColor: K.ui.bg,
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER }, // #game flexbox centres the canvas; CENTER_BOTH would double the offset
    physics: { default: 'arcade', arcade: { debug: false } },
    // In the app, touches anywhere on screen reach the game (points off the canvas map outside 0..W/0..H).
    input: { keyboard: true, gamepad: false, ...(APP ? { touch: { target: 'game' } } : {}) },
    audio: { disableWebAudio: false },
    fps: { target: 60 },
    scene: [BootScene, SplashScene, TitleScene, HowToScene, ...kit.scenes, EndScene, ScoresScene, OverlayScene],
  });
  window.addEventListener('resize', () => {
    // Scenes follow a resize through the scale manager's 'resize' event (menus re-centre, the game re-anchors its HUD).
    if (kit.resizable && fitView()) game.scale.resize(Math.round(W * PX), Math.round(H * PX));
    game.scale.setZoom(zoom());
  });
  game.events.on('step', () => { hooks.fps = Math.round(game.loop.actualFps); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') {
      game.sound.mute = !game.sound.mute;
      K.sfx.muted = game.sound.mute;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  K.sfx = new Sfx(null, kit.sfx, hashPitch(theme.prospect.name));
  (window as any).__phaser = game;
  if (APP) appBridge(game);
  Object.assign(sharedDebug, {
    // The live KitDef, e.g. to try a titleMenu: __game.debug.kitDef().titleMenu = () => [...]; then debug.goto('Title').
    kitDef: () => K.kit,
    goto: (key: string) => { game.scene.getScenes(true).filter((s) => s.scene.key !== 'Overlay').forEach((s) => s.scene.stop());
      game.scene.start(key); },
    // Fire every juice effect in the top gameplay scene (screenshots, feel checks).
    juiceTest: () => {
      const sc = game.scene.getScenes(true).filter((s) => s.scene.key !== 'Overlay').pop();
      if (!sc) return;
      const cam = sc.cameras.main, x = cam.worldView.centerX, y = cam.worldView.centerY;
      burst(sc, x, y, K.ui.accentInt, 24, { colours: [K.ui.textInt] });
      floatText(sc, x, y - 16, '+123', K.ui.accentInt);
      shake(sc, 3, 150);
      hitstop(sc, 80);
      toast(sc, 'JUICE TEST');
    },
  });
  capture('game_opened', { referrer: document.referrer || null });
  return game;
}

/** Hooks the native app shell calls: the Android back button, and the app going to the background and back. */
function appBridge(game: Phaser.Game) {
  const key = (code: string, keyCode: number) => {
    for (const type of ['keydown', 'keyup']) {
      const e = new KeyboardEvent(type, { code, key: code, bubbles: true });
      Object.defineProperty(e, 'keyCode', { get: () => keyCode }); // Phaser's key table reads keyCode
      window.dispatchEvent(e);
    }
  };
  const playing = () => hooks.scene === 'Game' && ['playing', 'boss'].includes(hooks.state);
  Object.assign(window, {
    /** Back button: true when the game used it (ESC: pause, or back to the title); false on the title = leave the app. */
    __appBack: () => {
      if ((window as any).__overlayBack?.()) return true; // a page open over the game (Bug Survivors' guide) closes first
      if (hooks.scene === 'Title') return false;
      key('Escape', 27);
      return true;
    },
    __appPause: () => {
      if (playing()) key('Escape', 27); // leave the run paused, not running unseen
      (game as any).onHidden(); // stop the loop and suspend audio, as a hidden browser tab does
    },
    __appResume: () => (game as any).onVisible(),
  });
}

export function makeSfx(scene: Phaser.Scene) {
  const ctx = (scene.sound as Phaser.Sound.WebAudioSoundManager).context ?? null;
  const muted = K.sfx?.muted ?? false;
  K.sfx = new Sfx(ctx, K.kit.sfx, hashPitch(K.theme.prospect.name));
  K.sfx.muted = muted;
}
