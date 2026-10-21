// Bug Survivors: the survivors-like core loop. All prospect content comes from K.theme; this file is never edited per
// prospect. Content tables live in content.ts, weapons in weapons.ts + tools.ts, companions/powerup extras/unhinged
// events in systems.ts, hoggies in hoggies.ts, crests in crests.ts.
//
// The wave ladder: wave 1 is the original 3:30 run. Every boss is a release marker ("<boss> 2.0", "3.0"...); after it,
// CONTINUE or CASH OUT, then a Release pick (releases, new tools, v2.0 majors), then the next wave. Runs end by death
// or cash-out.
import Phaser from 'phaser';
import { K, spr, anim, finishRun } from '@shared/kit';
import { hooks, sharedDebug } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { rng, Rng, meta } from '@shared/meta';
import { shake, hitstop, hitstopped, burst, floatText, setJuiceSpeed , particleAlpha } from '@shared/juice';
import { TAP } from '@shared/scenes';
import { text, box, bar, clock, fitScale, PixelText, W, H, DW, DH, PX, TOUCH, NARROW, maxView, worldZoom, fitCam, camW, camH } from '@shared/ui';
import products from '../../shared/products.json';
import {
  ProductId, PassiveId, ArchId, EliteMod, EventId, Stats, baseStats, WEAPONS, PASSIVES, ARCH, SPAWN_TABLE, ELITE_MODS, ELITE_BASIC,
  ELITE_LATE, ELITES_AT, HAZARDS, EVENTS, EVENT_TIMES, EVENT_ORDER, BOSS_AT, MAX_LEVEL, MAX_PASSIVES, MAX_PASSIVES_LATE, SUPER,
  WeaponId, ToolId, TOOL_IDS, ACT2, ACT2_SPAWN, ACT2_ELITES, ACT2_EVENTS, LATE_BASE, LATE_TRICKS, LATE_ELITES, LATE_EVENTS, POWERUPS,
  POWER_IDS, PowerId, WAVES, WAVE, WaveMod, SCALE_MODS, WAVE_MOD_TEXT, REAPER_WAVE, BOSS_AFFIX, ZERO_DAY, AFFIX_TEXT, BossAffix,
  RELEASES, ReleaseId, RELICS, RELIC_IDS, RelicId, PAGES, PATCH_MUL, MAJOR, YOLO, YOLO_SNARK,
  applyMerch, merchExtra,
} from './content';
import { WState, newWeapon, WEAPON_FNS, drawWeapons, aura, resetVisuals, semver, OWN } from './weapons';
import { TOOL_FNS, drawTools, batchTag } from './tools';
import { Card, Build, drawCards, drawRelease, botRank, partnersOf } from './cards';
import { save, persist, today, currentHog, unlockHog, rollCapsule, earnCrest, hasCrest } from './save';
import { hogFrame, hogName, sigOf, perkOf, PERKS, SigDef, Trait, Perk, EVOLVING_FORMS, HOGS, isSignature, SIGNATURE } from './hoggies';
import { crestFrame, CREST_BY_ID } from './crests';
import { SysState, newSys, tickSystems, drawSystems, onLevelUpSys, startDriveBy, allHands, spawnReaper, selfDrivingPr, VOID } from './systems';

/** The arena: at least 1280x800, bigger when the view is (a phone in portrait), so the camera never sees past it.
 * Set per run in create(); touch screens size for both orientations so a mid-run rotate still fits. */
let WORLD_W = 1280;
let WORLD_H = 800;
const MAX_ENEMIES = 320;
const MAX_GEMS = 350;
const MAX_ITEMS = 44;
const HEAL_AMOUNT = 25;
/** A snack heals this share of max HP (at least HEAL_AMOUNT), so snacks stay worth grabbing as max HP grows. */
const HEAL_FRAC = 0.2;
/** Bugs on screen above which damage numbers show only crits and big hits. */
const CROWD = 60;
/** Seconds a newly picked weapon's effects stay at full brightness. */
const SPOTLIGHT = 12;
/** HUD, banners and modals sit above the shared juice layer (particles + float text at depth 1000). */
const UI = 1100;
/** Kit-fixed brand sheets (main.ts preload). */
export const HOG32 = 'kit:hog32', HOG64 = 'kit:hog64', CREST16 = 'kit:crest16', CREST64 = 'kit:crest64';

/** "Legacy Monolith" -> "the Legacy Monolith"; "The Churn Beetle" stays as is. */
export const theName = (n: string) => (/^the\s/i.test(n) ? n : `the ${n}`);
export const productName = (id: string) =>
  (WEAPONS as Record<string, { name?: string }>)[id]?.name ?? (products as Record<string, { name: string }>)[id]?.name ?? id;
const productLine = (id: string) => (WEAPONS as Record<string, { line?: string }>)[id]?.line ||
  K.theme.game.product_lines?.[id] || (products as Record<string, { line: string }>)[id]?.line || '';
const isTool = (id: string) => (TOOL_IDS as string[]).includes(id);
/** The boss's name at a version: "Legacy Monolith", "Legacy Monolith 2.0"... */
export const bossTitle = (v = 1) => `${K.theme.game.boss.name}${v >= 2 ? ` ${v}.0` : ''}`;
const bugName = (i: number) => K.theme.game.enemies[i]?.name ?? 'Bug';
const AI_SRC = new Set(['posthog_ai', 'ai_observability', 'desktop']);

const DIFF = {
  easy: { hp: 0.65, dmg: 0.55, spawn: 0.7, boss: 0.6, regen: 0.6 },
  normal: { hp: 1, dmg: 1, spawn: 1, boss: 1, regen: 0.25 },
  hard: { hp: 1.35, dmg: 1.3, spawn: 1.3, boss: 1.4, regen: 0 },
};

/** End-screen lines for the last finished run (main.ts endSummary reads them). */
export const lastRun = { lines: [] as string[] };

export interface Enemy {
  s: Phaser.GameObjects.Sprite;
  arch: ArchId;
  type: number;                // theme enemy index (sprite/name); 3 = boss
  hp: number; maxHp: number; speed: number; dmg: number; xp: number; r: number;
  kx: number; ky: number;      // knockback velocity
  flash: number;               // ms of hit flash left
  slow: number;                // slow factor this frame (1 = none)
  hitAt: Record<string, number>;
  alive: boolean;
  boss?: boolean;
  elite: EliteMod | null;
  mod2?: EliteMod | null;      // a second elite modifier (wave 4+)
  mode: number;                // behaviour state (0 walk, 1 telegraph, 2 dash, 3 fuse)
  t: number;                   // behaviour timer
  vx: number; vy: number;      // dash / stampede direction
  acc: number; accT: number; accCrit: boolean; // merged damage numbers
  armour: number; kb: number; tint: number | null;
  seed?: number;               // 0-1, fixed per spawn (Sampling picks its ghosts by it)
  batch?: number;              // damage tagged for the next Batch Export
  flagT?: number;              // flagged by a scout until
  link?: Enemy | null;         // race condition partner
  twin?: boolean;              // the boss's Race Condition fork
  reaper?: boolean;
  grow?: number;               // scope creep size
  base?: { hp: number; dmg: number; r: number; sc: number };
}

export interface Proj {
  s: Phaser.GameObjects.Image;
  vx: number; vy: number;
  dmg: number; life: number; pierce: number;
  homing?: Enemy | null;
  speed?: number;
  chain?: number;
  rt?: number; // homing retarget timer
  src: string;
  hit: Set<Enemy>;
  hostile?: boolean;
  boom?: number; // explodes on hit with this radius (MRR v2.0)
}

type ItemKind = 'food' | 'coin' | 'vacuum' | 'hotfix' | 'chest' | 'relic' | 'page' | PowerId;
const isPower = (k: string): k is PowerId => (POWER_IDS as string[]).includes(k);
interface Item { s: Phaser.GameObjects.Image; kind: ItemKind; pull: boolean; big?: boolean; data?: string | number }
interface Gem { s: Phaser.GameObjects.Image; v: number; pull: boolean; t: number }

interface Rect { x: number; y: number; w: number; h: number }
/** What a modal keeps when it is laid out again after a resize. */
interface Keep { sel: number; armed: boolean; at?: number }
interface Modal {
  kind: 'levelup' | 'chest' | 'act' | 'release' | 'cmdk' | 'reveal'; objs: Phaser.GameObjects.GameObject[]; armed: boolean; cards: Card[]; sel: number;
  at?: number;
  clicked?: number;                           // the card clicked last: clicking it again (a double-click) picks it
  rects?: Rect[];                             // the cards / choices, as drawn (taps and the selection frame use them)
  btns?: (Rect & { act: () => void })[];      // buttons under them
  rebuild?: (keep: Keep) => void;             // lay the modal out again for a new screen size
}
const inRect = (r: Rect, x: number, y: number, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

/** Modals are laid out for a DH-tall view; this drops them to the middle of a taller one (portrait). */
const MY = () => Math.floor((H - DH) / 2);

/** A full-view tint or dimmer: resized, not moved, when the view changes. */
function isFill(o: Phaser.GameObjects.GameObject) { return o.name === 'fill'; }

export class GameScene extends Phaser.Scene {
  player!: Phaser.GameObjects.Sprite;
  hog = 'im-the-driver';
  sig: SigDef | null = null;
  trait: Trait = 'none';
  perk: Perk | null = null;
  st: Stats = baseStats();
  hp = 100;
  invuln = 0;
  facing = new Phaser.Math.Vector2(1, 0);
  moving = false;
  vel = new Phaser.Math.Vector2(0, 0); // icy floor momentum
  enemies: Enemy[] = [];
  pool: Enemy[] = [];
  projs: Proj[] = [];
  gems: Gem[] = [];
  items: Item[] = [];
  grid = new Map<number, Enemy[]>();
  weapons = new Map<WeaponId, WState>();
  passives = new Map<PassiveId, number>();
  ppatch = new Map<PassiveId, number>();
  banished = new Set<string>();
  releases = new Map<ReleaseId, number>();
  relics = new Set<RelicId>();
  merch: Record<string, number> = {}; // store merch owned (worn) this run
  level = 1;
  xp = 0;
  xpNext = 5;
  kills = 0;
  gold = 0;          // gold picked up this run
  goldSafe = 0;      // merged gold (kept on death); the rest is at risk from wave 2
  goldGrabbed = 0;   // coins touched (MRR Cannon, 97% Pay $0), even when Burning Money burns them
  elapsed = 0;
  spawnAcc = 0;
  evQueue: { at: number; id: EventId }[] = [];
  eliteQueue: number[] = [];
  stampede: { dx: number; dy: number; t: number; waves: number } | null = null;
  puddles: { x: number; y: number; r: number; age: number }[] = [];
  blasts: { x: number; y: number; r: number; t: number }[] = [];
  hazT = { crate: 0, puddle: 0 };
  hazG!: Phaser.GameObjects.Graphics;
  seen = new Set<string>();
  boss: Enemy | null = null;
  bossTimer = 0;
  bossPhase = 0;
  bossKills = 0;
  bossLast = '';
  bossAt = 0;
  bossAffixes: BossAffix[] = [];
  bossPlates = 0;
  bossPlateDmg = 0;
  bossWaiting = false;   // the boss is down but its Race Condition twin still lives
  nextBossAt = BOSS_AT;
  won = false;
  over = false;
  paused = false;
  modal: Modal | null = null;
  pendingLevels = 0;
  slowmo = 0;
  rerolls = 1; skips = 1; banishes = 1;
  revivesUsed = 0;
  superNova = false;
  heat = 0;
  mode = 'standard';
  yolo = false;
  // The ladder
  wave = 1;
  waveAt = 0;
  waveMods: WaveMod[] = [];
  hpBase = 1;            // bug HP multiplier when wave 3 started
  funding = 0;           // bosses cleared: +15% damage and +10 HP each
  toolsOpen = false;
  interlude = false;     // between a boss and the next wave: no spawns, no damage
  cashedOut = false;
  forceWin = false;      // debug.win(): the next boss kill cashes out
  botCashAt = 2;         // autopilot cashes out after this wave's boss (accept test); sim sets 99
  waveFlags = { offsite: false, killswitch: false, minHp: 1 };
  pu = { autopilot: 0, freeze: 0, shipit: 0, webhook: 0, party: 0, hogzilla: 0, troop: 0, sampling: 0 };
  hist: { hp: number; x: number; y: number }[] = []; // last 5 s, for Rewind
  histT = 0;
  spikeT = 0;
  incident: { t: number; n: number; a: number } | null = null;
  puOverlay!: Phaser.GameObjects.Rectangle;
  darkG!: Phaser.GameObjects.Graphics;
  hogqlFlash = 0;
  recalcT = 0;
  tokenT = 0;            // Token Burning Cap: seconds since last hit
  dynaT = 60;            // Dynamite hoggie
  weirdT = 0;
  xs: SysState = newSys();
  R: Rng = rng(1);   // spawns, events, elites (daily: same for everyone)
  RD: Rng = rng(2);  // drops and chests
  RC: Rng = rng(3);  // level-up cards
  dmgBy: Record<string, number> = {};
  dmgWin: number[] = [];  // damage per second, last 20 s (boss HP targets the build's real DPS)
  dmgAcc = 0; dmgT = 0;
  run = { elites: 0, chests: 0, evolutions: [] as string[], hotfixes: 0, crits: 0, hurtBy: {} as Record<string, number>, powerups: 0,
    gems: 0, hits: 0, hitsWave1: 0, aiKills: 0, waves: [] as { wave: number; t: number; level: number; dps: number; boss: number }[],
    unlocks: [] as string[], crests: [] as string[] };
  numBudget = 10;
  numbers = true;
  fx!: Phaser.GameObjects.Graphics;       // bug, boss and hazard effects: always fully visible
  wfx = new Map<string, Phaser.GameObjects.Graphics>(); // one layer per weapon, each with its own fade (wAlpha)
  numAvg = 0;                             // running average damage number (what counts as a big hit)
  mergeT = 0;                             // next gem-merge pass
  moat = { fill: 0, calm: 0, lv: 0 };     // Data Moat: water left (blocks), seconds since it last blocked, level last seen
  moatG!: Phaser.GameObjects.Graphics;
  shotG!: Phaser.GameObjects.Graphics;  // danger halos and trails under enemy shots
  auraG!: Phaser.GameObjects.Graphics;
  warnG!: Phaser.GameObjects.Graphics;
  popCols: number[][] = [];
  hud!: { xp: ReturnType<typeof bar>; hpBar: Phaser.GameObjects.Graphics; time: PixelText; lv: PixelText; kills: PixelText; gold: PixelText;
    risk: PixelText; waveTxt: PixelText; icons: Phaser.GameObjects.Container; bossBar: ReturnType<typeof bar> | null; bossName: PixelText | null;
    arrow: Phaser.GameObjects.Image; chestArrow: Phaser.GameObjects.Image; pu: PixelText };
  banners: { title: string; body: string }[] = [];
  curBanner: { title: string; body: string } | null = null;
  bannerBusy = false;
  bannerObjs: Phaser.GameObjects.GameObject[] = [];
  crestQ: string[] = [];
  crestBusy = false;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  diff = DIFF.normal;
  god = false;
  autopilot = false;
  novice = false; // autopilot style: first card, no rerolls, ignores pickups (first-run approachability checks)
  simSpeed = 1;
  holdLevels = false; // debug: no level-up cards (screenshot tours)
  skipReveal = false; // debug.lose(): straight to the end screen
  revealing = false;  // the NEW HOGGIES screen after the run
  pauseObjs: Phaser.GameObjects.GameObject[] = [];
  hudObjs: Phaser.GameObjects.GameObject[] = [];
  crestObjs: Phaser.GameObjects.GameObject[] = [];
  viewW = W; viewH = H; // the view the HUD and open modals were laid out for
  // Three cameras: the world; the HUD (screen-fixed, 1:1); modals (screen-fixed, scaled to fit a view narrower than DW).
  hudCam!: Phaser.Cameras.Scene2D.Camera;
  modalCam!: Phaser.Cameras.Scene2D.Camera;
  // Touch: a floating joystick where the finger lands, taps for cards and menus, a pause button.
  joy = { on: false, ox: 0, oy: 0, x: 0, y: 0 };
  joyG!: Phaser.GameObjects.Graphics;
  downAt = 0;
  pausedAt = 0;
  tapIgnore = false;
  pauseBtns: { x: number; y: number; w: number; h: number; act: () => void }[] = [];

  constructor() { super('Game'); }

  // ---------------------------------------------------------------- setup
  create() {
    // Reset all run state (the scene object is reused between runs).
    Object.assign(this, {
      hp: 100, invuln: 0, enemies: [], pool: [], projs: [], gems: [], items: [], level: 1, xp: 0, xpNext: 5, kills: 0, gold: 0, goldSafe: 0,
      goldGrabbed: 0, elapsed: 0, spawnAcc: 0, boss: null, bossTimer: 0, bossPhase: 0, bossKills: 0, bossLast: '', nextBossAt: BOSS_AT,
      bossAffixes: [], bossPlates: 0, bossPlateDmg: 0, bossWaiting: false,
      won: false, over: false, paused: false, modal: null, pendingLevels: 0, slowmo: 0, banners: [], bannerBusy: false, bannerObjs: [],
      crestQ: [], crestBusy: false,
      simSpeed: 1, stampede: null, puddles: [], blasts: [], hazT: { crate: HAZARDS.crateFrom, puddle: HAZARDS.puddleFrom }, revivesUsed: 0,
      superNova: false, dmgBy: {}, dmgWin: [], dmgAcc: 0, dmgT: 0, numBudget: 10, numAvg: 0, mergeT: 0, moat: { fill: 0, calm: 0, lv: 0 }, wave: 1, waveAt: 0, waveMods: [], hpBase: 1, funding: 0,
      run: { elites: 0, chests: 0, evolutions: [], hotfixes: 0, crits: 0, hurtBy: {}, powerups: 0, gems: 0, hits: 0, hitsWave1: 0, aiKills: 0,
        waves: [], unlocks: [], crests: [] },
      toolsOpen: false, interlude: false, cashedOut: false, forceWin: false, botCashAt: 2,
      waveFlags: { offsite: false, killswitch: false, minHp: 1 },
      pu: { autopilot: 0, freeze: 0, shipit: 0, webhook: 0, party: 0, hogzilla: 0, troop: 0, sampling: 0 }, hist: [], histT: 0, spikeT: 0,
      incident: null, holdLevels: false, skipReveal: false, revealing: false, hogqlFlash: 0, recalcT: 0, tokenT: 0, dynaT: 60, weirdT: 0, xs: newSys(), moving: false,
    });
    this.vel = new Phaser.Math.Vector2(0, 0);
    setJuiceSpeed(1);
    this.weapons = new Map();
    this.passives = new Map();
    this.ppatch = new Map();
    this.banished = new Set();
    this.releases = new Map();
    this.relics = new Set();
    this.seen = new Set();
    this.grid = new Map();
    this.diff = DIFF[K.theme.game.difficulty as keyof typeof DIFF] ?? DIFF.normal;
    this.heat = Math.max(0, Math.min(5, K.run.heat | 0));
    this.mode = ['daily', 'yolo'].includes(K.run.mode) ? K.run.mode : 'standard';
    this.yolo = this.mode === 'yolo';
    const seed = K.run.seed || 1;
    this.R = rng(seed);
    this.RD = rng(seed ^ 0x9e3779b9);
    this.RC = rng(seed ^ 0x85ebca6b);
    const sv = save();
    this.numbers = sv.numbers;
    this.merch = { ...sv.merch };
    this.rerolls = 1 + merchExtra(this.merch, 'rerolls');
    this.skips = 1 + merchExtra(this.merch, 'skips');
    this.banishes = 1 + merchExtra(this.merch, 'banishes');
    // Daily runs are fair: everyone plays the default hoggie.
    this.hog = this.mode === 'daily' ? 'im-the-driver' : currentHog();
    this.sig = sigOf(this.hog);
    this.trait = this.sig?.trait ?? 'none';
    this.perk = this.sig ? null : perkOf(this.hog);
    hooks.scene = 'Game';
    hooks.state = 'playing';
    hooks.elapsed = 0;
    hooks.score = 0;

    const mv = TOUCH ? maxView() : { w: W, h: H }, wz = worldZoom();
    WORLD_W = Math.max(1280, Math.ceil(mv.w / wz) + 300);
    WORLD_H = Math.max(800, Math.ceil(mv.h / wz) + 300);
    this.viewW = W; this.viewH = H;
    this.crestObjs = [];
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.cameras.main.setBackgroundColor(K.ui.bg);
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, spr('tile')).setOrigin(0).setDepth(-10);
    this.add.graphics().setDepth(-9).lineStyle(4, K.ui.panelInt, 1).strokeRect(-2, -2, WORLD_W + 4, WORLD_H + 4);
    this.hazG = this.add.graphics().setDepth(-6);
    this.auraG = this.add.graphics().setDepth(-5);
    this.moatG = this.add.graphics().setDepth(OWN - 0.1);
    this.shotG = this.add.graphics().setDepth(11.9); // above bugs and pickups, just under the shots themselves
    this.fx = this.add.graphics().setDepth(20);
    this.wfx = new Map();
    this.darkG = this.add.graphics().setDepth(UI - 20);
    this.warnG = this.add.graphics().setDepth(UI + 85).setScrollFactor(0);
    // Powerup screen tint (Self-Driving Mode, Feature Freeze, Ship It...).
    this.puOverlay = this.add.rectangle(0, 0, W, H, 0x3cbcfc, 0).setName('fill').setOrigin(0).setScrollFactor(0).setDepth(UI + 60).setVisible(false);
    this.player = this.add.sprite(WORLD_W / 2, WORLD_H / 2, HOG32, this.hogArtFrame()).setDepth(10).setOrigin(0.5, 0.72);
    this.cameras.main.setZoom(this.worldCamZoom()).setBounds(0, 0, WORLD_W, WORLD_H).startFollow(this.player, true, 0.2, 0.2).setRoundPixels(true);
    this.hudCam = this.cameras.add(0, 0, Math.round(W * PX), Math.round(H * PX)).setName('hud').setRoundPixels(true);
    this.modalCam = this.cameras.add(0, 0, Math.round(W * PX), Math.round(H * PX)).setName('modal');
    fitCam(this, this.hudCam);
    fitCam(this, this.modalCam);
    this.events.on('prerender', this.routeCams, this);
    this.events.once('shutdown', () => this.events.off('prerender', this.routeCams, this));
    this.popCols = [0, 1, 2].map((i) => this.sampleColours(spr(`enemy_${i + 1}`)));
    this.popCols.push(this.sampleColours(spr('boss')));

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', this.onKey, this);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', this.onWheel, this);
    this.events.once('shutdown', () => {
      this.input.off('wheel', this.onWheel, this);
      kb.off('keydown', this.onKey, this);
      this.input.off('pointerdown', this.onDown, this);
      this.input.off('pointermove', this.onMove, this);
      this.input.off('pointerup', this.onUp, this);
    });
    this.joy = { on: false, ox: 0, oy: 0, x: 0, y: 0 };
    this.joyG = this.add.graphics().setScrollFactor(0).setDepth(UI + 70);

    this.buildHud();
    // Start weapon: daily = seeded pick; signature hoggies bring their own (theme products only if featured).
    const prods = K.theme.products as ProductId[];
    let start: WeaponId = K.theme.game.starting_product as ProductId;
    if (this.mode === 'daily') start = this.R.pick(prods);
    else if (this.sig?.start && (isTool(this.sig.start) || prods.includes(this.sig.start as ProductId))) start = this.sig.start;
    this.addWeapon(start);
    if (this.trait === 'ai') { const w = this.weapons.get('posthog_ai'); if (w) w.level = 3; }
    this.recalc();
    this.hp = this.st.maxHp;
    this.refreshIcons();
    // Events at 1:00/2:00/3:00: fixed order on a first run; ring and stampede swap on heat or daily runs.
    // The elite pack always comes last (an early pack is a coin-flip death for a young build).
    const order = [...EVENT_ORDER];
    if (this.heat > 0 || this.mode === 'daily' || this.yolo) {
      const head = this.R.shuffle(order.filter((e) => e !== 'pack'));
      order.splice(0, order.length, ...head, ...EVENT_ORDER.filter((e) => e === 'pack'));
    }
    const tscale = this.yolo ? YOLO.bossEvery / BOSS_AT : 1;
    this.evQueue = EVENT_TIMES.map((at, i) => ({ at: at * tscale, id: order[i] }));
    this.eliteQueue = [...(this.heat >= 3 ? [45, 85, 125, 165] : ELITES_AT)].map((t) => t * tscale);
    if (this.yolo) this.nextBossAt = YOLO.bossEvery;
    const sub = this.yolo ? '--dangerously-skip-permissions. Good luck.' : `Survive ${clock(this.nextBossAt)} and beat ${theName(K.theme.game.boss.name)}`;
    this.banner(K.theme.game.arena.name.toUpperCase(), sub);
    if (this.trait === 'selfdrive') this.pu.autopilot = 5;
    if (this.trait === 'deskhog') this.releases.set('deskhog', 1);
    this.installDebug();
  }

  /** The hoggie's art frame (Caveman evolves at waves 3 and 6; Hogzilla powerup swaps the art). */
  hogArtFrame() {
    if (this.pu?.hogzilla > 0) return hogFrame('driving-hogzilla');
    if (this.trait === 'evolving') return hogFrame(EVOLVING_FORMS[this.wave >= 6 ? 2 : this.wave >= 3 ? 1 : 0]);
    return hogFrame(this.hog);
  }
  crestKey() { return CREST16; }
  crestFrameOf(id: string) { return crestFrame(id); }

  /** The two most common non-black colours of frame 0: each bug pops in its own colours. */
  private sampleColours(key: string): number[] {
    try {
      const tex = this.textures.get(key);
      const fr = tex.get(0);
      const img = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const w = Math.min(64, fr.width), h = Math.min(64, fr.height);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, fr.cutX, fr.cutY, w, h, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      const count = new Map<number, number>();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        if (d[i] + d[i + 1] + d[i + 2] < 90) continue; // skip outlines
        const col = ((d[i] & 0xf0) << 16) | ((d[i + 1] & 0xf0) << 8) | (d[i + 2] & 0xf0);
        count.set(col, (count.get(col) ?? 0) + 1);
      }
      const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([col]) => col | 0x080808);
      return top.length ? top : [K.ui.accentInt];
    } catch {
      return [K.ui.accentInt, 0xfcfcfc];
    }
  }

  /** Rebuild player numbers from base + shop + hoggie + passives + releases + relics (+ live effects). Runs 4x a second. */
  recalc() {
    const s = baseStats();
    this.passives.forEach((l, id) => PASSIVES[id].apply(s, l + 0.5 * (this.ppatch.get(id) ?? 0)));
    if (this.perk) PERKS[this.perk].apply(s);
    const hpFrac = this.st.maxHp ? Math.max(0, this.hp / this.st.maxHp) : 1;
    switch (this.trait) {
      case 'area': s.area *= 1.2; break;
      case 'selfdrive': s.dur *= 2; break;
      case 'rammer': s.maxHp += 30; break;
      case 'revive': s.revives += 1; break;
      case 'reaper': s.maxHp *= 0.7; break;
      case 'seer': s.crit += 0.1; break;
      case 'magnet': s.magnet *= 2; break;
      case 'evolving': { const k = this.wave >= 6 ? 2 : this.wave >= 3 ? 1 : 0; s.might *= 1 + 0.25 * k; s.maxHp += 25 * k; break; }
      case 'robot': s.amount += 1; s.speed *= 0.85; break;
      case 'superhero': s.speed *= 1.15; break;
      case 'armour': s.armour += 0.2; break;
      case 'grind': s.growth *= 1.4; break;
      case 'panic': s.speed *= 1 + 0.5 * (1 - hpFrac); s.cd *= 1 - 0.3 * (1 - hpFrac); break;
      case 'sleepy': s.speed *= 0.85; s.regen += 2; break;
      case 'crit': s.crit += 0.08; break;
      case 'angel': s.revives += 1; break;
      case 'amount': s.amount += 1; break;
      default: break;
    }
    this.relics.forEach((r) => RELICS[r].apply(s));
    applyMerch(this.merch, s, { hpFrac, moving: this.moving, elapsed: this.elapsed, wave: this.wave, level: this.level, weapons: this.weapons.size, boss: !!this.boss });
    const has = (r: ReleaseId) => this.releases.has(r);
    if (has('dsp')) { s.might *= 1.5; s.maxHp *= 0.7; }
    if (has('sourcemaps')) { s.critMul = 3; s.crit += 0.1; }
    if (has('rollout')) s.amount += 1;
    if (has('clickhouse')) s.growth *= 1.3;
    if (has('pay0')) s.might *= 1 + Math.min(0.6, this.goldGrabbed / 1000);
    if (has('smallteams')) s.might *= 1 + 0.15 * Math.max(0, 6 - this.weapons.size);
    if (has('makerdays') && Math.floor(this.elapsed / 30) % 2 === 1) s.cd *= 0.6;
    if (has('tokencap')) s.might *= 1 + Math.min(0.6, this.tokenT * 0.02);
    // Live passives: You're the Driver (moving), Optimistic by Default (above half HP).
    const drv = this.passives.get('driver');
    if (drv && this.moving) s.might *= 1 + 0.08 * (drv + 0.5 * (this.ppatch.get('driver') ?? 0));
    const opt = this.passives.get('optimist');
    if (opt && hpFrac > 0.5) s.might *= 1 + 0.06 * (opt + 0.5 * (this.ppatch.get('optimist') ?? 0));
    // Funding rounds: every boss cleared.
    s.might *= (1 + WAVE.funding) ** this.funding;
    s.maxHp += WAVE.fundingHp * this.funding;
    if (this.yolo) s.might *= YOLO.dmg;
    if (this.weapons.get('session_replay')?.evo) s.magnet *= 1.6;
    if (this.pu?.shipit > 0) s.cd *= 0.5; // Ship It: every weapon fires twice as fast
    s.crit = Math.min(0.85, s.crit);
    s.armour = Math.min(0.7, s.armour);
    s.cd = Math.max(0.3, s.cd);
    s.maxHp = Math.round(s.maxHp);
    const rg = this.passives.get('regen');
    if (rg) s.regen += s.maxHp * 0.008 * (rg + 0.5 * (this.ppatch.get('regen') ?? 0));
    s.revives = Math.max(0, s.revives - this.revivesUsed);
    const grow = s.maxHp - this.st.maxHp;
    this.st = s;
    if (grow > 0 && this.elapsed > 0) this.hp += grow;
    this.hp = Math.min(this.hp, s.maxHp);
  }

  build(): Build {
    const products: WeaponId[] = [...(K.theme.products as ProductId[]), ...(this.toolsOpen ? TOOL_IDS : [])];
    return { weapons: this.weapons, passives: this.passives, ppatch: this.ppatch, banished: this.banished, products, luck: this.st.luck,
      maxPassives: this.wave >= 3 ? MAX_PASSIVES_LATE : MAX_PASSIVES, releases: this.releases, wave: this.wave };
  }

  sfx(name: string, vol = 1, gap = 40) { K.play(name, vol, gap); }

  /** Earn a crest (achievement): unlocks its hoggie, pops a badge. Safe to call every frame. */
  earn(id: string) {
    if (this.run.crests.includes(id) || hasCrest(id)) return;
    this.run.crests.push(id);
    if (!earnCrest(id)) return;
    const c = CREST_BY_ID.get(id);
    if (c && !this.run.unlocks.includes(c.hog)) this.run.unlocks.push(c.hog);
    this.crestQ.push(id);
    if (!this.crestBusy) this.nextCrest();
  }

  /** Crest popup (bottom right): the badge, its name, and the hoggie it unlocked, stamped approved. */
  private nextCrest() {
    const id = this.crestQ.shift();
    if (!id) { this.crestBusy = false; return; }
    this.crestBusy = true;
    const c = CREST_BY_ID.get(id)!;
    const x = W - 206, y = H - 74, D = UI + 95;
    const objs: Phaser.GameObjects.GameObject[] = [
      box(this, x, y, 200, 48, K.ui.bgInt, 0xf8d878, K.ui.panelInt).setScrollFactor(0).setDepth(D),
      this.add.image(x + 22, y + 24, CREST64, crestFrame(id)).setScale(0.55).setScrollFactor(0).setDepth(D + 1),
      text(this, x + 44, y + 5, 'CREST EARNED', { color: 0xf8d878, fixed: true, depth: D + 1 }),
      text(this, x + 44, y + 15, meta.achievements().find((a) => a.id === id)?.name ?? id, { color: K.ui.textInt, fixed: true, depth: D + 1, maxWidth: 126, maxLines: 2 }),
      text(this, x + 44, y + 36, `+ ${hogName(c.hog)}`, { color: 0x58d854, fixed: true, depth: D + 1, maxWidth: 126, maxLines: 1 }),
      this.add.image(x + 186, y + 34, HOG32, hogFrame('stamp-approved')).setScrollFactor(0).setDepth(D + 2).setScale(0.8),
    ];
    objs.forEach((o) => { const t = o as unknown as Phaser.GameObjects.Components.Transform; t.x += 160; });
    this.crestObjs = objs;
    this.tweens.add({ targets: objs, x: '-=160', duration: 250, ease: 'Back.Out' });
    this.sfx('evolve', 0.5, 300);
    this.time.delayedCall(2600, () => {
      this.tweens.add({ targets: objs, x: '+=160', duration: 200, onComplete: () => { objs.forEach((o) => o.destroy()); this.crestObjs = []; this.nextCrest(); } });
    });
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (this.over && !(this.revealing && this.modal)) return;
    const m = this.modal;
    if (m) {
      if (m.kind === 'chest' || m.kind === 'reveal') {
        if (['Enter', 'Space', 'NumpadEnter'].includes(e.code) && !e.repeat && m.armed) this.closeModal();
        return;
      }
      if (m.kind === 'act') {
        if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(e.code)) this.selectAct(m.sel === 0 ? 1 : 0);
        else if (['Digit1', 'Digit2'].includes(e.code) && m.armed) this.chooseAct(+e.code.slice(-1) - 1);
        else if (['Enter', 'Space', 'NumpadEnter'].includes(e.code) && !e.repeat && m.armed) this.chooseAct(m.sel);
        return;
      }
      const n = m.cards.length;
      if (['ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW'].includes(e.code)) this.selectCard((m.sel + n - 1) % n);
      else if (['ArrowRight', 'KeyD', 'ArrowDown', 'KeyS'].includes(e.code)) this.selectCard((m.sel + 1) % n);
      else if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { const i = +e.code.slice(-1) - 1; if (i < n) { this.selectCard(i); this.pickCard(); } }
      else if (['Enter', 'Space', 'NumpadEnter'].includes(e.code) && !e.repeat) this.pickCard();
      else if (e.code === 'KeyR' && !e.repeat) this.reroll();
      else if (e.code === 'KeyX' && !e.repeat) this.skip();
      else if (e.code === 'KeyB' && !e.repeat) this.banish();
      return;
    }
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
      if (this.paused) this.resume(); else this.pause();
      return;
    }
    if (e.code === 'KeyN' && !e.repeat) {
      this.numbers = !this.numbers;
      save().numbers = this.numbers;
      persist();
      if (this.paused) { this.resume(); this.pause(); }
      return;
    }
    if (this.paused && (e.code === 'Enter' || e.code === 'Space')) this.resume();
    if (this.paused && e.code === 'KeyQ') this.quitRun();
  }

  /** Quitting keeps the safe gold (the run isn't recorded). */
  private quitRun() {
    const keep = this.keptGold(false);
    try { meta.bank(keep); const sv = save(); sv.gold += keep; sv.kills += this.kills; persist(); } catch { /* ignore */ }
    this.over = true;
    this.scene.start('Title');
  }

  // ---------------------------------------------------------------- touch
  // Left of the clock; a narrow (portrait) view has no room there, so it goes under the stats on the right.
  private pauseRect() { return NARROW() ? { x: W - 32, y: 50, w: 28, h: TAP } : { x: W / 2 - 68, y: 3, w: 28, h: TAP }; }

  /** The world camera's zoom: the screen's resolution (PX) times worldZoom, so the arena shows about as much as a
   * DW x DH screen whatever the phone's size and shape (bugs, gems and effects scale up with the screen). Desktops keep
   * a whole number for even pixels. */
  private worldCamZoom() {
    const z = PX * worldZoom();
    return TOUCH ? z : Math.max(PX, Math.round(z));
  }

  /** Pointer (canvas pixels) -> HUD / modal layout coordinates. */
  private toHud(p: Phaser.Input.Pointer): [number, number] { const q = this.hudCam.getWorldPoint(p.x, p.y); return [q.x, q.y]; }
  private toModal(p: Phaser.Input.Pointer): [number, number] { const q = this.modalCam.getWorldPoint(p.x, p.y); return [q.x, q.y]; }

  /** Before each render: world objects draw on the main camera, screen-fixed ones on the HUD camera, modals (depth
   * UI+100 and up, except their full-view dimmers) on the modal camera. Screen-fixed objects (made with scrollFactor 0)
   * are switched to scrollFactor 1 so the HUD and modal cameras' centring applies; `ui` remembers what they are.
   * cameraFilter bits are the cameras that skip an object. */
  private routeCams() {
    const main = this.cameras.main.id, hud = this.hudCam.id, modal = this.modalCam.id;
    for (const o of this.children.list) {
      const g = o as Phaser.GameObjects.GameObject & { scrollFactorX?: number; depth?: number; ui?: boolean;
        setScrollFactor?: (x: number, y?: number) => unknown };
      if (g.scrollFactorX === 0) { g.ui = true; g.setScrollFactor?.(1, 1); }
      g.cameraFilter = !g.ui ? hud | modal : (g.depth ?? 0) >= UI + 100 && !isFill(o) ? main | hud : main | modal;
    }
  }

  private onDown(p: Phaser.Input.Pointer) {
    this.downAt = this.time.now;
    if (this.over && !this.revealing) return;
    if (this.modal || this.paused) return;
    const r = this.pauseRect(), [x, y] = this.toHud(p);
    if (TOUCH && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { this.tapIgnore = true; this.pause(); return; }
    this.joy = { on: true, ox: x, oy: y, x, y };
  }

  private onMove(p: Phaser.Input.Pointer) {
    const j = this.joy;
    if (!j.on) return;
    [j.x, j.y] = this.toHud(p);
    // A finger that drags far pulls the stick's centre along, so turning around is instant.
    const dx = j.x - j.ox, dy = j.y - j.oy, l = Math.hypot(dx, dy);
    if (l > 30) { j.ox = j.x - (dx / l) * 30; j.oy = j.y - (dy / l) * 30; }
  }

  private onUp(p: Phaser.Input.Pointer) {
    this.joy.on = false;
    if (this.tapIgnore) { this.tapIgnore = false; return; }
    if (this.over && !this.revealing) return;
    const [x, y] = this.toModal(p);
    if (this.paused) { if (this.downAt >= this.pausedAt) this.pauseTap(x, y); return; }
    const m = this.modal;
    if (m && m.armed && this.downAt >= (m.at ?? 0)) this.modalTap(m, x, y);
  }

  /** Taps on the open modal: select a card, tap it again to pick; buttons under the level-up cards. */
  private modalTap(m: Modal, x: number, y: number) {
    if (m.kind === 'chest' || m.kind === 'reveal') { this.closeModal(); return; }
    const i = (m.rects ?? []).findIndex((r) => inRect(r, x, y, 4));
    if (i >= 0) {
      const again = m.clicked === i && m.sel === i;
      m.clicked = i;
      if (m.kind === 'act') { if (again) this.chooseAct(i); else this.selectAct(i); }
      else if (again) this.pickCard(); else this.selectCard(i);
      return;
    }
    m.btns?.find((b) => inRect(b, x, y, 2))?.act();
  }

  /** The mouse wheel moves the selection on an open modal. */
  private onWheel(_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) {
    const m = this.modal;
    if (!m || !dy || this.paused) return;
    const d = dy > 0 ? 1 : -1;
    if (m.kind === 'act') this.selectAct(m.sel === 0 ? 1 : 0);
    else if (m.cards.length) this.selectCard(((m.sel < 0 ? (d > 0 ? -1 : 0) : m.sel) + d + m.cards.length) % m.cards.length);
  }

  private pauseTap(x: number, y: number) {
    const b = this.pauseBtns.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (b) b.act(); else if (!TOUCH) this.resume();
  }

  /** The floating joystick: a ring where the finger landed and a knob under it. */
  private drawJoy() {
    const g = this.joyG, j = this.joy;
    g.clear();
    if (!j.on || this.modal || this.paused) return;
    const dx = j.x - j.ox, dy = j.y - j.oy, l = Math.hypot(dx, dy), k = l > 24 ? 24 / l : 1;
    g.lineStyle(2, 0xfcfcfc, 0.3).strokeCircle(j.ox, j.oy, 24);
    g.fillStyle(0xfcfcfc, 0.35).fillCircle(j.ox + dx * k, j.oy + dy * k, 8);
  }

  private pause() {
    this.paused = true;
    this.pausedAt = this.time.now;
    this.pauseBtns = [];
    this.showBanner(false);
    hooks.state = 'paused';
    const ui = K.ui;
    // Build overview: each weapon with its version and evolution status, so players can plan the next picks. A narrow
    // screen puts the status under the name and the buttons in a 2x2 grid; either way the panel is centred.
    const narrow = NARROW(), bw0 = narrow ? W - 12 : 360, bx0 = W / 2 - bw0 / 2, pad = narrow ? 10 : 12;
    const rows = [...this.weapons.values()];
    const rowH = narrow ? 20 : rows.length > 12 ? 9 : 11;
    const o: Phaser.GameObjects.GameObject[] = [];
    const T = (x: number, y: number, str: string, opts: Parameters<typeof text>[4]) => { const t = text(this, x, y, str, { fixed: true, depth: UI + 101, ...opts }); o.push(t); return t; };
    let y = 8;
    T(W / 2, y, 'PAUSED', { scale: 2, align: 'center', color: ui.accentInt });
    y += 22;
    rows.forEach((w) => {
      const evo = WEAPONS[w.id].evo;
      T(bx0 + pad, y, `${w.evo && evo ? evo.name : productName(w.id)} ${semver(w)}`, { color: w.evo ? 0xf8d878 : ui.textInt, maxWidth: narrow ? bw0 - pad * 2 : 200, maxLines: 1 });
      const pid = evo?.passive;
      const has = !!pid && this.passives.has(pid), max = w.level >= MAX_LEVEL;
      const status = !pid ? (max ? 'MAX: patches' : 'no evolution') : w.evo ? (w.major ? 'v2.0' : 'EVOLVED') : max && has ? 'READY: open a chest'
        : max ? `needs ${PASSIVES[pid].name}` : has ? 'needs LV 5' : `LV 5 + ${PASSIVES[pid].name}`;
      T(bx0 + bw0 - pad, y + (narrow ? 9 : 0), status, { align: 'right', color: w.evo ? 0xf8d878 : status.startsWith('READY') ? 0x58d854 : ui.dimInt });
      y += rowH;
    });
    y += 4;
    const rel = [...this.releases.keys()].map((r) => RELEASES[r].name).join(', ');
    if (rel) y += T(W / 2, y, `RELEASES: ${rel}`, { align: 'center', color: 0x3cbcfc, maxWidth: bw0 - 20, maxLines: narrow ? 4 : 2 }).lineCount * 10 + 2;
    const rl = [...this.relics].map((r) => RELICS[r].name).join(' ');
    if (rl) y += T(W / 2, y, `MERCH: ${rl}`, { align: 'center', color: 0xf8d878, maxWidth: bw0 - 20, maxLines: narrow ? 3 : 1 }).lineCount * 10 + 2;
    y += 6;
    {
      // Buttons (clickable on desktop too, where the keys still work): resume, damage numbers, sound, quit.
      const btns: [string, () => void][] = [
        ['RESUME', () => this.resume()],
        [`NUMBERS ${this.numbers ? 'ON' : 'OFF'}`, () => { this.numbers = !this.numbers; save().numbers = this.numbers; persist(); this.resume(); this.pause(); }],
        [this.sound.mute ? 'SOUND OFF' : 'SOUND ON', () => { this.sound.mute = !this.sound.mute; K.sfx.muted = this.sound.mute; this.resume(); this.pause(); }],
        ['QUIT', () => this.quitRun()],
      ];
      const per = narrow ? 2 : 4, gap = 6, bw = narrow ? (bw0 - pad * 2 - gap) / 2 : 80;
      const x0 = W / 2 - (per * bw + (per - 1) * gap) / 2;
      btns.forEach(([label, act], i) => {
        const bx = x0 + (i % per) * (bw + gap), by = y + Math.floor(i / per) * (TAP + 6);
        o.push(box(this, bx, by, bw, TAP, ui.bgInt, i === 0 ? ui.accentInt : ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(UI + 101));
        T(bx + bw / 2, by + (TAP - 7) / 2, label, { align: 'center', color: i === 0 ? ui.accentInt : ui.textInt });
        this.pauseBtns.push({ x: bx, y: by - 2, w: bw, h: TAP + 4, act });
      });
      y += Math.ceil(btns.length / per) * (TAP + 6) + 2;
      if (!TOUCH) { T(W / 2, y + 2, 'ENTER resume   Q quit   N numbers   M mute', { align: 'center', color: ui.dimInt }); y += 14; }
    }
    const info = [this.heat ? `HEAT ${this.heat}` : '', this.mode !== 'standard' ? this.mode.toUpperCase() : '', `WAVE ${this.wave}`,
      hogName(this.hog).toUpperCase(), this.funding ? `FUNDING +${Math.round(((1 + WAVE.funding) ** this.funding - 1) * 100)}%` : '']
      .filter(Boolean).join('   ');
    y += T(W / 2, y, info, { align: 'center', color: ui.dimInt, maxWidth: bw0 - 10, maxLines: narrow ? 2 : 1 }).lineCount * 10 + 6;
    // The panel behind it all, then everything moved to the middle of the screen.
    const g = box(this, bx0, 0, bw0, y, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(UI + 100);
    o.unshift(g);
    const dy = Math.max(4, Math.round(H / 2 - y / 2));
    this.shiftObjs(o, 0, dy);
    this.pauseBtns.forEach((b) => { b.y += dy; });
    this.pauseObjs = o;
  }

  private resume() {
    this.paused = false;
    this.pauseBtns = [];
    hooks.state = this.boss ? 'boss' : 'playing';
    this.pauseObjs.forEach((o) => o.destroy());
    this.pauseObjs = [];
    this.showBanner(true);
  }

  // ---------------------------------------------------------------- resize
  /** Move screen-fixed objects; full-view fills are resized instead. */
  private shiftObjs(objs: Phaser.GameObjects.GameObject[], dx: number, dy: number) {
    for (const o of objs) {
      if (!o.active) continue;
      if (isFill(o)) { (o as Phaser.GameObjects.Rectangle).setSize(W, H); continue; }
      const t = o as unknown as Phaser.GameObjects.Components.Transform;
      t.x += dx; t.y += dy;
    }
  }

  /** The view changed (a phone rotated, a window resized): zoom the world, rebuild the HUD, lay out whatever is open. */
  private onResize() {
    if (!this.hud) return;
    const dx = (W - this.viewW) / 2, dy = (H - this.viewH) / 2;
    this.viewW = W; this.viewH = H;
    this.puOverlay.setSize(W, H);
    this.cameras.main.setZoom(this.worldCamZoom());
    // HUD: rebuild at the new edges (the boss bar too, if it was up).
    const boss = this.hud.bossBar ? { on: this.hud.bossBar.g.visible } : null;
    this.hudObjs.forEach((o) => o.destroy());
    this.hud.bossBar?.g.destroy();
    this.hud.bossName?.destroy();
    this.buildHud();
    if (boss) {
      this.makeBossBar();
      this.hud.bossBar!.g.setVisible(boss.on);
      this.hud.bossName?.setText(bossTitle(this.bossVersion())).setVisible(boss.on);
    }
    this.refreshIcons();
    this.updateHud();
    // Open screens are laid out again for the new shape; the crest popup stays in the bottom-right corner.
    if (this.bannerObjs.length && this.curBanner) { this.bannerObjs.forEach((o) => o.destroy()); this.drawBanner(this.curBanner); }
    this.shiftObjs(this.crestObjs, dx * 2, dy * 2);
    const m = this.modal;
    if (m?.rebuild) {
      const keep = { sel: m.sel, armed: m.armed, at: m.at };
      m.objs.forEach((o) => o.destroy());
      this.modal = null;
      m.rebuild(keep);
    } else if (m) {
      this.shiftObjs(m.objs, dx, dy);
    }
    if (this.paused) { this.resume(); this.pause(); }
  }

  // ---------------------------------------------------------------- HUD
  private buildHud() {
    // Everything buildHud (and the boss bar) adds is remembered, so a resize can tear it down and rebuild it.
    const before = new Set(this.children.list);
    this.buildHudObjs();
    this.hudObjs = this.children.list.filter((o) => !before.has(o));
  }

  private buildHudObjs() {
    const ui = K.ui;
    const xp = bar(this, 2, 2, W - 4, 4, ui.accentInt, 0x000000, ui.panelInt);
    xp.g.setDepth(UI + 90);
    xp.draw(0);
    const hpBar = this.add.graphics().setDepth(11);
    const time = text(this, W / 2, 10, '0:00', { scale: 2, align: 'center', fixed: true, depth: UI + 90 });
    const lv = text(this, W - 4, 10, 'LV 1', { align: 'right', color: ui.accentInt, fixed: true, depth: UI + 90 });
    const kills = text(this, W - 4, 20, 'BUGS 0', { align: 'right', fixed: true, depth: UI + 90 });
    const gold = text(this, W - 4, 30, 'GOLD 0', { align: 'right', color: 0xf8d878, fixed: true, depth: UI + 90 });
    const risk = text(this, W - 4, 40, '', { align: 'right', color: 0xf87858, fixed: true, depth: UI + 90 });
    text(this, 4, 10, K.theme.prospect.short.toUpperCase(), { color: ui.dimInt, fixed: true, depth: UI + 90, maxWidth: Math.min(170, W / 2 - 60), maxLines: 1 });
    const tags = [this.heat ? `HEAT ${this.heat}` : '', this.mode === 'daily' ? 'DAILY' : this.yolo ? 'YOLO' : ''].filter(Boolean);
    if (tags.length) text(this, 4, 20, tags.join(' '), { color: 0xf87858, fixed: true, depth: UI + 90 });
    // A narrow screen has the clock right above the wave line, so the wave line drops below it.
    const waveTxt = text(this, 4, NARROW() ? 32 : tags.length ? 30 : 20, '', { color: ui.accentInt, fixed: true, depth: UI + 90 });
    const icons = this.add.container(4, H - 20).setScrollFactor(0).setDepth(UI + 90);
    const arrow = this.add.image(0, 0, spr('boss_shot')).setScrollFactor(0).setDepth(UI + 95).setVisible(false).setScale(2);
    const chestArrow = this.add.image(0, 0, spr('chest')).setScrollFactor(0).setDepth(UI + 95).setVisible(false);
    const pu = text(this, W / 2, NARROW() ? 128 : 68, '', { align: 'center', fixed: true, depth: UI + 90, maxWidth: W - 8, maxLines: 2 }); // below the banner box
    if (TOUCH) {
      // Touch: a pause button left of the clock.
      const r = this.pauseRect();
      box(this, r.x + 2, r.y + 2, r.w - 4, r.h - 4, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(UI + 90);
      this.add.rectangle(r.x + r.w / 2 - 4, r.y + r.h / 2 - 4, 3, 8, ui.textInt).setOrigin(0).setScrollFactor(0).setDepth(UI + 91);
      this.add.rectangle(r.x + r.w / 2 + 1, r.y + r.h / 2 - 4, 3, 8, ui.textInt).setOrigin(0).setScrollFactor(0).setDepth(UI + 91);
    }
    this.hud = { xp, hpBar, time, lv, kills, gold, risk, waveTxt, icons, bossBar: null, bossName: null, arrow, chestArrow, pu };
  }

  /** [texture, frame] for a weapon / passive / release / powerup icon. */
  iconOf(kind: string, id: string): [string, number] {
    if (kind === 'weapon' || kind === 'major') {
      const c = WEAPONS[id as WeaponId]?.crest;
      return c ? [CREST16, crestFrame(c)] : [spr(`icon_${id}`), 0];
    }
    if (kind === 'passive') {
      const c = PASSIVES[id as PassiveId]?.crest;
      return c ? [CREST16, crestFrame(c)] : [spr(`icon_${id}`), 0];
    }
    if (kind === 'release') {
      const r = RELEASES[id as ReleaseId];
      return r.hog ? [HOG32, hogFrame(r.hog)] : [CREST16, crestFrame(r.crest ?? 'a-default-crest')];
    }
    if (kind === 'power') {
      const p = POWERUPS[id as PowerId];
      return p.hog ? [HOG32, hogFrame(p.hog)] : p.crest ? [CREST16, crestFrame(p.crest)] : [spr(id), 0];
    }
    return [spr(id), 0];
  }

  refreshIcons() {
    const c = this.hud.icons;
    c.removeAll(true);
    // One row, weapons then passives; a second row up when they don't fit the screen's width.
    const many = (this.weapons.size + this.passives.size) * 19 + 6 > W - 8;
    let x = 0, y = 0;
    const add = (key: string, frame: number, lvl: number, evo: boolean) => {
      if (x + 16 > W - 8) { x = 0; y -= 21; }
      if (evo) c.add(this.add.rectangle(x - 1, y - 1, 18, 18, 0xf8d878).setOrigin(0));
      c.add(this.add.image(x, y, key, frame).setOrigin(0).setDisplaySize(16, 16));
      if (!evo) for (let i = 0; i < lvl; i++) c.add(this.add.rectangle(x + 1 + i * 3, y + 17, 2, 2, K.ui.accentInt).setOrigin(0));
      x += 19;
    };
    this.weapons.forEach((w, id) => { const [k, f] = this.iconOf('weapon', id); add(k, f, w.level, w.evo); });
    if (many) { x = 0; y = -21; } else x += 6;
    this.passives.forEach((l, id) => { const [k, f] = this.iconOf('passive', id); add(k, f, l, false); });
  }

  private updateHud() {
    this.hud.xp.draw(this.xp / this.xpNext);
    this.hud.time.setText(clock(this.elapsed));
    this.hud.lv.setText(`LV ${this.level}`);
    this.hud.kills.setText(`BUGS ${this.kills}`);
    this.hud.gold.setText(`GOLD ${this.gold}`);
    const risk = this.wave >= 2 ? this.gold - this.goldSafe : 0;
    this.hud.risk.setText(risk > 0 ? `${risk} AT RISK` : '');
    const toBoss = Math.max(0, this.nextBossAt - this.elapsed);
    const v = this.bossVersion();
    this.hud.waveTxt.setText(this.boss ? `WAVE ${this.wave}  ${v >= 2 ? `v${v}.0` : 'BOSS'}` : this.interlude ? `WAVE ${this.wave}`
      : `WAVE ${this.wave}  ${v >= 2 ? `v${v}.0` : 'BOSS'} IN ${clock(toBoss)}`);
    // Active powerups: countdowns under the clock, and a screen tint.
    const pu = this.pu;
    const parts: [string, number][] = [];
    if (pu.autopilot > 0) parts.push([`SELF-DRIVING ${pu.autopilot.toFixed(1)}`, POWERUPS.autopilot.col]);
    if (pu.freeze > 0) parts.push([`FREEZE ${pu.freeze.toFixed(1)}`, POWERUPS.freeze.col]);
    if (pu.shipit > 0) parts.push([`SHIP IT ${pu.shipit.toFixed(1)}`, POWERUPS.shipit.col]);
    if (pu.webhook > 0) parts.push([`WEBHOOK ${pu.webhook.toFixed(1)}`, POWERUPS.webhook.col]);
    if (pu.party > 0) parts.push([`PARTY ${pu.party.toFixed(1)}`, POWERUPS.party.col]);
    if (pu.hogzilla > 0) parts.push([`HOGZILLA ${pu.hogzilla.toFixed(1)}`, POWERUPS.hogzilla.col]);
    if (pu.troop > 0) parts.push([`TROOP ${pu.troop.toFixed(1)}`, POWERUPS.troop.col]);
    if (pu.sampling > 0) parts.push([`SAMPLING ${pu.sampling.toFixed(1)}`, POWERUPS.sampling.col]);
    this.hud.pu.setText(parts.map((x) => x[0]).join('   ')).setColor(parts[0]?.[1] ?? 0xfcfcfc);
    const tint = pu.autopilot > 0 ? [0x3cbcfc, 0.1 + 0.04 * Math.sin(this.time.now / 120)] : pu.freeze > 0 ? [0xa4e4fc, 0.1]
      : pu.party > 0 ? [[0xf878f8, 0x58d854, 0x3cbcfc, 0xf8d878][Math.floor(this.time.now / 150) % 4], 0.08]
        : pu.shipit > 0 ? [0xfca044, 0.05 + 0.03 * Math.sin(this.time.now / 90)] : this.hogqlFlash > 0 ? [0x58d854, 0.12] : null;
    this.puOverlay.setVisible(!!tint && !this.modal);
    if (tint) this.puOverlay.setFillStyle(tint[0], tint[1]);
    const g = this.hud.hpBar;
    const frac = Math.max(0, this.hp / this.st.maxHp);
    const x = Math.round(this.player.x - 10), y = Math.round(this.player.y + 11);
    g.clear().fillStyle(0x000000).fillRect(x - 1, y - 1, 22, 4).fillStyle(0x7c7c7c).fillRect(x, y, 20, 2)
      .fillStyle(frac > 0.35 ? 0x58d854 : 0xf83800).fillRect(x, y, Math.max(0, Math.round(20 * frac)), 2);
    if (this.boss && this.hud.bossBar) {
      this.hud.bossBar.draw(this.boss.hp / this.boss.maxHp, 0xf83800);
      const cam = this.cameras.main;
      const k = W / camW(cam); // world -> screen: the world camera zooms in further than the HUD
      const bx = (this.boss.s.x - cam.worldView.x) * k, by = (this.boss.s.y - cam.worldView.y) * k;
      const off = bx < 0 || bx > W || by < 0 || by > H;
      this.hud.arrow.setVisible(off && Math.floor(this.time.now / 250) % 2 === 0);
      if (off) this.hud.arrow.setPosition(Phaser.Math.Clamp(bx, 10, W - 10), Phaser.Math.Clamp(by, 34, H - 30));
    } else {
      this.hud.arrow.setVisible(false);
    }
    // Off-screen chest: a blinking chest icon on the screen edge, toward the nearest one.
    const cam = this.cameras.main, p = this.player;
    let best: Item | null = null, bd = 1e12;
    for (const it of this.items) {
      if (it.kind !== 'chest') continue;
      const d = (it.s.x - p.x) ** 2 + (it.s.y - p.y) ** 2;
      if (d < bd) { bd = d; best = it; }
    }
    const ca = this.hud.chestArrow;
    if (best) {
      const k = W / camW(cam);
      const cx = (best.s.x - cam.worldView.x) * k, cy = (best.s.y - cam.worldView.y) * k;
      const off = cx < 0 || cx > W || cy < 0 || cy > H;
      ca.setVisible(off && Math.floor(this.time.now / 300) % 2 === 0);
      if (off) ca.setPosition(Phaser.Math.Clamp(cx, 12, W - 12), Phaser.Math.Clamp(cy, 40, H - 32));
    } else {
      ca.setVisible(false);
    }
  }

  /** Queue a two-line banner at the top of the screen (new bugs, events, boss). */
  banner(title: string, body: string) {
    this.banners.push({ title, body });
    if (this.banners.length > 6) this.banners.splice(0, this.banners.length - 6);
    if (!this.bannerBusy) this.nextBanner();
  }

  private nextBanner() {
    const b = this.banners.shift();
    if (!b) { this.bannerBusy = false; this.curBanner = null; return; }
    this.bannerBusy = true;
    this.drawBanner(b);
    this.time.delayedCall(this.banners.length > 2 ? 1600 : 2600, () => {
      this.bannerObjs.forEach((o) => o.destroy());
      this.bannerObjs = [];
      this.curBanner = null;
      this.time.delayedCall(200, () => this.nextBanner());
    });
  }

  /** The banner box: across the top, or on a narrow screen full width under the HUD with room for two lines. */
  private drawBanner(b: { title: string; body: string }) {
    const ui = K.ui, narrow = NARROW();
    const mx = narrow ? 6 : 60, y = narrow ? 80 : 30, tw = W - mx * 2 - 16;
    const t1 = text(this, W / 2, y + 5, b.title, { align: 'center', color: ui.accentInt, fixed: true, depth: UI + 81, maxWidth: tw, maxLines: 1 });
    const t2 = text(this, W / 2, y + 18, b.body, { align: 'center', fixed: true, depth: UI + 81, maxWidth: tw, maxLines: narrow ? 2 : 1 });
    const g = box(this, mx, y, W - mx * 2, 24 + t2.lineCount * 10, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(UI + 80);
    this.curBanner = b;
    this.bannerObjs = [g, t1, t2];
    if (this.modal || this.paused) this.showBanner(false);
  }

  private showBanner(on: boolean) {
    this.bannerObjs.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on));
  }

  // ---------------------------------------------------------------- main loop
  update(_t: number, dtMs: number) {
    if (this.over) return;
    if (this.autopilot && this.modal?.armed) this.botModal();
    if (!hitstopped(this)) {
      for (let i = 0; i < this.simSpeed && !this.over; i++) this.step(Math.min(dtMs, 50) / 1000);
    }
    this.draw();
    this.updateHud();
    hooks.elapsed = this.elapsed;
    hooks.score = this.score();
    hooks.stats = {
      hp: Math.round(this.hp), maxHp: this.st.maxHp, level: this.level, enemies: this.enemies.length, kills: this.kills,
      gems: this.gems.length, items: this.items.length, projectiles: this.projs.length, boss: this.boss ? Math.round(this.boss.hp) : null,
      weapons: Object.fromEntries([...this.weapons].map(([k, v]) => [k, v.evo ? 'evo' : v.level])),
      versions: Object.fromEntries([...this.weapons].map(([k, v]) => [k, semver(v)])),
      passives: Object.fromEntries(this.passives),
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
      gold: this.gold, goldSafe: this.goldSafe, heat: this.heat, mode: this.mode, hog: this.hog, trait: this.trait, elites: this.run.elites,
      chests: this.run.chests, evolutions: this.run.evolutions, bossKills: this.bossKills, superNova: this.superNova, rerolls: this.rerolls,
      hurtBy: this.run.hurtBy, wave: this.wave, waveAt: Math.round(this.waveAt), waveMods: this.waveMods, funding: this.funding,
      releases: Object.fromEntries(this.releases), relics: [...this.relics], powerups: this.run.powerups, cashedOut: this.cashedOut,
      tools: [...this.weapons.keys()].filter(isTool), pu: { ...this.pu }, bossMode: this.boss?.mode ?? null, bossAffixes: this.bossAffixes,
      dps: Math.round(this.dps()), waves: this.run.waves, act: Math.min(2, this.wave),
      dmg: Object.fromEntries(Object.entries(this.dmgBy).map(([k, v]) => [k, Math.round(v)])),
    };
  }

  private step(dt: number) {
    if (this.paused || this.modal) return;
    if (this.slowmo > 0) {
      // Level-up fanfare: a beat of slow motion, then the cards.
      this.slowmo -= dt;
      dt *= 0.25;
      if (this.slowmo <= 0 && this.pendingLevels > 0 && !this.won && !this.interlude) { this.openLevelUp(); return; }
    }
    this.elapsed += dt;
    this.numBudget = Math.min(14, this.numBudget + dt * 40);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hogqlFlash = Math.max(0, this.hogqlFlash - dt);
    this.tokenT += dt;
    this.trackDps(dt);
    this.recalcT -= dt;
    if (this.recalcT <= 0) { this.recalcT = 0.25; this.recalc(); }
    this.tickPowerups(dt);
    let regen = (this.heat >= 4 ? 0 : this.diff.regen) + this.st.regen;
    if (this.trait === 'grind') regen -= 0.5;
    this.hp = Math.min(this.st.maxHp, Math.max(Math.min(this.hp, 1), this.hp + regen * dt));
    this.runHazards(dt);
    this.movePlayer(dt);
    this.spawn(dt);
    this.buildGrid();
    this.moveEnemies(dt);
    this.tickMoat(dt);
    this.fireWeapons(dt);
    tickSystems(this, dt);
    this.moveProjectiles(dt);
    if (this.over) return;
    this.moveGems(dt);
    this.moveItems(dt);
    if (this.over) return;
    this.touchPlayer(dt);
    if (this.over) return;
    this.runBoss(dt);
    this.runWaveTimers(dt);
    if (this.pendingLevels > 0 && !this.modal && this.slowmo <= 0 && !this.over && !this.won && !this.interlude) this.levelFanfare();
  }

  /** Each weapon fires; a v2.0 weapon sees +1 amount and a faster cooldown. */
  private fireWeapons(dt: number) {
    const base = this.st;
    this.weapons.forEach((w) => {
      const fn = WEAPON_FNS[w.id] ?? TOOL_FNS[w.id];
      if (!fn) return;
      if (w.major) this.st = { ...base, amount: base.amount + MAJOR.amount, cd: base.cd * MAJOR.cd };
      fn(this, w, dt);
      this.st = base;
    });
  }

  /** Per-wave timers: offsite level-up, dynamite, YOLO powerup rain, mid-wave checks. */
  private runWaveTimers(dt: number) {
    if (this.interlude || this.won) return;
    const inWave = this.elapsed - this.waveAt;
    if (this.releases.has('offsite') && !this.waveFlags.offsite && inWave > (this.yolo ? 45 : 90)) {
      this.waveFlags.offsite = true;
      this.pendingLevels++;
      this.banner('OFFSITE HACKATHON!', '24 hours, one free level-up');
    }
    if (this.trait === 'dynamite') {
      this.dynaT -= dt;
      if (this.dynaT <= 0) { this.dynaT = 60; this.hotfix(); }
    }
    if (this.yolo && Math.floor(this.elapsed / YOLO.rainEvery) !== Math.floor((this.elapsed - dt) / YOLO.rainEvery) && this.powerCount() < 3) {
      const p = this.player, a = Math.random() * 6.28;
      this.dropItem(this.rollPowerup(), p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 50);
    }
    this.waveFlags.minHp = Math.min(this.waveFlags.minHp, this.hp / this.st.maxHp);
    if (this.elapsed >= 576) this.unlock('996'); // 9:36
  }

  private trackDps(dt: number) {
    this.dmgT += dt;
    if (this.dmgT >= 1) {
      this.dmgT -= 1;
      this.dmgWin.push(this.dmgAcc);
      this.dmgAcc = 0;
      if (this.dmgWin.length > 20) this.dmgWin.shift();
    }
  }
  /** Damage per second over the last 20 s. */
  dps() { return this.dmgWin.length ? this.dmgWin.reduce((a, b) => a + b, 0) / this.dmgWin.length : 0; }

  private movePlayer(dt: number) {
    const k = this.keys;
    let dx = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let dy = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    const driving = this.pu.autopilot > 0;
    // Touch: the joystick, with a little analog range so small drags walk slowly.
    let analog = 1;
    const j = this.joy;
    if (j.on && dx === 0 && dy === 0) {
      const jx = j.x - j.ox, jy = j.y - j.oy, l = Math.hypot(jx, jy);
      if (l > 4) { dx = jx; dy = jy; analog = Math.min(1, (l - 4) / 14); }
    }
    // Self-Driving Mode: the keys are ignored and the hog steers itself toward gems and away from crowds.
    if (driving) [dx, dy] = this.autopilotDir(true);
    else if (this.autopilot && dx === 0 && dy === 0) [dx, dy] = this.autopilotDir();
    const len = Math.hypot(dx, dy);
    this.moving = len > 0;
    if (len > 0) {
      dx /= len; dy /= len;
      this.facing.set(dx, dy);
      if (dx !== 0) this.player.setFlipX(dx > 0);
    }
    let sp = this.st.speed * (driving ? 1.25 : this.trait === 'superhero' ? 1 : this.puddleSlow());
    if (this.pu.hogzilla > 0) sp *= 1.3;
    if (!driving) sp *= analog;
    if (this.boss && this.bossAffixes.includes('backpressure')) sp *= Math.max(0.6, 1 - this.enemies.length / 500);
    if (this.waveMods.includes('freeze') && this.trait !== 'superhero' && !driving) {
      // Code Freeze: an icy floor, you keep sliding.
      const kk = Math.min(1, dt * 4.5);
      this.vel.x += (dx * sp - this.vel.x) * kk;
      this.vel.y += (dy * sp - this.vel.y) * kk;
    } else {
      this.vel.set(dx * sp, dy * sp);
    }
    this.player.x = Phaser.Math.Clamp(this.player.x + this.vel.x * dt, 12, WORLD_W - 12);
    this.player.y = Phaser.Math.Clamp(this.player.y + this.vel.y * dt, 12, WORLD_H - 12);
  }

  /** Test bot: flee the local crowd, drift toward gems and pickups, stay away from walls. */
  autopilotDir(driving = false): [number, number] {
    const p = this.player;
    let fx = 0, fy = 0;
    for (const e of this.enemies) {
      if (e.arch === 'crate' || e.arch === 'nest' && !e.elite) continue;
      const dx = p.x - e.s.x, dy = p.y - e.s.y;
      const d2 = dx * dx + dy * dy;
      const reach = e.boss || e.reaper ? (this.hp < this.st.maxHp * 0.5 || e.mode >= 1 || e.reaper ? 160 : 70) : e.mode === 3 ? 70
        : e.arch === 'runner' || e.mode >= 1 ? 120 : 90;
      if (d2 < reach * reach && d2 > 1) {
        const w = (e.boss || e.reaper ? 6 : e.mode === 3 ? 5 : e.arch === 'runner' ? 3 : e.elite ? 2 : 1) / d2;
        fx += dx * w; fy += dy * w;
      }
    }
    for (const pr of this.projs) {
      if (!pr.hostile) continue;
      const dx = p.x - pr.s.x, dy = p.y - pr.s.y, d2 = dx * dx + dy * dy;
      if (d2 < 60 * 60 && d2 > 1) { fx += (dx * 2) / d2; fy += (dy * 2) / d2; }
    }
    for (const q of this.puddles) {
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
      if (d < q.r + 20) { fx += (dx / d) * 0.02; fy += (dy / d) * 0.02; }
    }
    const lane = this.xs.drive;
    if (lane && lane.t < 1.6) {
      // Get out of Hogzilla's lane.
      const off = lane.horiz ? p.y - lane.pos : p.x - lane.pos;
      if (Math.abs(off) < 60) { const push = (off >= 0 ? 1 : -1) * 0.2; if (lane.horiz) fy += push; else fx += push; }
    }
    const danger = Math.hypot(fx, fy);
    // Targets: chests and hotfixes first, food when hurt, then the nearest gem.
    let gx = 0, gy = 0, best = 1e9;
    const hurt = this.hp < this.st.maxHp * 0.6;
    for (const it of this.novice && !driving ? [] : this.items) {
      if (it.kind === 'food' && !hurt) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y, it.s.x, it.s.y) * (it.kind === 'chest' ? 0.3 : it.kind === 'coin' ? 1.2 : isPower(it.kind) ? 0.45 : 0.6);
      if (d < best) { best = d; gx = it.s.x - p.x; gy = it.s.y - p.y; }
    }
    for (const g of this.gems) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, g.s.x, g.s.y);
      if (d < best) { best = d; gx = g.s.x - p.x; gy = g.s.y - p.y; }
    }
    const gl = Math.hypot(gx, gy) || 1;
    const edge = (v: number, max: number) => (v < 140 ? (140 - v) / 140 : v > max - 140 ? -(v - (max - 140)) / 140 : 0);
    const wx = edge(p.x, WORLD_W) * 0.05;
    const wy = edge(p.y, WORLD_H) * 0.05;
    const dl = danger || 1;
    const fear = Math.min(1, danger * 70);
    const greed = best < 400 ? 1 - fear * 0.8 : 0;
    let x = (fx / dl) * fear + (gx / gl) * greed + wx * 30;
    let y = (fy / dl) * fear + (gy / gl) * greed + wy * 30;
    if (danger < 0.002 && greed === 0) { x += Math.cos(this.elapsed * 0.8); y += Math.sin(this.elapsed * 0.8); }
    return [x, y];
  }

  // ---------------------------------------------------------------- spawning + scaling
  // Named heat modifiers stack (1 more, 2 faster, 3 elites early, 4 less healing, 5 boss rage + an extra affix). On top, heat
  // adds pressure that ramps in over the first 2:30 (x1.5 by 3:45): per level up to +15% bug HP and +10% spawns, plus +8% damage.
  private heatRamp() { return Math.min(1.5, this.elapsed / 150); }
  private heatSpawn() { return (this.heat >= 1 ? 1.3 : 1) * (1 + 0.1 * this.heat * this.heatRamp()); }
  private heatSpeed() { return this.heat >= 2 ? 1.18 : 1; }
  private heatHp() { return 1 + 0.15 * this.heat * this.heatRamp(); }
  private heatDmg() { return 1 + 0.08 * this.heat; }

  /** How far through the current wave (0-1). */
  waveFrac() { return this.wave === 1 ? 0 : Phaser.Math.Clamp((this.elapsed - this.waveAt) / this.waveLen(), 0, 1); }
  waveLen() { return this.yolo ? YOLO.bossEvery : this.wave >= 3 ? WAVE.lenLate : WAVE.len; }
  /** Wave 3+: the product of each wave's growth factor, up to (w - 3 + f). */
  gpow(w: number, f: number) {
    let m = 1;
    for (let k = 3; k < w; k++) m *= k >= WAVE.lateFrom ? WAVE.gLate : WAVE.g;
    return m * (w >= 3 ? (w >= WAVE.lateFrom ? WAVE.gLate : WAVE.g) ** f : 1);
  }
  /** Bug HP multiplier right now (on top of difficulty and heat). */
  hpScale() {
    if (this.wave >= 3) return this.hpBase * this.gpow(this.wave, this.waveFrac());
    const t = (1 + this.elapsed / 150);
    return this.wave === 2 ? t * (ACT2.hp0 + (ACT2.hp1 - ACT2.hp0) * this.waveFrac()) : t;
  }
  /** Easy's discounts (below 1) fade to normal from wave 3 to wave 6, so an easy run still ends. */
  ease(m: number) { return m >= 1 ? m : m + (1 - m) * Phaser.Math.Clamp((this.wave - 2) / 4, 0, 1); }
  dmgScale() { return this.wave >= 2 ? ACT2.dmg * WAVE.dmg ** Math.max(0, this.wave - 2) * (this.yolo ? YOLO.dmg : 1) : 1; }
  xpScale() { return (1 + WAVE.xp * (this.wave - 1)) * (this.waveMods.includes('hyper') ? 1.3 : 1) * (this.yolo ? YOLO.xp : 1); }
  /** The version number of the next/current boss. */
  bossVersion() { return this.yolo ? this.bossKills + 1 : this.wave; }

  private spawn(dt: number) {
    if (this.won || this.interlude) return;
    const t = this.elapsed;
    const R = this.R;
    while (this.evQueue.length && t >= this.evQueue[0].at) this.startEvent(this.evQueue.shift()!.id);
    while (this.eliteQueue.length && t >= this.eliteQueue[0]) {
      this.eliteQueue.shift();
      this.spawnElite(R.pick(['splitter', 'tank', 'charger'] as ArchId[]));
    }
    this.runStampede(dt);
    const angry = this.boss && this.bossPhase >= 2;
    if (this.boss && !angry) return; // quiet while the boss fights, until it's angry
    let rate = (1.1 + Math.min(t, 420) * 0.034) * this.diff.spawn * this.heatSpawn() * (this.boss ? 0.5 : 1);
    if (this.wave >= 2) rate *= ACT2.spawn * (1 + WAVE.spawn * Math.max(0, this.wave - 2));
    if (this.waveMods.includes('hyper')) rate *= 1.3;
    if (this.yolo) rate *= YOLO.spawn;
    if (this.spikeT > 0) { this.spikeT -= dt; rate *= 2; }
    this.runIncident(dt);
    this.spawnAcc += rate * dt;
    const table = this.wave >= 3 ? null : this.wave === 2 ? ACT2_SPAWN : SPAWN_TABLE;
    let entries: [ArchId, number][];
    if (table) {
      const tt = this.wave === 2 ? t - this.waveAt : t;
      entries = Object.entries(([...table].reverse().find((r) => tt >= r.at) ?? table[0]).w) as [ArchId, number][];
    } else {
      entries = this.lateEntries();
    }
    const total = entries.reduce((a, [, w]) => a + w, 0);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length >= MAX_ENEMIES) continue;
      let x = R.next() * total;
      let arch: ArchId = entries[0][0];
      for (const [a, w] of entries) { x -= w; if (x <= 0) { arch = a; break; } }
      const [px, py] = this.offscreenPoint();
      if (arch === 'race') this.spawnRace(px, py);
      else if (arch === 'nest' && this.enemies.filter((e) => e.arch === 'nest').length >= 3) this.addEnemy('tank', px, py);
      else this.addEnemy(arch, px, py);
    }
  }

  /** Wave 3+ mix: the base six plus every trick met so far; this wave's trick weighs most. */
  private lateEntries(): [ArchId, number][] {
    const w: Partial<Record<ArchId, number>> = { ...LATE_BASE };
    const own = WAVES[this.wave]?.arch;
    LATE_TRICKS.forEach((a, i) => {
      if (i + 3 > this.wave) return;
      w[a] = a === own ? 0.22 : a === 'nest' ? 0.012 : 0.07;
    });
    if (own === 'nest') w.nest = 0.03;
    return Object.entries(w) as [ArchId, number][];
  }

  /** A point just outside the camera view; if that side is beyond the arena wall, the opposite side. */
  offscreenPoint(angle?: number): [number, number] {
    const cam = this.cameras.main;
    const cx = cam.worldView.x + camW(cam) / 2, cy = cam.worldView.y + camH(cam) / 2;
    const edge = (ang: number): [number, number] => {
      const c = Math.cos(ang), s = Math.sin(ang);
      const k = 1 / Math.max(Math.abs(c) / (camW(cam) / 2 + 24), Math.abs(s) / (camH(cam) / 2 + 24));
      return [cx + c * k, cy + s * k];
    };
    const a = angle ?? this.R.next() * Math.PI * 2;
    let [x, y] = edge(a);
    if (x < 8 || y < 8 || x > WORLD_W - 8 || y > WORLD_H - 8) [x, y] = edge(a + Math.PI);
    return [Phaser.Math.Clamp(x, 8, WORLD_W - 8), Phaser.Math.Clamp(y, 8, WORLD_H - 8)];
  }

  addEnemy(arch: ArchId, x: number, y: number, elite: EliteMod | null = null): Enemy | null {
    if (this.won || this.interlude) return null;
    if (this.enemies.length >= MAX_ENEMIES && !elite) return null;
    x = Phaser.Math.Clamp(x, 8, WORLD_W - 8);
    y = Phaser.Math.Clamp(y, 8, WORLD_H - 8);
    const A = ARCH[arch];
    const type = A.sprite;
    const scale = this.hpScale();
    let e = this.pool.pop();
    const key = A.key ? spr(A.key) : spr(`enemy_${type + 1}`);
    if (!e) {
      e = { s: this.add.sprite(x, y, key), arch, type, hp: 0, maxHp: 0, speed: 0, dmg: 0, xp: 0, r: 0, kx: 0, ky: 0, flash: 0, slow: 1,
        hitAt: {}, alive: true, elite: null, mode: 0, t: 0, vx: 0, vy: 0, acc: 0, accT: 0, accCrit: false, armour: 1, kb: 1, tint: null };
    }
    const sc = (A.scale ?? 1) * (elite ? 1.6 : 1);
    e.s.setTexture(key).setPosition(x, y).setActive(true).setVisible(true).setDepth(elite ? 6 : 5).setScale(sc).setAlpha(1).setAngle(0);
    if (A.key) e.s.stop().setFrame(0);
    else { e.s.play(anim(`enemy_${type + 1}`)); e.s.anims.setProgress(Math.random()); }
    const tint = elite ? ELITE_MODS[elite].tint : A.tint ?? null;
    const speed = A.speed * Phaser.Math.FloatBetween(0.9, 1.1) * this.heatSpeed() * (elite === 'fast' ? 1.5 : 1) * Math.min(1.4, 1 + WAVE.speed * Math.max(0, this.wave - 2));
    const hp = A.hp * this.ease(this.diff.hp) * scale * this.heatHp() * (elite ? 9 : 1);
    const dmg = A.dmg * this.ease(this.diff.dmg) * this.heatDmg() * (elite ? 1.4 : 1) * this.dmgScale();
    let armour = (A.armour ?? 1) * (elite === 'shield' ? 0.45 : 1);
    if (this.waveMods.includes('enterprise') && arch !== 'crate') armour *= 0.65;
    Object.assign(e, { arch, type, hp, speed, dmg, xp: A.xp * (elite ? 5 : 1), r: A.r * sc, kx: 0, ky: 0, flash: 0, slow: 1, hitAt: {}, alive: true,
      boss: false, elite, mod2: null, mode: 0, t: Phaser.Math.FloatBetween(1.5, 3.5), vx: 0, vy: 0, acc: 0, accT: 0, accCrit: false, armour,
      kb: (A.kb ?? 1) * (elite ? 0.3 : 1), tint, seed: Math.random(), batch: 0, flagT: 0, link: null, twin: false, reaper: false, grow: 1,
      base: { hp, dmg, r: A.r * sc, sc } });
    e.maxHp = e.hp;
    this.restoreTint(e);
    this.enemies.push(e);
    this.announce(arch, type);
    return e;
  }

  /** Race Condition: two linked bugs. Kill one and the other enrages unless it dies within 2 s too. */
  private spawnRace(x: number, y: number) {
    const a = this.addEnemy('race', x, y), b = this.addEnemy('race', x + 10, y + 6);
    if (a && b) { a.link = b; b.link = a; }
  }

  private announce(arch: ArchId, type: number) {
    if (arch === 'mini' || arch === 'runner' || arch === 'crate') return;
    const A = ARCH[arch];
    if (!A.trick) {
      if (this.seen.has(`t${type}`)) return;
      this.seen.add(`t${type}`);
      const info = K.theme.game.enemies[type];
      this.banner(`NEW BUG: ${info.name.toUpperCase()}`, info.pain);
    } else if (!this.seen.has(arch)) {
      this.seen.add(arch);
      this.banner(`NEW TRICK: ${arch.toUpperCase()}`, A.trick.replace('{n}', `${bugName(type)}s`));
    }
  }

  restoreTint(e: Enemy) {
    if (e.reaper) { e.s.setTintFill(VOID); return; }
    if (this.pu.freeze > 0 && !e.boss && e.arch !== 'crate') e.s.setTint(0xa4e4fc);
    else if (e.tint !== null) e.s.setTint(e.tint); else e.s.clearTint();
  }

  spawnElite(arch: ArchId, x?: number, y?: number) {
    const pool = this.wave >= 3 ? ELITE_LATE : ELITE_BASIC;
    const mod = this.R.pick(pool);
    if (x === undefined || y === undefined) [x, y] = this.offscreenPoint();
    const e = this.addEnemy(arch, x, y, mod);
    if (!e) return null;
    if (this.wave >= 4) {
      const m2 = this.R.pick(pool.filter((m) => m !== mod));
      e.mod2 = m2;
      if (m2 === 'shield') e.armour *= 0.45;
      if (m2 === 'fast') e.speed *= 1.5;
    }
    const label = e.mod2 ? `${ELITE_MODS[mod].label} + ${ELITE_MODS[e.mod2].label}` : ELITE_MODS[mod].label;
    this.banner(`ELITE ${bugName(e.type).toUpperCase()}!`, `${label}. Squash it for a chest!`);
    this.sfx('elite', 0.7, 200);
    return e;
  }
  private hasMod(e: Enemy, m: EliteMod) { return e.elite === m || e.mod2 === m; }

  startEvent(id: EventId) {
    const ev = EVENTS[id];
    this.banner(ev.title, ev.body.replace('{n0}', bugName(0)).replace('{n1}', bugName(1)));
    const p = this.player;
    if (id === 'ring') {
      const n = Math.round(24 * this.diff.spawn * this.heatSpawn());
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.addEnemy('swarmer', p.x + Math.cos(a) * 250, p.y + Math.sin(a) * 170);
      }
    } else if (id === 'spike') {
      // Traffic Spike: double spawns for 10 s, starting with a burst.
      this.spikeT = 10;
      for (let i = 0; i < 16; i++) { const [x, y] = this.offscreenPoint(); this.addEnemy(i % 4 ? 'swarmer' : 'splitter', x, y); }
      this.sfx('elite', 0.5, 200);
    } else if (id === 'incident') {
      // Incident: a spiral of bugs pours in around the edge of the screen over ~3 s.
      this.incident = { t: 0, n: 0, a: this.R.next() * Math.PI * 2 };
      shake(this, 3, 300);
      this.sfx('charge', 0.6, 100);
    } else if (id === 'stampede') {
      const [dx, dy] = this.R.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      this.stampede = { dx, dy, t: 1.6, waves: 3 };
      this.sfx('charge', 0.6, 100);
    } else if (id === 'hogzilla') {
      startDriveBy(this);
    } else {
      const arches: ArchId[] = ['splitter', 'tank', 'charger'];
      arches.forEach((a, i) => {
        const ang = this.R.next() * 0.5 + (i / 3) * Math.PI * 2;
        this.spawnElite(a, p.x + Math.cos(ang) * 210, p.y + Math.sin(ang) * 150);
      });
      for (let i = 0; i < 8; i++) { const [x, y] = this.offscreenPoint(); this.addEnemy('swarmer', x, y); }
    }
    capture('bug_event', { event: id, t: Math.round(this.elapsed), wave: this.wave });
  }

  /** Incident spiral: one bug every ~0.07 s, walking the spawn point around the screen edge. */
  private runIncident(dt: number) {
    const inc = this.incident;
    if (!inc) return;
    inc.t += dt;
    const target = Math.min(44, Math.floor(inc.t / 0.07));
    while (inc.n < target) {
      inc.n++;
      const [x, y] = this.offscreenPoint(inc.a + inc.n * 0.45);
      this.addEnemy((['swarmer', 'swarmer', 'charger', 'exploder'] as ArchId[])[inc.n % 4], x, y);
    }
    if (inc.n >= 44) this.incident = null;
  }

  /** Stampede: warning arrows on the entry edge, then waves of runners straight across the screen. */
  private runStampede(dt: number) {
    const st = this.stampede;
    this.warnG.clear();
    if (!st) return;
    st.t -= dt;
    if (st.waves === 3 && st.t > 0 && Math.floor(st.t * 6) % 2 === 0) {
      // Flashing chevrons on the side the herd comes from.
      this.warnG.fillStyle(0xf87858, 1);
      for (let i = 1; i < 6; i++) {
        const ex = st.dx > 0 ? 8 : st.dx < 0 ? W - 8 : (W * i) / 6;
        const ey = st.dy > 0 ? 40 : st.dy < 0 ? H - 30 : (H * i) / 6;
        const ax = st.dx * 8, ay = st.dy * 8;
        const px = -st.dy * 7, py = st.dx * 7;
        this.warnG.fillTriangle(ex + ax, ey + ay, ex - ax + px, ey - ay + py, ex - ax - px, ey - ay - py);
      }
    }
    if (st.t > 0) return;
    const cam = this.cameras.main;
    const n = 12;
    const gap = this.R.int(2, n - 4);
    for (let i = 0; i < n; i++) {
      if (i === gap || i === gap + 1) continue; // always a way through
      const f = (i + 0.5) / n;
      const x = st.dx > 0 ? cam.worldView.x - 16 : st.dx < 0 ? cam.worldView.x + camW(cam) + 16 : cam.worldView.x + f * camW(cam);
      const y = st.dy > 0 ? cam.worldView.y - 16 : st.dy < 0 ? cam.worldView.y + camH(cam) + 16 : cam.worldView.y + f * camH(cam);
      const e = this.addEnemy('runner', x, y);
      if (e) { e.vx = st.dx; e.vy = st.dy; e.t = 9; e.s.setPosition(x, y); }
    }
    st.waves--;
    st.t = 0.9;
    if (st.waves <= 0) this.stampede = null;
  }

  private buildGrid() {
    for (const cell of this.grid.values()) cell.length = 0; // reuse cell arrays (no per-step allocation)
    for (const e of this.enemies) {
      const k = ((e.s.x >> 5) << 8) | (e.s.y >> 5);
      const cell = this.grid.get(k);
      if (cell) cell.push(e); else this.grid.set(k, [e]);
    }
  }

  /** Enemies within r of (x, y), via the 32px grid. */
  near(x: number, y: number, r: number): Enemy[] {
    const out: Enemy[] = [];
    for (let cx = (x - r - 24) >> 5; cx <= (x + r + 24) >> 5; cx++) {
      for (let cy = (y - r - 24) >> 5; cy <= (y + r + 24) >> 5; cy++) {
        const cell = this.grid.get((cx << 8) | cy);
        if (!cell) continue;
        for (const e of cell) {
          const dx = e.s.x - x, dy = e.s.y - y;
          if (e.alive && dx * dx + dy * dy <= (r + e.r) * (r + e.r)) out.push(e);
        }
      }
    }
    return out;
  }

  nearest(x: number, y: number, maxR = 400): Enemy | null {
    let best: Enemy | null = null, bd = maxR * maxR;
    for (const e of this.enemies) {
      if (!e.alive || e.arch === 'crate' || e.arch === 'runner' && e.t > 8.5 || e.reaper) continue;
      const d = (e.s.x - x) ** 2 + (e.s.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Heisenbugs are hidden unless close, scanned by Replay Vision, or you're a seer hoggie. */
  private visible(e: Enemy) {
    if (e.arch !== 'heisen') return true;
    if (this.trait === 'seer') return true;
    if ((e.hitAt.seen ?? 0) > this.elapsed) return true;
    return (e.s.x - this.player.x) ** 2 + (e.s.y - this.player.y) ** 2 < 75 * 75;
  }

  // ---------------------------------------------------------------- enemy behaviour
  private moveEnemies(dt: number) {
    const px = this.player.x, py = this.player.y;
    const sv = aura(this.weapons.get('surveys'), this.st);
    const sampling = this.pu.sampling > 0;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e) continue; // a blast earlier in this loop removed more than one bug
      if (e.boss) { e.slow = this.pu.freeze > 0 ? 0.5 : 1; this.moveBoss(e, dt); continue; }
      if (this.pu.freeze > 0 && !e.reaper) {
        // Feature Freeze: bugs hold still (knockback still lands); fuses, dashes and timers are paused.
        e.s.x += e.kx * dt; e.s.y += e.ky * dt;
        e.kx *= 0.86; e.ky *= 0.86;
        if (e.flash > 0) { e.flash -= dt * 1000; if (e.flash <= 0) this.restoreTint(e); }
        if (e.acc > 0) { e.accT -= dt; if (e.accT <= 0) this.flushNumber(e); }
        continue;
      }
      let dx = px - e.s.x, dy = py - e.s.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      e.slow = sv.r && d < sv.r + e.r ? sv.slow : 1;
      if ((e.hitAt.slowUntil ?? 0) > this.elapsed) e.slow = Math.min(e.slow, 0.6); // Heat Wave, Classifier scanners
      if (this.hasMod(e, 'regen')) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03 * dt);
      if (e.elite) this.eliteTick(e, dt);
      let mx = dx, my = dy, sp = e.speed;
      switch (e.arch) {
        case 'crate':
          sp = 0; mx = 0; my = 0;
          break;
        case 'runner':
          mx = e.vx; my = e.vy;
          e.t -= dt;
          if (e.t <= 0 || e.s.x < -40 || e.s.y < -40 || e.s.x > WORLD_W + 40 || e.s.y > WORLD_H + 40) { this.despawn(e, i); continue; }
          break;
        case 'exploder':
          if (e.mode === 0 && d < 30) { e.mode = 3; e.t = 0.8; this.sfx('fuse', 0.4, 120); }
          if (e.mode === 3) {
            sp = 0;
            e.t -= dt;
            if (e.flash <= 0) e.s.setTintFill(Math.floor(e.t * 12) % 2 ? 0xfcfcfc : 0xf83800);
            if (e.t <= 0) { this.explode(e); continue; }
          }
          break;
        case 'charger':
          e.t -= dt;
          if (e.mode === 0 && e.t <= 0 && d < 160) { e.mode = 1; e.t = 0.65; e.vx = dx; e.vy = dy; this.sfx('charge', 0.4, 150); }
          else if (e.mode === 1) { sp = 0; if (e.t <= 0) { e.mode = 2; e.t = 0.5; } }
          else if (e.mode === 2) { mx = e.vx; my = e.vy; sp = 240 * this.heatSpeed(); if (e.t <= 0) { e.mode = 0; e.t = Phaser.Math.FloatBetween(2.2, 3.4); } }
          break;
        case 'spitter':
          e.t -= dt;
          if (d < 100) { mx = -dx; my = -dy; sp *= 0.7; } else if (d < 150) { mx = -dy; my = dx; sp *= 0.5; }
          // Wind-up: the spitter blinks white for 0.4 s before it fires, so you see the shot coming.
          if (d < 230 && e.t > 0 && e.t < 0.4) { if (Math.floor(e.t * 20) % 2) e.s.setTintFill(0xfcfcfc); else this.restoreTint(e); }
          if (e.t <= 0 && d < 230) {
            e.t = Phaser.Math.FloatBetween(2.4, 3.2);
            this.restoreTint(e);
            this.shoot('boss_shot', e.s.x, e.s.y, dx * 70, dy * 70, 9 * this.ease(this.diff.dmg) * this.dmgScale(), 4, 1, 'spit', true);
            this.sfx('spit', 0.3, 120);
          }
          break;
        case 'nest':
          // Legacy Nest: a stationary factory of minis.
          sp = 0; mx = 0; my = 0;
          e.t -= dt;
          if (e.t <= 0) {
            e.t = 2.6;
            if (d < 420 && this.enemies.length < MAX_ENEMIES - 20) for (let k = 0; k < 2; k++) this.addEnemy('mini', e.s.x + Phaser.Math.Between(-10, 10), e.s.y + 8);
          }
          break;
        case 'flaky':
          // Flaky: blinks a short hop every so often, half visible.
          e.t -= dt;
          if (e.t <= 0) {
            e.t = Phaser.Math.FloatBetween(1.1, 2);
            const a = Math.atan2(dy, dx) + Phaser.Math.FloatBetween(-1, 1);
            e.s.x += Math.cos(a) * 36; e.s.y += Math.sin(a) * 36;
          }
          e.s.setAlpha(0.45 + 0.35 * Math.sin(this.elapsed * 9 + e.seed! * 10));
          break;
        case 'creep': {
          // Scope Creep: grows (and toughens) the longer it lives.
          const g0 = e.grow ?? 1;
          if (g0 < 2.2) {
            const g1 = Math.min(2.2, g0 + dt * 0.08);
            e.grow = g1;
            const b = e.base!;
            e.s.setScale(b.sc * g1); e.r = b.r * g1; e.dmg = b.dmg * g1;
            e.maxHp = b.hp * g1; e.hp += b.hp * (g1 - g0);
          }
          break;
        }
        case 'heisen':
          e.s.setAlpha(this.visible(e) ? 0.9 : 0.06);
          break;
        default: break;
      }
      if (e.reaper) {
        // The Reaper: never slows, never stops, keeps speeding up.
        e.speed = Math.min(210, e.speed + dt * 4);
        sp = e.speed; e.slow = 1; e.kx = 0; e.ky = 0;
      }
      if (sampling && e.seed! < 0.9 && !e.reaper && e.arch !== 'crate' && this.visible(e)) e.s.setAlpha(0.35);
      else if (e.arch !== 'flaky' && e.arch !== 'heisen' && e.s.alpha !== 1 && !e.reaper) e.s.setAlpha(1);
      // Separation from neighbours in the same cell keeps swarms readable.
      let sx = 0, sy = 0;
      const cell = this.grid.get(((e.s.x >> 5) << 8) | (e.s.y >> 5));
      if (cell && cell.length > 1 && e.mode !== 2 && e.arch !== 'crate' && e.arch !== 'nest') {
        for (const o of cell) {
          if (o === e) continue;
          const ox = e.s.x - o.s.x, oy = e.s.y - o.s.y;
          const od = ox * ox + oy * oy;
          const min = e.r + o.r;
          if (od < min * min && od > 0.01) { const f = (min - Math.sqrt(od)) / min; sx += ox * f; sy += oy * f; }
        }
      }
      const v = sp * (e.mode === 2 ? 1 : e.slow);
      e.s.x += (mx * v + e.kx + sx * 4) * dt;
      e.s.y += (my * v + e.ky + sy * 4) * dt;
      if (e.arch !== 'runner') {
        e.s.x = Phaser.Math.Clamp(e.s.x, 4, WORLD_W - 4);
        e.s.y = Phaser.Math.Clamp(e.s.y, 4, WORLD_H - 4);
      }
      e.kx *= 0.86; e.ky *= 0.86;
      if (!e.reaper) e.s.setFlipX(mx < 0);
      if (e.flash > -1000) {
        const was = e.flash;
        e.flash -= dt * 1000;
        if (was > 0 && e.flash <= 0 && e.mode !== 3) this.restoreTint(e);
      }
      if (e.acc > 0) { e.accT -= dt; if (e.accT <= 0) this.flushNumber(e); }
    }
  }

  /** Late elite modifiers: Memory Leak drips puddles, Flaky blinks, Swarming drops minis. */
  private eliteTick(e: Enemy, dt: number) {
    e.hitAt.eT = (e.hitAt.eT ?? 2) - dt;
    if (e.hitAt.eT > 0) return;
    e.hitAt.eT = 3;
    if (this.hasMod(e, 'leak') && this.puddles.length < 10) this.puddles.push({ x: e.s.x, y: e.s.y, r: 6, age: 5 });
    if (this.hasMod(e, 'flaky')) {
      const a = Math.random() * 6.28;
      e.s.x += Math.cos(a) * 50; e.s.y += Math.sin(a) * 50;
      burst(this, e.s.x, e.s.y, 0x00e8d8, 8, { speed: 80, gravity: 0 });
    }
    if (this.hasMod(e, 'swarm')) for (let k = 0; k < 3; k++) this.addEnemy('mini', e.s.x + Phaser.Math.Between(-12, 12), e.s.y + Phaser.Math.Between(-12, 12));
  }

  /** Charger telegraph lines and elite shields, drawn each frame. */
  private drawEnemyFx() {
    const g = this.fx;
    for (const e of this.enemies) {
      if (e.arch === 'charger' && e.mode === 1) {
        const on = Math.floor(e.t * 16) % 2 === 0;
        g.lineStyle(1, 0xf83800, on ? 0.9 : 0.4).lineBetween(e.s.x, e.s.y, e.s.x + e.vx * 110, e.s.y + e.vy * 110);
        if (on) e.s.setTintFill(0xf87858); else this.restoreTint(e);
      }
      if (e.arch === 'exploder' && e.mode === 3 && Math.floor(e.t * 10) % 2 === 0) {
        g.lineStyle(1, 0xf83800, 0.8).strokeCircle(e.s.x, e.s.y, 36);
      }
      if (e.elite === 'shield' || e.mod2 === 'shield') g.lineStyle(1, 0x78c8f8, 0.8).strokeCircle(e.s.x, e.s.y, e.r + 3);
      if (e.elite && Math.floor(this.time.now / 300) % 2) g.fillStyle(0xf8d878, 1).fillRect(e.s.x - 1, e.s.y - e.r - 6, 3, 3);
      if ((e.flagT ?? 0) > this.elapsed) g.fillStyle(0x3cbcfc, 1).fillTriangle(e.s.x - 1, e.s.y - e.r - 9, e.s.x - 1, e.s.y - e.r - 3, e.s.x + 4, e.s.y - e.r - 7);
      if (e.link && e.link.alive && e.arch === 'race' && e.seed! < e.link.seed!) g.lineStyle(1, 0xf85898, 0.35).lineBetween(e.s.x, e.s.y, e.link.s.x, e.link.s.y);
    }
  }

  private drawBlasts(dt: number) {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      const k = b.t / 0.25;
      if (k >= 1) { this.blasts.splice(i, 1); continue; }
      this.fx.fillStyle(k < 0.3 ? 0xfcfcfc : 0xf8b800, 0.6 * (1 - k)).fillCircle(b.x, b.y, b.r * (0.6 + 0.4 * k));
    }
  }

  private explode(e: Enemy) {
    const x = e.s.x, y = e.s.y, R = 36;
    burst(this, x, y, 0xf8b800, 22, { speed: 170, colours: [0xf83800, 0xfcfcfc] });
    this.blasts.push({ x, y, r: R, t: 0 });
    shake(this, 2, 120);
    this.sfx('explode', 0.35, 80);
    if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < R + 6) this.hurt(16 * this.diff.dmg * this.dmgScale(), 'blast');
    this.kill(e, false, true);
    // Chain reactions: the blast hurts other bugs too.
    for (const o of this.near(x, y, R)) if (o !== e && !o.boss) this.damage(o, 20, 0, 0, 'blast');
  }

  /** A burst of damage at a point (MRR v2.0 cannonballs, bomb-like effects). */
  blast(x: number, y: number, r: number, dmg: number, src: string) {
    this.blasts.push({ x, y, r, t: 0 });
    for (const o of this.near(x, y, r)) this.damage(o, dmg, 0, 0, src, true);
  }

  private despawn(e: Enemy, i: number) {
    e.alive = false;
    this.enemies.splice(i, 1);
    e.s.setActive(false).setVisible(false).stop();
    this.pool.push(e);
  }

  // ---------------------------------------------------------------- Data Moat
  /** The moat's level with patches (0 = not held). */
  private moatLv() { const l = this.passives.get('moat') ?? 0; return l ? l + 0.5 * (this.ppatch.get('moat') ?? 0) : 0; }
  /** Moat radius (0 when not held). */
  moatR() { const l = this.moatLv(); return l ? 30 + 3 * Math.min(l, 8) : 0; }
  private moatMax() { return 4 + 3 * this.moatLv(); }
  /** Spend water to block something; false when the moat is dry. */
  private moatBlock(cost: number) {
    if (!this.moatLv() || this.moat.fill < 1) return false;
    this.moat.fill = Math.max(0, this.moat.fill - cost);
    this.moat.calm = 0;
    return true;
  }

  /** Data Moat: small bugs that reach the ring are shoved back out and nicked, each block costs water, and a dry moat
   * lets everything through until it refills (starts a second after the last block). Bosses and Nohog wade across. */
  private tickMoat(dt: number) {
    const lv = this.moatLv();
    if (!lv) return;
    const m = this.moat, max = this.moatMax(), R = this.moatR(), p = this.player;
    if (lv > m.lv) { m.lv = lv; m.fill = max; } // a new level fills it to the brim
    m.calm += dt;
    if (m.calm > 1) m.fill = Math.min(max, m.fill + (0.8 + 0.4 * lv) * dt);
    if (m.fill < 1 || this.interlude) return;
    for (const e of this.near(p.x, p.y, R + 12)) {
      if (e.boss || e.twin || e.reaper || e.arch === 'crate' || !e.alive) continue;
      const dx = e.s.x - p.x, dy = e.s.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      if ((e.hitAt.moat ?? 0) <= this.elapsed) {
        if (!this.moatBlock(e.elite ? 2 : 1)) return;
        e.hitAt.moat = this.elapsed + 0.6;
        this.damage(e, 6 + 3 * lv, (dx / d) * 180, (dy / d) * 180, 'moat', true);
        if (!e.alive) continue;
      }
      e.s.x = p.x + (dx / d) * (R + 1); e.s.y = p.y + (dy / d) * (R + 1);
      if (e.mode === 2) e.mode = 0; // a dash ends at the water
    }
  }

  /** The moat: a water ring whose width and brightness show how full it is; a faint dashed ring when dry. */
  private drawMoat() {
    const g = this.moatG;
    g.clear();
    const R = this.moatR();
    if (!R) return;
    const p = this.player, f = this.moat.fill / this.moatMax(), t = this.time.now;
    if (this.moat.fill < 1) {
      for (let i = 0; i < 16; i += 2) g.lineStyle(1, 0x3cbcfc, 0.3).beginPath().arc(p.x, p.y, R, (i / 16) * 6.283, ((i + 1) / 16) * 6.283).strokePath();
      return;
    }
    g.lineStyle(2 + 4 * f, 0x0078f8, 0.25 + 0.3 * f).strokeCircle(p.x, p.y, R);
    g.lineStyle(1, 0xa4e4fc, 0.4 + 0.4 * f).strokeCircle(p.x, p.y, R + Math.sin(t / 300) * 1.5);
  }

  // ---------------------------------------------------------------- damage
  /** Weapon version multiplier: patches (x1.12 each) and the v2.0 major. */
  wMul(src: string) {
    const w = this.weapons.get(src as WeaponId);
    return w ? PATCH_MUL ** w.patch * (w.major ? MAJOR.dmg : 1) : 1;
  }

  /** `quiet` = no crit roll and no hit sound; `raw` = exact damage (no might, armour or multipliers: exports, deletes). */
  damage(e: Enemy, dmg: number, kx = 0, ky = 0, src = '', quiet = false, raw = false) {
    if (!e.alive) return;
    let d: number, crit = false;
    if (raw) {
      d = dmg;
    } else {
      crit = !quiet && Math.random() < this.st.crit;
      d = dmg * this.st.might * this.wMul(src) * e.armour * (1 + this.st.vuln) * (crit ? this.st.critMul : 1);
      if ((e.flagT ?? 0) > this.elapsed) d *= 1.4;
      if (this.pu.sampling > 0 && e.seed! < 0.9) d *= 2;
      if (e.boss) d *= this.bossVuln() * this.bossArmour(e);
      if (e.reaper) d *= 0.2;
    }
    d = Math.min(d, Math.max(0, e.hp) + 1);
    e.hp -= d;
    this.dmgBy[src] = (this.dmgBy[src] ?? 0) + d;
    if (src !== 'debug' && src !== 'hotfix') this.dmgAcc += d;
    if (src !== 'batch_exports') batchTag(this, e, d);
    if (e.boss && this.bossAffixes.includes('monolith')) this.plateHit(e, d);
    if (crit) this.run.crits++;
    // Flash white on hit; the boss is hit constantly, so it only blinks every so often. In a crowd only elites and bosses
    // flash: a swarm of white silhouettes hides everything else.
    const flash = this.enemies.length < CROWD || e.elite || e.boss || e.twin;
    if (flash && e.mode !== 3 && (!e.boss || e.flash < -120)) { e.flash = 70; e.s.setTintFill(0xffffff); }
    if (!e.boss && !e.reaper) { e.kx += kx * e.kb; e.ky += ky * e.kb; }
    if (this.numbers && d >= 1) {
      if (e.acc === 0) e.accT = e.boss ? 0.4 : 0.25;
      e.acc += d;
      e.accCrit ||= crit;
    }
    // Default to Transparency: weak bugs die on the next hit.
    if (e.hp > 0 && !e.boss && !e.twin && !e.reaper && this.releases.has('transparency') && e.hp < e.maxHp * 0.12) e.hp = 0;
    if (e.hp <= 0) {
      this.kill(e, crit, false, src);
    } else {
      this.sfx(crit ? 'crit' : 'hit', 0.5, 60);
      // Do More Weird: now and then a hit makes a random weapon fire right away.
      const weird = this.passives.get('weird');
      if (weird && !quiet && this.weirdT < this.elapsed && Math.random() < 0.03 * weird) {
        this.weirdT = this.elapsed + 0.4;
        const ws = [...this.weapons.values()];
        const w = ws[Math.floor(Math.random() * ws.length)];
        if (w) w.timer = 0;
      }
    }
  }

  /** Merged damage numbers: one per bug per quarter second, within a global budget. */
  private flushNumber(e: Enemy) {
    const v = Math.round(e.acc);
    const crit = e.accCrit;
    e.acc = 0; e.accCrit = false;
    if (!this.numbers || v < 1 || this.numBudget < 1) return;
    // A crowded screen shows only crits, bosses and elites, and hits well above the usual (at half the usual rate).
    const big = v >= this.numAvg * 3;
    this.numAvg = this.numAvg ? this.numAvg * 0.95 + v * 0.05 : v;
    const crowded = this.enemies.length >= CROWD;
    if (crowded && !(crit || big || e.boss || e.elite)) return;
    this.numBudget -= crowded ? 2 : 1;
    const label = v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1000)}K` : `${v}`;
    floatText(this, e.s.x + Phaser.Math.Between(-3, 3), e.s.y - e.r - 6, crit ? `${label}!` : label, crit ? 0xf8d878 : 0xfcfcfc, crit ? 0.8 : 0.55);
  }

  kill(e: Enemy, crit = false, blast = false, src = '') {
    if (!e.alive) return;
    e.alive = false;
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    if (e.acc > 0) this.flushNumber(e);
    const cols = this.popCols[e.type] ?? [K.ui.accentInt];
    const big = e.boss || e.elite || e.arch === 'tank' || e.twin;
    burst(this, e.s.x, e.s.y, cols[0], e.boss ? 60 : e.elite || e.twin ? 30 : big ? 12 : 7,
      { colours: [...cols.slice(1), 0xfcfcfc], speed: e.boss ? 200 : e.elite ? 150 : 100 });
    if (e.boss) { this.bossDown(e); return; }
    e.s.setActive(false).setVisible(false).stop();
    if (e.arch === 'crate') { this.pool.push(e); this.crateLoot(e.s.x, e.s.y); return; }
    if (e.reaper) { this.reaperDown(e); return; }
    this.kills++;
    if (AI_SRC.has(src)) this.run.aiKills++;
    this.sfx('kill', 0.5, 50);
    if (e.twin) {
      this.banner('FORK MERGED', 'One less race condition');
      if (this.bossWaiting) { this.bossWaiting = false; this.waveClear(); }
    }
    if (e.elite) {
      this.run.elites++;
      hitstop(this, 70);
      shake(this, 3, 160);
      this.dropItem('chest', e.s.x, e.s.y);
      for (let k = 0; k < 4; k++) this.dropItem('coin', e.s.x + Phaser.Math.Between(-12, 12), e.s.y + Phaser.Math.Between(-12, 12));
      this.maybePowerup(e.s.x + 14, e.s.y, this.wave >= 2 ? 0.5 : 0.15);
      if (this.wave >= 3 && this.RD.next() < 0.03 * this.st.luck) this.dropRelic(e.s.x - 12, e.s.y);
      if (this.hasMod(e, 'dlq')) for (let k = 0; k < 5; k++) this.addEnemy('swarmer', e.s.x + Phaser.Math.Between(-16, 16), e.s.y + Phaser.Math.Between(-16, 16));
    } else if (crit && big) {
      hitstop(this, 35);
    }
    if (e.arch === 'splitter') {
      for (const s of [-1, 1]) {
        const m = this.addEnemy('mini', e.s.x + s * 6, e.s.y + s * 3);
        if (m) { m.kx = s * 120; m.ky = Phaser.Math.Between(-60, 60); }
      }
    }
    if (e.arch === 'regression' && !e.hitAt.reg && Math.random() < 0.3) {
      // Regression: it comes back. Once.
      const x = e.s.x, y = e.s.y;
      this.time.delayedCall(900, () => {
        if (this.won || this.interlude) return;
        const r = this.addEnemy('regression', x, y);
        if (r) { r.hitAt.reg = 1; r.hp *= 0.6; floatText(this, x, y - 12, "IT'S BACK", 0xd8b8f8, 0.6); }
      });
    }
    if (e.arch === 'nest' && this.RD.next() < 0.35) this.dropItem('chest', e.s.x, e.s.y);
    if (e.arch === 'race' && e.link?.alive) {
      // The partner has 2 s to die too, or it enrages.
      const o = e.link, seed = o.seed;
      o.link = null;
      this.time.delayedCall(2000, () => {
        if (!o.alive || o.seed !== seed) return; // dead, or the pooled object is a new bug now
        o.speed *= 2; o.dmg *= 1.5; o.tint = 0xf83800; this.restoreTint(o);
        floatText(this, o.s.x, o.s.y - 12, 'RACE LOST', 0xf83800, 0.6);
      });
    }
    if (this.pu.webhook > 0 && this.projs.length < 250) {
      // Webhook: every kill fires a bolt at the next bug.
      const t = this.nearest(e.s.x, e.s.y, 180);
      if (t) {
        const a = Math.atan2(t.s.y - e.s.y, t.s.x - e.s.x);
        const pr = this.shoot('ai_bolt', e.s.x, e.s.y, Math.cos(a) * 260, Math.sin(a) * 260, 25 * (1 + 0.3 * this.wave), 1, 1, 'webhook');
        pr.homing = t; pr.speed = 260; pr.s.setTint(0xfca044);
      }
    }
    if (this.trait === 'reaper' && Math.random() < 0.01) this.reap();
    if (this.releases.has('freetier') && this.kills % 1000 === 0) this.dropItem('chest', e.s.x, e.s.y);
    if (e.arch !== 'runner' || !blast) this.dropLoot(e);
    this.pool.push(e); // last: the splitter's minis must not reuse this object before its loot is dropped
  }

  /** Reaper hoggie: every bug on screen under 20% HP is reaped. */
  private reap() {
    const cam = this.cameras.main;
    let n = 0;
    for (const o of [...this.enemies]) {
      if (o.boss || o.twin || o.reaper || o.arch === 'crate' || o.hp > o.maxHp * 0.2) continue;
      if (o.s.x < cam.worldView.x || o.s.x > cam.worldView.x + camW(cam) || o.s.y < cam.worldView.y || o.s.y > cam.worldView.y + camH(cam)) continue;
      n++;
      this.damage(o, o.hp + 1, 0, 0, 'reaper', true, true);
    }
    if (n) floatText(this, this.player.x, this.player.y - 26, `REAPED ${n}`, 0xbcbcbc, 0.8);
  }

  private crateLoot(x: number, y: number) {
    burst(this, x, y, 0xac7c00, 12, { colours: [0x503000, 0xf8d878] });
    this.sfx('hit', 0.6);
    const r = this.RD.next() / this.st.luck;
    const heal = this.heat >= 4 ? 0.5 : 1;
    if (this.wave >= 6 && this.RD.next() < 0.03) { this.dropPage(x, y); return; }
    if (r < 0.4 * heal) this.dropItem('food', x, y);
    else if (r < 0.52) this.dropItem('vacuum', x, y);
    else if (r < 0.58) this.dropItem('hotfix', x, y);
    else if (r < 0.58 + (this.wave >= 2 ? 0.12 : 0.04) && this.powerCount() < 2) this.dropItem(this.rollPowerup(), x, y);
    else for (let k = 0; k < 3; k++) this.dropItem('coin', x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-8, 8));
  }

  /** Crates to break and tech-debt puddles that spread and slow the hog. */
  private runHazards(dt: number) {
    const H_ = HAZARDS, p = this.player;
    const puddly = this.waveMods.includes('puddles');
    this.hazT.crate -= dt;
    if (this.hazT.crate <= 0) {
      this.hazT.crate = H_.crateEvery;
      if (this.enemies.filter((e) => e.arch === 'crate').length < H_.crateMax) {
        const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(110, 180);
        this.addEnemy('crate', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
      }
    }
    this.hazT.puddle -= dt;
    if (this.hazT.puddle <= 0) {
      this.hazT.puddle = H_.puddleEvery / (puddly ? 2 : 1);
      if (this.puddles.length < H_.puddleMax * (puddly ? 2 : 1)) {
        const a = this.R.next() * Math.PI * 2, d = 120 + this.R.next() * 80;
        this.puddles.push({ x: Phaser.Math.Clamp(p.x + Math.cos(a) * d, 40, WORLD_W - 40), y: Phaser.Math.Clamp(p.y + Math.sin(a) * d, 40, WORLD_H - 40), r: 6, age: 0 });
      }
    }
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const q = this.puddles[i];
      q.age += dt;
      const max = H_.puddleR + this.heat * 3;
      q.r = q.age < H_.puddleGrow ? 6 + (max - 6) * (q.age / H_.puddleGrow) : q.age > H_.puddleLife - 3 ? max * Math.max(0, (H_.puddleLife - q.age) / 3) : max;
      if (q.age >= H_.puddleLife) this.puddles.splice(i, 1);
    }
  }

  /** Player speed factor from puddles (1 = dry). */
  private puddleSlow() {
    const p = this.player;
    for (const q of this.puddles) if ((p.x - q.x) ** 2 + ((p.y - q.y) * 1.5) ** 2 < q.r * q.r) return HAZARDS.puddleSlow;
    return 1;
  }

  private drawHazards() {
    const g = this.hazG;
    g.clear();
    for (const q of this.puddles) {
      g.fillStyle(0x305010, 0.75).fillEllipse(q.x, q.y, q.r * 2, q.r * 1.33);
      g.fillStyle(0x587818, 0.8).fillEllipse(q.x - q.r * 0.2, q.y - q.r * 0.1, q.r * 1.2, q.r * 0.7);
      // A few bubbles that pop in and out.
      for (let k = 0; k < 3; k++) {
        const t = (this.time.now / 700 + k * 0.37 + q.x * 0.01) % 1;
        if (t < 0.6) g.fillStyle(0x98b838, 1).fillRect(Math.round(q.x + Math.cos(k * 2.1 + q.y) * q.r * 0.5), Math.round(q.y + Math.sin(k * 2.1 + q.x) * q.r * 0.3), 2, 2);
      }
    }
    if (this.waveMods.includes('freeze')) {
      // Code Freeze: a frosty sheen.
      const cam = this.cameras.main;
      g.fillStyle(0xa4e4fc, 0.06).fillRect(cam.worldView.x, cam.worldView.y, camW(cam), camH(cam));
    }
  }

  private dropLoot(e: Enemy) {
    const R = this.RD, L = this.st.luck;
    this.dropGem(e.s.x, e.s.y, e.xp * this.xpScale());
    const healMul = this.heat >= 4 ? 0.5 : 1;
    const small = e.arch === 'swarmer' || e.arch === 'mini' || e.arch === 'runner';
    const roll = R.next();
    const has = (k: ItemKind) => this.items.some((it) => it.kind === k);
    if (roll < (small ? 0.006 : 0.025) * L * healMul) this.dropItem('food', e.s.x, e.s.y);
    else if (roll < 0.04 * L) this.dropItem('coin', e.s.x + 4, e.s.y);
    else if (roll < 0.043 * L && !has('vacuum') && this.elapsed > 30) this.dropItem('vacuum', e.s.x, e.s.y);
    else if (roll < 0.0455 * L && !has('hotfix') && this.elapsed > 45) this.dropItem('hotfix', e.s.x, e.s.y);
    else if (roll < 0.0455 * L + (this.wave >= 2 ? 0.0012 : 0.0005) && this.elapsed > 60 && this.powerCount() < 1) {
      this.dropItem(this.rollPowerup(), e.s.x, e.s.y);
    }
  }

  // ---------------------------------------------------------------- lore drops
  dropRelic(x: number, y: number) {
    const left = RELIC_IDS.filter((r) => !this.relics.has(r) && !this.items.some((it) => it.kind === 'relic' && it.data === r));
    if (!left.length) return;
    this.dropItem('relic', x, y, false, this.RD.pick(left));
  }
  dropPage(x: number, y: number, n?: number) {
    const sv = save();
    const idx = n ?? PAGES.findIndex((_, i) => !sv.pages.includes(i));
    if (idx < 0 || idx >= PAGES.length || sv.pages.includes(idx) || this.items.some((it) => it.kind === 'page' && it.data === idx)) return;
    this.dropItem('page', x, y, false, idx);
  }

  // ---------------------------------------------------------------- powerups
  powerCount() { return this.items.filter((it) => isPower(it.kind)).length; }

  rollPowerup(exclude: PowerId[] = []): PowerId {
    const ok = POWER_IDS.filter((k) => (POWERUPS[k].from ?? 1) <= this.wave && !exclude.includes(k));
    let x = this.RD.next() * ok.reduce((a, k) => a + POWERUPS[k].weight, 0);
    for (const k of ok) { x -= POWERUPS[k].weight; if (x <= 0) return k; }
    return 'autopilot';
  }

  private maybePowerup(x: number, y: number, chance: number) {
    if (this.powerCount() < 2 && this.RD.next() < chance * this.st.luck) this.dropItem(this.rollPowerup(), x, y);
  }

  activatePowerup(kind: PowerId) {
    const P = POWERUPS[kind], p = this.player;
    const secs = P.secs * this.st.dur;
    this.run.powerups++;
    if (this.run.powerups >= 25) this.earn('demand-gen');
    capture('powerup', { kind, t: Math.round(this.elapsed), wave: this.wave });
    this.banner(P.name, P.line);
    floatText(this, p.x, p.y - 22, P.name, P.col, 1);
    burst(this, p.x, p.y, P.col, 24, { speed: 160, gravity: 0, colours: [0xfcfcfc] });
    this.sfx('evolve', 0.6);
    switch (kind) {
      case 'autopilot': this.pu.autopilot = secs; break;
      case 'freeze':
        this.pu.freeze = secs;
        for (const e of this.enemies) this.restoreTint(e);
        this.cameras.main.flash(180, 200, 240, 255);
        break;
      case 'shipit': this.pu.shipit = secs; this.recalc(); break;
      case 'webhook': this.pu.webhook = secs; break;
      case 'party': this.pu.party = secs; this.pullGems(p.x, p.y, 9999); this.items.forEach((o) => { if (o.kind === 'coin') o.pull = true; }); break;
      case 'hogzilla': this.pu.hogzilla = secs; this.player.setFrame(this.hogArtFrame()); break;
      case 'troop': this.pu.troop = secs; break;
      case 'sampling': this.pu.sampling = secs; break;
      case 'killswitch': this.killSwitch(); break;
      case 'cmdk': this.openCmdK(); break;
      default: {
        // Rewind: HP back to where it was 5 s ago (at least +15), a beat of invulnerability, and a replay of the path.
        const past = this.hist[0];
        const to = Math.min(this.st.maxHp, Math.max(past?.hp ?? this.hp, this.hp + 15));
        if (to > this.hp) floatText(this, p.x, p.y - 32, `+${Math.round(to - this.hp)}`, 0x58d854);
        this.hp = to;
        this.invuln = Math.max(this.invuln, P.secs);
        this.hist.forEach((h, i) => {
          if (i % 3) return;
          const ghost = this.add.sprite(h.x, h.y, HOG32, this.hogArtFrame()).setOrigin(0.5, 0.72).setDepth(9)
            .setAlpha(0.15 + (i / this.hist.length) * 0.35).setTint(0xf8d878);
          this.tweens.add({ targets: ghost, alpha: 0, duration: 700, delay: (this.hist.length - i) * 25, onComplete: () => ghost.destroy() });
        });
      }
    }
  }

  /** Kill Switch: the most common kind of bug on screen is switched off. */
  private killSwitch() {
    const cam = this.cameras.main;
    const on = this.enemies.filter((e) => !e.boss && !e.twin && !e.reaper && e.arch !== 'crate' && e.s.x > cam.worldView.x && e.s.x < cam.worldView.x + camW(cam)
      && e.s.y > cam.worldView.y && e.s.y < cam.worldView.y + camH(cam));
    const count = new Map<string, number>();
    for (const e of on) count.set(e.arch, (count.get(e.arch) ?? 0) + 1);
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top) return;
    for (const e of on) if (e.arch === top[0]) this.damage(e, e.hp + 1, 0, 0, 'killswitch', true, true);
    this.cameras.main.flash(150, 88, 216, 84);
    floatText(this, this.player.x, this.player.y - 34, `${top[1]} ${top[0].toUpperCase()}S OFF`, 0x58d854, 0.8);
  }

  private tickPowerups(dt: number) {
    const pu = this.pu, p = this.player;
    this.histT -= dt;
    if (this.histT <= 0) {
      this.histT = 0.25;
      this.hist.push({ hp: this.hp, x: p.x, y: p.y });
      if (this.hist.length > 20) this.hist.shift();
    }
    if (pu.autopilot > 0) {
      pu.autopilot -= dt;
      if (Math.floor(this.elapsed * 12) !== Math.floor((this.elapsed - dt) * 12)) {
        burst(this, p.x - this.facing.x * 8, p.y + 6, 0x3cbcfc, 2, { speed: 30, gravity: 0, life: 0.4, size: 1 });
      }
      if (pu.autopilot <= 0) {
        floatText(this, p.x, p.y - 22, 'BACK TO YOU', 0xfcfcfc, 0.8);
        this.invuln = Math.max(this.invuln, 0.6);
        this.earn('self-driving');
      }
    }
    if (pu.freeze > 0) {
      pu.freeze -= dt;
      if (pu.freeze <= 0) for (const e of this.enemies) this.restoreTint(e);
    }
    if (pu.shipit > 0) {
      pu.shipit -= dt;
      if (pu.shipit <= 0) this.recalc();
    }
    for (const k of ['webhook', 'party', 'troop', 'sampling'] as const) if (pu[k] > 0) pu[k] -= dt;
    if (pu.hogzilla > 0) {
      pu.hogzilla -= dt;
      if (pu.hogzilla <= 0) this.player.setFrame(this.hogArtFrame());
    }
  }

  // ---------------------------------------------------------------- gems, items, xp
  private dropGem(x: number, y: number, v: number) {
    if (this.gems.length >= MAX_GEMS) {
      this.gems[Math.floor(Math.random() * this.gems.length)].v += v;
      return;
    }
    const s = this.add.image(x, y, spr('gem')).setDepth(3);
    // Ingestion Lag: gems take 2 s to show up.
    const lag = this.waveMods.includes('inglag') ? 2 : 0;
    if (lag) s.setAlpha(0.25);
    const g = { s, v, pull: false, t: -lag };
    this.tintGem(g);
    this.gems.push(g);
  }

  /** A gem's look follows its worth: blue, green, pink, then a bigger gold one (merged gems get there). */
  private tintGem(g: { s: Phaser.GameObjects.Image; v: number }) {
    const rel = g.v / this.xpScale();
    if (rel >= 20) g.s.setTint(0xf8d878).setScale(1.4);
    else if (rel >= 5) g.s.setTint(0xf878f8).setScale(rel >= 10 ? 1.2 : 1);
    else if (rel >= 2) g.s.setTint(0x58d854);
  }

  /** A crowded floor: gems lying close together melt into one worth the lot, so the XP stays but the clutter goes. */
  private mergeGems() {
    const gs = this.gems, R2 = 22 * 22;
    for (let i = 0; i < gs.length; i++) {
      const a = gs[i];
      if (a.pull || a.t < 0) continue;
      let merged = false;
      for (let j = gs.length - 1; j > i; j--) {
        const b = gs[j];
        if (b.pull || b.t < 0 || (a.s.x - b.s.x) ** 2 + (a.s.y - b.s.y) ** 2 > R2) continue;
        a.v += b.v;
        b.s.destroy();
        gs.splice(j, 1);
        merged = true;
      }
      if (merged) this.tintGem(a);
    }
  }

  /** Every gem within r of (x, y) flies to the hog (Summarizer scanners, Party Mode). */
  pullGems(x: number, y: number, r: number) {
    for (const g of this.gems) if ((g.s.x - x) ** 2 + (g.s.y - y) ** 2 < r * r) g.pull = true;
  }

  dropItem(kind: ItemKind, x: number, y: number, big = false, data?: string | number) {
    if (this.items.length >= MAX_ITEMS) {
      const old = this.items.findIndex((it) => it.kind === 'coin');
      if (old < 0 || kind === 'coin') return;
      this.items[old].s.destroy();
      this.items.splice(old, 1);
    }
    const cx = Phaser.Math.Clamp(x, 10, WORLD_W - 10), cy = Phaser.Math.Clamp(y, 10, WORLD_H - 10);
    let s: Phaser.GameObjects.Image;
    if (isPower(kind)) {
      const [key, frame] = this.iconOf('power', kind);
      s = this.add.image(cx, cy, key, frame).setDisplaySize(16, 16);
    } else {
      s = this.add.image(cx, cy, spr(kind === 'relic' ? 'merch' : kind));
    }
    // Pickups draw above the bugs (below their shots), so a chest or powerup is never hidden under a swarm. Coins and snacks stay low.
    s.setDepth(kind === 'coin' || kind === 'food' ? 3 : 11.3);
    if (big) s.setScale(1.5).setTint(0xf8d878);
    else if (kind === 'food') s.setScale(1.1);
    // A little hop so drops read as drops; powerups and lore keep bobbing so they stand out on the floor.
    this.tweens.add({ targets: s, y: s.y - 8, duration: 140, yoyo: true, ease: 'Quad.Out' });
    if (isPower(kind) || kind === 'relic' || kind === 'page') {
      this.tweens.add({ targets: s, y: s.y - 3, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 300 });
    }
    this.items.push({ s, kind, pull: false, big, data });
  }

  private moveGems(dt: number) {
    this.mergeT -= dt;
    if (this.gems.length > 80 && this.mergeT <= 0) { this.mergeT = 0.5; this.mergeGems(); }
    const px = this.player.x, py = this.player.y, mag = this.st.magnet;
    const ingest = this.releases.has('ingestion');
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.t += dt;
      if (g.t < 0) continue; // ingestion lag
      if (g.s.alpha < 1) g.s.setAlpha(1);
      const dx = px - g.s.x, dy = py - g.s.y, d = Math.hypot(dx, dy);
      if (d < mag || (ingest && g.t > 3)) g.pull = true;
      if (g.pull) {
        const sp = (d > 120 ? 420 : 200) * dt;
        g.s.x += (dx / (d || 1)) * Math.min(sp, d);
        g.s.y += (dy / (d || 1)) * Math.min(sp, d);
      }
      if (d < 9) {
        g.s.destroy();
        this.gems.splice(i, 1);
        this.run.gems++;
        this.gainXp(g.v);
      }
    }
    if (this.run.gems >= 5000) this.earn('ingestion');
  }

  private moveItems(dt: number) {
    const p = this.player, mag = this.st.magnet;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it) continue;
      const dx = p.x - it.s.x, dy = p.y - it.s.y, d = Math.hypot(dx, dy);
      if (it.kind === 'coin' && d < mag) it.pull = true;
      if (it.pull) {
        const sp = 220 * dt;
        it.s.x += (dx / (d || 1)) * Math.min(sp, d);
        it.s.y += (dy / (d || 1)) * Math.min(sp, d);
      }
      if (it.kind === 'chest') it.s.setFrame(Math.floor(this.time.now / 250) % 2);
      if ((it.kind === 'chest' || it.kind === 'cmdk') && this.modal) continue; // one modal at a time
      if (d < (it.kind === 'chest' ? 14 : 10)) {
        it.s.destroy();
        this.items.splice(i, 1);
        this.collect(it);
      }
    }
  }

  private collect(it: Item) {
    if (this.over) return;
    const p = this.player;
    switch (it.kind) {
      case 'coin': {
        const v = Math.max(1, Math.round((1 + this.heat * 0.1) * this.st.gold * (it.big ? 10 : 1) * (this.yolo ? YOLO.gold : 1)));
        this.goldGrabbed += v;
        if (this.trait === 'burning' || this.releases.has('burning')) {
          // Burning Money: the coin becomes a fireball.
          const t = this.nearest(p.x, p.y, 220);
          if (t) {
            const a = Math.atan2(t.s.y - p.y, t.s.x - p.x);
            const pr = this.shoot('homing', p.x, p.y, Math.cos(a) * 240, Math.sin(a) * 240, 40 + 15 * this.wave, 1.5, 3, 'burning');
            pr.homing = t; pr.speed = 240; pr.s.setTint(0xf83800);
          }
          this.sfx('shoot', 0.4, 50);
          break;
        }
        this.gold += v;
        this.sfx('coin', 0.4, 50);
        punchText(this.hud.gold);
        break;
      }
      case 'food': {
        const heal = Math.max(HEAL_AMOUNT, Math.round(this.st.maxHp * HEAL_FRAC));
        this.hp = Math.min(this.st.maxHp, this.hp + heal);
        floatText(this, p.x, p.y - 18, `+${heal}`, 0x58d854);
        this.sfx('food', 0.6);
        break;
      }
      case 'vacuum':
        // Every gem on the map flies in.
        this.gems.forEach((g) => (g.pull = true));
        this.items.forEach((o) => { if (o.kind === 'coin') o.pull = true; });
        burst(this, p.x, p.y, 0x3cbcfc, 16, { speed: 140, gravity: 0 });
        this.sfx('vacuum', 0.8);
        break;
      case 'hotfix': this.hotfix(); break;
      case 'chest': this.openChest(it.big); break;
      case 'relic': {
        const r = it.data as RelicId;
        this.relics.add(r);
        const sv = save();
        if (!sv.relics.includes(r)) { sv.relics.push(r); persist(); }
        if (RELIC_IDS.every((x) => sv.relics.includes(x))) this.earn('warehouse-sources');
        if (r === 'cards') this.rerolls++;
        this.banner(`MERCH: ${RELICS[r].name}`, RELICS[r].line);
        this.sfx('chest', 0.7);
        this.recalc();
        break;
      }
      case 'page': {
        const n = it.data as number;
        const sv = save();
        if (!sv.pages.includes(n)) { sv.pages.push(n); persist(); }
        this.banner(`HANDBOOK: ${PAGES[n][0].toUpperCase()}`, PAGES[n][1]);
        this.sfx('select', 0.8);
        if (sv.pages.length >= 10) this.earn('conversations');
        if (sv.pages.length >= PAGES.length) this.earn('editorial');
        break;
      }
      default: if (isPower(it.kind)) this.activatePowerup(it.kind);
    }
  }

  /** Screen-clearing bomb: every bug on screen is squashed; the boss takes a chip. */
  hotfix() {
    const cam = this.cameras.main;
    this.run.hotfixes++;
    this.sfx('bomb', 0.9);
    cam.flash(250, 255, 255, 255);
    shake(this, 6, 350);
    hitstop(this, 90);
    for (const e of [...this.enemies]) {
      const onScreen = e.s.x > cam.worldView.x - 8 && e.s.x < cam.worldView.x + camW(cam) + 8 && e.s.y > cam.worldView.y - 8 && e.s.y < cam.worldView.y + camH(cam) + 8;
      if (!onScreen || e.reaper) continue;
      if (e.boss || e.twin) this.damage(e, e.maxHp * 0.06, 0, 0, 'hotfix', true, true);
      else this.damage(e, e.hp + 1, 0, 0, 'hotfix', true, true);
    }
  }

  gainXp(v: number) {
    this.sfx(this.pendingLevels ? 'gem3' : this.xp > this.xpNext * 0.6 ? 'gem2' : 'pickup', 0.4, 45);
    this.xp += v * this.st.growth;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpFor(this.level);
      if (!this.holdLevels) this.pendingLevels++;
      if (this.level >= 100) this.earn('growth');
    }
  }

  // ---------------------------------------------------------------- level-up
  private levelFanfare() {
    const p = this.player;
    if (this.yolo) { this.yoloPick(); return; }
    this.slowmo = 0.4;
    this.sfx('levelup');
    burst(this, p.x, p.y, K.ui.accentInt, 26, { speed: 170, gravity: 0, colours: [0xfcfcfc, 0xf8d878] });
    floatText(this, p.x, p.y - 22, 'LEVEL UP!', K.ui.accentInt, 0.9);
  }

  /** YOLO: no pause. PostHog AI picks the card instantly, with commentary. */
  private yoloPick() {
    while (this.pendingLevels > 0) {
      this.pendingLevels--;
      const cards = drawCards(this.build(), () => this.RC.next());
      const c = this.RC.next() < 0.7 ? cards.reduce((a, b) => (botRank(b, this.build()) > botRank(a, this.build()) ? b : a)) : this.RC.pick(cards);
      this.applyCard(c);
      this.onLevelApplied();
      const line = this.RC.pick(YOLO_SNARK).replace('{c}', this.cardName(c));
      floatText(this, this.player.x, this.player.y - 30, line, 0x3cbcfc, 0.7);
    }
    this.sfx('levelup', 0.5, 200);
  }

  private cardName(c: Card) {
    if (c.kind === 'weapon' || c.kind === 'major') return productName(c.id);
    if (c.kind === 'passive') return PASSIVES[c.id as PassiveId].name;
    if (c.kind === 'release') return RELEASES[c.id as ReleaseId].name;
    return c.kind === 'heal' ? 'a snack' : 'gold';
  }

  private onLevelApplied() {
    onLevelUpSys(this);
    if (this.releases.has('clickhouse')) this.hp = Math.min(this.st.maxHp, this.hp + 5);
  }

  openLevelUp(cards?: Card[], kind: 'levelup' | 'release' | 'cmdk' = 'levelup', keep?: Keep) {
    if (!cards) this.pendingLevels--;
    this.modal?.objs.forEach((o) => o.destroy());
    cards ??= drawCards(this.build(), () => this.RC.next());
    const hand = cards;
    const rel = kind === 'release', cmd = kind === 'cmdk';
    hooks.state = rel ? 'release' : kind;
    const ui = K.ui, narrow = NARROW();
    const objs: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { objs.push(o); return o; };
    const T = (x: number, y: number, str: string, opts: Parameters<typeof text>[4]) => add(text(this, x, y, str, { fixed: true, depth: UI + 102, ...opts }));
    this.showBanner(false);
    add(this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setName('fill').setOrigin(0).setScrollFactor(0).setDepth(UI + 100));
    const title = rel ? 'SHIP A RELEASE' : cmd ? 'CMD+K' : 'LEVEL UP!';
    const sub = rel ? `Wave ${this.wave + 1}: ${this.waveName(this.wave + 1)} is next. Pick one, free` : cmd ? 'Run any powerup' : 'Pick a PostHog product or upgrade';
    const partners = partnersOf(this.build());
    const rects: Rect[] = [], btns: (Rect & { act: () => void })[] = [];
    const kh = (k: string) => (TOUCH ? '' : `${k} `); // desktop: the key on the button
    const btnDefs: [string, () => void][] = [[`${kh('R')}REROLL ${this.rerolls}`, () => this.reroll()], [`${kh('X')}SKIP ${this.skips}`, () => this.skip()], [`${kh('B')}BANISH ${this.banishes}`, () => this.banish()]];
    const footer = TOUCH ? 'TAP a card to choose, TAP it again to pick' : 'Click or LEFT/RIGHT choose   double-click or ENTER pick';
    const funding = `Funding round: +${Math.round(WAVE.funding * 100)}% damage, +${WAVE.fundingHp} max HP`;
    if (narrow) {
      // Portrait: the cards stack, each a wide row with its icon on the left; the whole block sits mid-screen.
      const cw = W - 16, ch = 78, gap = 6, x = 8;
      let y = 0;
      T(W / 2, y, title, { scale: 2, align: 'center', color: rel ? 0xf8d878 : cmd ? 0xfcfcfc : ui.accentInt });
      y += 22;
      y += T(W / 2, y, sub, { align: 'center', color: ui.dimInt, maxWidth: cw, maxLines: 2 }).lineCount * 10 + 8;
      hand.forEach((c) => {
        const ct = this.cardText(c, cmd, partners);
        add(box(this, x, y, cw, ch, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(UI + 101));
        const icon = add(this.add.image(x + 24, y + ch / 2, ct.ik, ct.ifr).setScrollFactor(0).setDepth(UI + 102));
        icon.setDisplaySize(ct.ik === HOG32 ? 40 : 32, ct.ik === HOG32 ? 40 : 32);
        const tx = x + 48, tw = cw - 56;
        T(tx, y + 6, ct.name, { color: ui.textInt, maxWidth: tw, maxLines: 1 });
        if (ct.tag) T(x + cw - 8, y + 6, ct.tag, { align: 'right', color: ct.tagCol });
        T(tx, y + 18, ct.line, { color: ui.dimInt, maxWidth: tw, maxLines: ct.hint ? 4 : 5 });
        if (ct.hint) T(tx, y + ch - 13, ct.hint, { color: 0xf8d878, maxWidth: tw, maxLines: 1 });
        rects.push({ x, y, w: cw, h: ch });
        y += ch + gap;
      });
      y += 2;
      if (kind === 'levelup') {
        const bw = (cw - 12) / 3;
        btnDefs.forEach(([label, act], i) => {
          const bx = x + i * (bw + 6);
          add(box(this, bx, y, bw, TAP, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(UI + 101));
          T(bx + bw / 2, y + (TAP - 7) / 2, label, { align: 'center', color: ui.textInt });
          btns.push({ x: bx, y, w: bw, h: TAP, act });
        });
        y += TAP + 8;
      } else if (rel) {
        y += T(W / 2, y, funding, { align: 'center', color: 0x3cbcfc, maxWidth: cw, maxLines: 2 }).lineCount * 10 + 6;
      }
      y += T(W / 2, y, footer, { align: 'center', color: ui.dimInt, maxWidth: cw, maxLines: 2 }).lineCount * 10;
      add(this.add.graphics().setScrollFactor(0).setDepth(UI + 103));
      const dy = Math.max(6, Math.round(H / 2 - y / 2));
      this.shiftObjs(objs, 0, dy);
      rects.forEach((r) => { r.y += dy; });
      btns.forEach((b) => { b.y += dy; });
    } else {
      // Landscape: the cards side by side, centred in a taller screen.
      const my = MY();
      T(W / 2, 20 + my, title, { scale: 2, align: 'center', color: rel ? 0xf8d878 : cmd ? 0xfcfcfc : ui.accentInt, depth: UI + 101 });
      T(W / 2, 40 + my, sub, { align: 'center', color: ui.dimInt, depth: UI + 101, maxWidth: W - 30, maxLines: 1 });
      const cw = 136, gap = 12, x0 = (W - (cw * hand.length + gap * (hand.length - 1))) / 2;
      hand.forEach((c, i) => {
        const x = x0 + i * (cw + gap), y = 56 + my;
        const ct = this.cardText(c, cmd, partners);
        add(box(this, x, y, cw, 156, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(UI + 101));
        const icon = add(this.add.image(x + cw / 2, y + 24, ct.ik, ct.ifr).setScrollFactor(0).setDepth(UI + 102));
        icon.setDisplaySize(ct.ik === HOG32 ? 40 : 32, ct.ik === HOG32 ? 40 : 32);
        T(x + cw / 2, y + 44, ct.name, { align: 'center', color: ui.textInt, maxWidth: cw - 12, maxLines: 2 });
        T(x + cw / 2, y + 68, ct.tag, { align: 'center', color: ct.tagCol });
        T(x + cw / 2, y + 82, ct.line, { align: 'center', color: ui.dimInt, maxWidth: cw - 14, maxLines: 4 });
        if (ct.hint) T(x + cw / 2, y + 128, ct.hint, { align: 'center', color: 0xf8d878, maxWidth: cw - 10, maxLines: 2 });
        rects.push({ x, y, w: cw, h: 156 });
      });
      add(this.add.graphics().setScrollFactor(0).setDepth(UI + 103));
      if (kind === 'levelup') {
        // Touch: three buttons, with Drake on either side.
        add(this.add.image(W / 2 - 166, 224 + my, HOG32, hogFrame('drake-nah')).setScale(0.5).setScrollFactor(0).setDepth(UI + 102));
        add(this.add.image(W / 2 + 166, 224 + my, HOG32, hogFrame('drake-yah')).setScale(0.5).setScrollFactor(0).setDepth(UI + 102));
        btnDefs.forEach(([label, act], i) => {
          const cx = W / 2 + (i - 1) * 99;
          add(box(this, cx - 46, 216 + my, 92, 21, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(UI + 101));
          T(cx, 223 + my, label, { align: 'center', color: ui.textInt });
          btns.push({ x: cx - 49, y: 214 + my, w: 98, h: 25, act });
        });
      } else if (rel) {
        T(W / 2, 222 + my, funding, { align: 'center', color: 0x3cbcfc, depth: UI + 101 });
      }
      T(W / 2, (kind === 'levelup' ? 243 : 240) + my, footer, { align: 'center', color: ui.dimInt, depth: UI + 101 });
    }
    const m: Modal = { kind, cards: hand, sel: 0, objs, armed: false, rects, btns, rebuild: (k) => this.openLevelUp(hand, kind, k) };
    m.at = keep?.at ?? this.time.now;
    this.modal = m;
    if (keep) {
      m.armed = keep.armed;
      if (!keep.armed) this.time.delayedCall(350, () => (m.armed = true));
      m.sel = keep.sel;
      if (m.sel >= 0) this.selectCard(m.sel, true);
      return;
    }
    // Ignore Enter for a moment so a held key doesn't pick blindly.
    this.time.delayedCall(350, () => (m.armed = true));
    if (TOUCH) m.sel = -1; else this.selectCard(0, true); // touch: nothing preselected, so one stray tap can't pick
  }

  /** A card's icon and words. */
  private cardText(c: Card, cmd: boolean, partners: Set<string>) {
    const [ik, ifr] = c.kind === 'heal' ? [spr('food'), 0] : c.kind === 'gold' ? [spr('coin'), 0] : this.iconOf(c.kind === 'passive' ? 'passive'
      : c.kind === 'release' ? 'release' : cmd ? 'power' : 'weapon', c.id);
    let name: string, tag: string, line: string, hint = '';
    if (cmd) {
      const P = POWERUPS[c.id as PowerId];
      name = P.name; tag = 'POWERUP'; line = P.line;
    } else if (c.kind === 'weapon') {
      const w = this.weapons.get(c.id as WeaponId);
      const evo = WEAPONS[c.id as WeaponId].evo;
      name = w?.evo && evo ? evo.name : productName(c.id);
      if (w && w.level >= MAX_LEVEL) {
        const next = { ...w, patch: w.patch + 1 } as WState;
        tag = `PATCH ${semver(next)}`;
        line = `x${PATCH_MUL} damage${!w.evo && evo ? `. Evolve it with ${PASSIVES[evo.passive].name} + a chest` : ''}`;
      } else {
        tag = w ? (w.level + 1 >= MAX_LEVEL ? 'LV MAX' : `LV ${w.level + 1}`) : isTool(c.id) ? 'NEW TOOL!' : 'NEW!';
        line = w ? WEAPONS[c.id as WeaponId].upgrade : productLine(c.id);
        hint = evo ? `Evolves with ${PASSIVES[evo.passive].name}` : '';
      }
    } else if (c.kind === 'passive') {
      const id = c.id as PassiveId;
      const l = this.passives.get(id) ?? 0;
      name = PASSIVES[id].name;
      if (l >= PASSIVES[id].max) { tag = `PATCH ${(this.ppatch.get(id) ?? 0) + 1}`; line = `Half a level more: ${PASSIVES[id].line}`; }
      else { tag = l ? `LV ${l + 1}` : 'NEW!'; line = PASSIVES[id].line; }
      const w = [...this.weapons.values()].find((x) => !x.evo && WEAPONS[x.id].evo?.passive === id);
      if (w && partners.has(id)) hint = `Evolves ${productName(w.id)}`;
    } else if (c.kind === 'release') {
      const r = RELEASES[c.id as ReleaseId];
      const n = this.releases.get(c.id as ReleaseId) ?? 0;
      name = r.name; tag = n ? `RELEASE x${n + 1}` : 'RELEASE'; line = r.line;
    } else if (c.kind === 'major') {
      const evo = WEAPONS[c.id as WeaponId].evo;
      name = evo?.name ?? productName(c.id); tag = 'v2.0 MAJOR'; line = `x${MAJOR.dmg} damage, +1 amount, fires 15% faster`;
    } else if (c.kind === 'heal') { name = 'Snack'; tag = ''; line = 'Heal 30 HP'; }
    else { name = 'Bonus'; tag = ''; line = '+10 gold'; }
    const tagCol = c.kind === 'release' || c.kind === 'major' ? 0xf8d878 : K.ui.accentInt;
    return { ik: ik as string, ifr: ifr as number, name, tag, line, hint, tagCol };
  }

  /** The selection frame around card / choice i, as the modal drew it. */
  private frameSel(m: Modal, i: number) {
    const g = m.objs.find((o) => o instanceof Phaser.GameObjects.Graphics && o.depth === UI + 103) as Phaser.GameObjects.Graphics;
    const r = m.rects?.[i];
    g.setPosition(0, 0).clear();
    if (r) g.lineStyle(2, K.ui.accentInt, 1).strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  }

  private selectCard(i: number, silent = false) {
    const m = this.modal;
    if (!m || !['levelup', 'release', 'cmdk'].includes(m.kind)) return;
    m.sel = i;
    this.frameSel(m, i);
    if (!silent) this.sfx('move', 0.5);
  }

  private reroll() {
    const m = this.modal;
    if (!m || m.kind !== 'levelup' || !m.armed || this.rerolls <= 0) { this.sfx('hurt', 0.3, 100); return; }
    this.rerolls--;
    this.sfx('select');
    this.openLevelUp(drawCards(this.build(), () => this.RC.next()));
  }

  private skip() {
    const m = this.modal;
    if (!m || m.kind !== 'levelup' || !m.armed || this.skips <= 0) { this.sfx('hurt', 0.3, 100); return; }
    this.skips--;
    this.gold += 3;
    this.closeModal();
  }

  private banish() {
    const m = this.modal;
    if (!m || m.kind !== 'levelup' || !m.armed || this.banishes <= 0) { this.sfx('hurt', 0.3, 100); return; }
    const c = m.cards[m.sel];
    if (!c) { this.banner('BANISH', TOUCH ? 'Tap a card first, then BANISH' : 'Choose a card first'); return; }
    if (c.kind !== 'weapon' && c.kind !== 'passive') { this.sfx('hurt', 0.3, 100); return; }
    this.banishes--;
    this.banished.add(c.id);
    this.sfx('explode', 0.3);
    this.openLevelUp(drawCards(this.build(), () => this.RC.next()));
  }

  private pickCard() {
    const m = this.modal;
    if (!m || !['levelup', 'release', 'cmdk'].includes(m.kind) || !m.armed || m.sel < 0) return;
    const c = m.cards[m.sel];
    this.sfx('select');
    this.closeModal();
    if (m.kind === 'cmdk') { this.activatePowerup(c.id as PowerId); return; }
    this.applyCard(c);
    if (m.kind === 'levelup') this.onLevelApplied();
    if (m.kind === 'release') this.startWave(this.wave + 1);
  }

  applyCard(c: Card) {
    if (c.kind === 'weapon') {
      const w = this.weapons.get(c.id as WeaponId);
      if (!w) this.addWeapon(c.id as WeaponId);
      else if (w.level < MAX_LEVEL) w.level++;
      else { w.patch++; if (w.patch >= 10) this.earn('platform-features'); }
      capture('product_picked', { product: c.id, level: this.weapons.get(c.id as WeaponId)!.level, player_level: this.level });
      this.checkHoldings();
    } else if (c.kind === 'passive') {
      const id = c.id as PassiveId;
      const l = this.passives.get(id) ?? 0;
      if (l >= PASSIVES[id].max) this.ppatch.set(id, (this.ppatch.get(id) ?? 0) + 1);
      else this.passives.set(id, l + 1);
    } else if (c.kind === 'release') {
      const id = c.id as ReleaseId;
      this.releases.set(id, (this.releases.get(id) ?? 0) + 1);
      if (id === 'burning') this.unlock('burning-money');
      capture('release_picked', { release: id, wave: this.wave });
    } else if (c.kind === 'major') {
      const w = this.weapons.get(c.id as WeaponId);
      if (w) { w.major = true; w.patch = 0; resetVisuals(w); this.earn('platform-ux'); }
    } else if (c.kind === 'heal') {
      this.hp += 30;
    } else {
      this.gold += 10;
    }
    this.recalc();
    this.refreshIcons();
    this.checkReady();
  }

  /** Holding crests: analytics trio, data tools, 5 tools, 5 evolutions. */
  private checkHoldings() {
    const has = (id: WeaponId) => this.weapons.has(id);
    const analytics = (['product_analytics', 'web_analytics', 'heatmaps', 'revenue'] as WeaponId[]).filter(has).length;
    if (analytics >= 3) this.earn('analytics-platform');
    if (has('data_warehouse') && has('data_pipelines') && has('batch_exports')) this.earn('data-tools');
    if ([...this.weapons.keys()].filter(isTool).length >= 5) this.earn('mcp-analytics');
    if ([...this.weapons.values()].filter((w) => w.evo).length >= 5) this.earn('managed-warehouse');
  }

  /** One banner the moment a weapon can evolve, so players know to go hunting for a chest. */
  private checkReady() {
    for (const w of this.weapons.values()) {
      const pid = WEAPONS[w.id].evo?.passive;
      if (!pid || w.evo || w.level < MAX_LEVEL || !this.passives.has(pid) || this.seen.has(`ready:${w.id}`)) continue;
      this.seen.add(`ready:${w.id}`);
      this.banner('EVOLUTION READY!', `${productName(w.id)}: open a chest from an elite`);
    }
  }

  closeModal() {
    const m = this.modal;
    if (!m) return;
    m.objs.forEach((o) => o.destroy());
    this.modal = null;
    this.showBanner(true);
    hooks.state = this.boss ? 'boss' : 'playing';
    this.refreshIcons();
  }

  /** Autopilot at a modal: close chests, pick the best card (reroll a weak hand once). */
  private botModal() {
    const m = this.modal!;
    if (m.kind === 'chest' || m.kind === 'reveal') { this.closeModal(); return; }
    if (m.kind === 'act') { this.chooseAct(this.wave >= this.botCashAt ? 1 : 0); return; }
    if (this.novice || m.kind === 'cmdk') { this.selectCard(0, true); this.pickCard(); return; }
    const b = this.build();
    const ranks = m.cards.map((c) => botRank(c, b));
    const best = Math.max(...ranks);
    if (best < 5 && this.rerolls > 0 && m.kind === 'levelup') { this.reroll(); return; }
    this.selectCard(ranks.indexOf(best), true);
    this.pickCard();
  }

  private openCmdK() {
    if (this.modal) { this.dropItem('cmdk', this.player.x + 16, this.player.y); return; }
    const opts: PowerId[] = [];
    while (opts.length < 3) {
      const k = this.rollPowerup(['cmdk', ...opts]);
      if (!opts.includes(k)) opts.push(k);
      if (opts.length >= POWER_IDS.length - 1) break;
    }
    this.openLevelUp(opts.map((id) => ({ kind: 'weapon', id })), 'cmdk');
  }

  // ---------------------------------------------------------------- chests + evolutions
  private openChest(big = false) {
    if (this.over) return;
    const R = this.RD;
    this.run.chests++;
    const sv = save();
    sv.chests++;
    const lines: [string, string, number][] = []; // [title, line, colour]
    let title = 'CHEST!';
    const ready = [...this.weapons.values()].filter((w) => {
      const pid = WEAPONS[w.id].evo?.passive;
      return !!pid && !w.evo && w.level >= MAX_LEVEL && this.passives.has(pid);
    });
    const a = this.weapons.get(SUPER.a), b = this.weapons.get(SUPER.b);
    if (ready.length) {
      const w = R.pick(ready);
      this.evolve(w);
      title = 'EVOLUTION!';
      lines.push([WEAPONS[w.id].evo!.name, WEAPONS[w.id].evo!.line, 0xf8d878]);
    } else if (a?.evo && b?.evo && !this.superNova) {
      this.superNova = true;
      title = 'FUSION!';
      lines.push([SUPER.name, SUPER.line, 0xf878f8]);
      this.earn('website');
      this.codex(SUPER.name);
    } else {
      // No evolution ready: level up (or patch) 1-3 things you own, plus gold.
      const n = 1 + (R.next() < 0.25 * this.st.luck ? 1 : 0) + (big || R.next() < 0.08 * this.st.luck ? 1 : 0);
      for (let i = 0; i < n; i++) {
        let opts: Card[] = [
          ...[...this.weapons.values()].filter((w) => w.level < MAX_LEVEL).map((w) => ({ kind: 'weapon' as const, id: w.id })),
          ...[...this.passives].filter(([id, l]) => l < PASSIVES[id].max).map(([id]) => ({ kind: 'passive' as const, id })),
        ];
        // A finished build patches its evolved weapons instead.
        if (!opts.length) opts = [...this.weapons.values()].filter((w) => w.evo || !WEAPONS[w.id].evo).map((w) => ({ kind: 'weapon' as const, id: w.id }));
        if (!opts.length) break;
        const c = R.pick(opts);
        this.applyCard(c);
        const w = c.kind === 'weapon' ? this.weapons.get(c.id as WeaponId)! : null;
        const nm = w ? (w.evo ? WEAPONS[w.id].evo!.name : productName(c.id)) : PASSIVES[c.id as PassiveId].name;
        lines.push([nm, w ? `now ${semver(w)}` : `now level ${this.passives.get(c.id as PassiveId)}`, 0xfcfcfc]);
      }
      if (!lines.length) { this.hp = this.st.maxHp; lines.push(['Full heal', 'Back to full HP', 0x58d854]); }
    }
    const g = Math.round((big ? 40 : 10 + R.int(0, 12)) * this.st.luck * (1 + this.heat * 0.1) * (1 + 0.3 * (this.wave - 1)));
    if (this.trait !== 'burning' && !this.releases.has('burning')) {
      this.gold += g;
      lines.push([`+${g} gold`, '', 0xf8d878]);
    }
    persist();
    this.showChest(title, lines);
  }

  evolve(w: WState) {
    w.evo = true;
    w.level = MAX_LEVEL;
    w.patch = 0;
    w.born = this.elapsed - SPOTLIGHT / 2; // a short bright showing, then it settles into the background
    resetVisuals(w);
    const name = WEAPONS[w.id].evo?.name ?? productName(w.id);
    this.run.evolutions.push(name);
    this.codex(name);
    const crest: Partial<Record<WeaponId, string>> = { experiments: 'experiments', error_tracking: 'error-tracking', session_replay: 'replay',
      feature_flags: 'feature-flags', product_analytics: 'product-analytics', surveys: 'surveys', posthog_ai: 'ai-research',
      ai_observability: 'ai-observability', data_warehouse: 'data-modeling', web_analytics: 'web-analytics', workflows: 'workflows' };
    const c = crest[w.id];
    if (c) this.earn(c);
    this.recalc();
    this.refreshIcons();
    this.checkHoldings();
    capture('weapon_evolved', { product: w.id, evolution: name, t: Math.round(this.elapsed) });
  }

  private codex(name: string) {
    const sv = save();
    if (!sv.codex.includes(name)) { sv.codex.push(name); persist(); }
  }

  private showChest(title: string, lines: [string, string, number][], keep?: Keep) {
    const ui = K.ui;
    const evo = title !== 'CHEST!';
    if (!keep) {
      this.sfx(evo ? 'evolve' : 'chest', 0.9);
      const p = this.player;
      burst(this, p.x, p.y, 0xf8d878, evo ? 40 : 20, { speed: evo ? 220 : 150, gravity: 0, colours: [0xfcfcfc, K.ui.accentInt] });
      if (evo) { shake(this, 4, 250); this.cameras.main.flash(200, 255, 240, 180); }
    }
    const objs: Phaser.GameObjects.GameObject[] = [];
    this.showBanner(false);
    const bw = Math.min(260, W - 12), tw = bw - 20;
    const h = 44 + lines.length * 20;
    const y0 = Math.round(H / 2 - h / 2);
    objs.push(this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setName('fill').setOrigin(0).setScrollFactor(0).setDepth(UI + 100));
    objs.push(box(this, W / 2 - bw / 2, y0, bw, h, ui.bgInt, 0xf8d878, ui.panelInt).setScrollFactor(0).setDepth(UI + 101));
    objs.push(this.add.image(W / 2 - bw / 2 + 20, y0 + 16, spr('chest'), 1).setScale(2).setScrollFactor(0).setDepth(UI + 102));
    objs.push(text(this, W / 2 + 10, y0 + 9, title, { scale: 2, align: 'center', color: 0xf8d878, fixed: true, depth: UI + 102 }));
    lines.forEach(([a, b, col], i) => {
      const y = y0 + 34 + i * 20;
      objs.push(text(this, W / 2, y, a, { align: 'center', color: col, fixed: true, depth: UI + 102, maxWidth: tw, maxLines: 1 }));
      if (b) objs.push(text(this, W / 2, y + 9, b, { align: 'center', color: ui.dimInt, fixed: true, depth: UI + 102, maxWidth: tw, maxLines: 1 }));
    });
    hooks.state = 'chest';
    const m: Modal = { kind: 'chest', cards: [], sel: 0, objs, armed: false, rebuild: (k) => this.showChest(title, lines, k) };
    m.at = keep?.at ?? this.time.now;
    this.modal = m;
    if (keep?.armed) m.armed = true;
    else this.time.delayedCall(this.autopilot ? 250 : 500, () => (m.armed = true));
    this.time.delayedCall(this.autopilot ? 400 : 2600, () => { if (this.modal === m) this.closeModal(); });
  }

  // ---------------------------------------------------------------- weapons + projectiles
  addWeapon(id: WeaponId) {
    if (this.weapons.has(id)) return;
    const w = newWeapon(id);
    w.born = this.elapsed;
    this.weapons.set(id, w);
    this.refreshIcons();
  }

  shoot(key: string, x: number, y: number, vx: number, vy: number, dmg: number, life: number, pierce: number, src: string, hostile = false): Proj {
    const s = this.add.image(x, y, spr(key)).setDepth(hostile ? 12 : OWN + 0.1);
    if (hostile) s.setScale(1.6); // enemy shots read at phone size (drawShots adds a halo and trail)
    const pr: Proj = { s, vx, vy, dmg, life, pierce, src, hit: new Set(), hostile };
    this.projs.push(pr);
    return pr;
  }

  zapLine(x1: number, y1: number, x2: number, y2: number, col = 0xfcfcfc) {
    const g = this.add.graphics().setDepth(OWN + 0.4).setAlpha(this.fxAlpha());
    g.lineStyle(1, col, 1).beginPath().moveTo(x1, y1);
    const n = 4;
    for (let i = 1; i < n; i++) {
      g.lineTo(x1 + ((x2 - x1) * i) / n + Phaser.Math.Between(-4, 4), y1 + ((y2 - y1) * i) / n + Phaser.Math.Between(-4, 4));
    }
    g.lineTo(x2, y2).strokePath();
    g.lineStyle(1, 0x58d854, 1).strokeCircle(x2, y2, 4);
    this.time.delayedCall(80, () => g.destroy());
  }

  private moveProjectiles(dt: number) {
    const p = this.player;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      if (!pr) continue;
      if (pr.hostile && this.pu.freeze > 0 && pr.life > 0) continue; // Feature Freeze: enemy shots hang in the air
      pr.life -= dt;
      if (pr.homing !== undefined) {
        if (!pr.homing || !pr.homing.alive) {
          pr.rt = (pr.rt ?? 0) - dt;
          pr.homing = null;
          if (pr.rt <= 0) { pr.rt = 0.15; pr.homing = this.nearest(pr.s.x, pr.s.y, 200); }
        }
        if (pr.homing) {
          const a = Math.atan2(pr.homing.s.y - pr.s.y, pr.homing.s.x - pr.s.x);
          const cur = Math.atan2(pr.vy, pr.vx);
          const na = Phaser.Math.Angle.RotateTo(cur, a, 6 * dt);
          pr.vx = Math.cos(na) * pr.speed!; pr.vy = Math.sin(na) * pr.speed!;
        }
        pr.s.setRotation(Math.atan2(pr.vy, pr.vx));
      }
      pr.s.x += pr.vx * dt;
      pr.s.y += pr.vy * dt;
      let dead = pr.life <= 0 || pr.s.x < -20 || pr.s.y < -20 || pr.s.x > WORLD_W + 20 || pr.s.y > WORLD_H + 20;
      if (!dead && pr.hostile) {
        const pd = Phaser.Math.Distance.Between(pr.s.x, pr.s.y, p.x, p.y);
        if (pd < 9) { this.hurt(pr.dmg, pr.src); dead = true; }
        else if (pd < this.moatR() && this.moatBlock(1)) { dead = true; burst(this, pr.s.x, pr.s.y, 0x3cbcfc, 3, { speed: 50 }); }
      } else if (!dead) {
        for (const e of this.near(pr.s.x, pr.s.y, 3)) {
          if (pr.hit.has(e)) continue;
          pr.hit.add(e);
          const sp = Math.hypot(pr.vx, pr.vy) || 1;
          this.damage(e, pr.dmg, (pr.vx / sp) * 60, (pr.vy / sp) * 60, pr.src);
          if (pr.boom) this.blast(pr.s.x, pr.s.y, pr.boom, pr.dmg * 0.5, pr.src);
          if (!e.alive && pr.chain && this.projs.length < 260) {
            // Stack Trace Storm: a kill spawns a fresh trace from the body.
            const t = this.nearest(e.s.x, e.s.y, 160);
            if (t) {
              const a = Math.atan2(t.s.y - e.s.y, t.s.x - e.s.x);
              const np = this.shoot('homing', e.s.x, e.s.y, Math.cos(a) * pr.speed!, Math.sin(a) * pr.speed!, pr.dmg, 1.4, 1, pr.src);
              np.homing = t; np.speed = pr.speed; np.chain = pr.chain - 1; np.s.setTint(0xf8d878);
            }
          }
          if (--pr.pierce <= 0) { dead = true; break; }
        }
      }
      if (dead) { pr.s.destroy(); this.projs.splice(i, 1); }
    }
  }

  /** Contact: bugs hurt the hog; rammer hoggies and Hogzilla hurt the bugs; thorns bite back. */
  private touchPlayer(dt: number) {
    const p = this.player;
    const ram = (this.trait === 'rammer' && this.moving) || this.pu.hogzilla > 0;
    if (ram) {
      const dmg = (this.pu.hogzilla > 0 ? 80 : 20) * (1 + 0.4 * (this.wave - 1));
      for (const e of this.near(p.x, p.y, this.pu.hogzilla > 0 ? 18 : 12)) {
        if ((e.hitAt.ram ?? 0) > this.elapsed || e.reaper) continue;
        e.hitAt.ram = this.elapsed + 0.3;
        const dx = e.s.x - p.x, dy = e.s.y - p.y, d = Math.hypot(dx, dy) || 1;
        this.damage(e, dmg, (dx / d) * 220, (dy / d) * 220, 'rammer', true);
      }
    }
    if (this.pu.party > 0) {
      // Party Mode: a damage aura that pulls in everything.
      if (Math.floor(this.elapsed * 4) !== Math.floor((this.elapsed - dt) * 4)) {
        for (const e of this.near(p.x, p.y, 60)) this.damage(e, 20 + 10 * this.wave, 0, 0, 'party', true);
      }
      this.pullGems(p.x, p.y, 200);
    }
    if (this.invuln > 0 || this.pu.autopilot > 0 || this.pu.party > 0 || this.pu.hogzilla > 0 || this.interlude) return;
    for (const e of this.near(p.x, p.y, 7)) {
      if (e.dmg <= 0) continue;
      if (this.pu.freeze > 0 && !e.boss && !e.reaper) continue; // frozen bugs are harmless
      if (this.pu.sampling > 0 && e.seed! < 0.9 && !e.boss && !e.reaper) continue; // sampled out
      if (e.arch === 'heisen' && !this.visible(e)) continue; // an unseen heisenbug is only a rumour
      if (this.trait === 'thorns') this.damage(e, 30 * (1 + 0.4 * (this.wave - 1)), 0, 0, 'thorns', true);
      this.hurt(e.dmg, e.boss ? 'boss' : e.reaper ? 'reaper' : e.elite ? 'elite' : e.arch);
      break;
    }
  }

  /** Damage to the hog. One hit takes at most 35% of max HP (after armour) unless `uncapped`. */
  hurt(dmg: number, src = '', uncapped = false) {
    if (this.invuln > 0 || this.over || this.won || this.interlude || this.pu.autopilot > 0) return;
    this.invuln = 0.55;
    let d = dmg * Math.max(0.3, 1 - this.st.armour);
    if (!uncapped) d = Math.min(d, this.st.maxHp * WAVE.hitCap);
    this.run.hurtBy[src] = Math.round((this.run.hurtBy[src] ?? 0) + d);
    this.run.hits++;
    if (this.wave === 1) this.run.hitsWave1++;
    this.tokenT = 0;
    if (!this.god) this.hp -= d;
    this.sfx('hurt', 0.8);
    shake(this, 2.5, 120);
    this.player.setTintFill(0xf83800);
    this.time.delayedCall(90, () => { if (!this.over) this.player.clearTint(); });
    // Kill Switch Protocol: once per wave, dropping low clears the screen.
    if (this.releases.has('killswitch') && !this.waveFlags.killswitch && this.hp > 0 && this.hp < this.st.maxHp * 0.25) {
      this.waveFlags.killswitch = true;
      this.banner('KILL SWITCH PROTOCOL', 'Everything on screen: switched off');
      this.hotfix();
    }
    if (this.hp <= 0) {
      if (this.st.revives > 0) this.revive();
      else this.finish(false);
    }
  }

  /** Rollback: back to half HP, a shockwave clears space. */
  private revive() {
    this.revivesUsed++;
    this.waveFlags.minHp = 0;
    const sv = save();
    sv.revives++;
    persist();
    if (sv.revives >= 10) this.earn('support');
    this.recalc();
    this.hp = this.st.maxHp * (this.trait === 'angel' ? 1 : 0.5);
    this.invuln = 2;
    const p = this.player;
    this.banner(this.trait === 'revive' ? "I'LL BE BACK" : 'ROLLBACK!', 'Restored from the last good deploy');
    this.cameras.main.flash(300, 120, 200, 255);
    burst(this, p.x, p.y, 0x3cbcfc, 40, { speed: 220, gravity: 0 });
    for (const e of this.near(p.x, p.y, 90)) {
      const dx = e.s.x - p.x, dy = e.s.y - p.y, d = Math.hypot(dx, dy) || 1;
      this.damage(e, 60, (dx / d) * 400, (dy / d) * 400, 'rollback', true);
    }
    this.sfx('evolve');
  }

  // ---------------------------------------------------------------- boss
  private runBoss(dt: number) {
    if (!this.boss && !this.bossWaiting && this.elapsed >= this.nextBossAt && !this.won && !this.interlude) this.spawnBoss();
    const b = this.boss;
    if (!b || !b.alive) return;
    this.bossTimer -= dt * (this.pu.freeze > 0 ? 0.5 : 1);
    const NAME = bossTitle(this.bossVersion()).toUpperCase();
    const fight = this.elapsed - this.bossAt;
    const crumbleAt = this.wave === 1 && !this.yolo ? 50 : WAVE.crumble;
    // Angry at half HP, or after a while so a weak build still finishes the fight in good time.
    if (this.bossPhase === 1 && (b.hp < b.maxHp * 0.5 || fight > crumbleAt)) {
      this.bossPhase = 2;
      this.banner(`${NAME} IS ANGRY!`, 'It is calling in more bugs');
      if (this.bossAffixes.includes('race')) this.forkBoss(b);
    }
    if (!b.hitAt.crumble && fight > crumbleAt) {
      b.hitAt.crumble = 1;
      this.banner(`${NAME} IS CRUMBLING!`, 'Your fixes are landing. Keep going!');
    }
    if (this.bossPhase === 2 && this.heat >= 5 && b.hp < b.maxHp * 0.25) {
      this.bossPhase = 3;
      this.banner(`${NAME} RAGES!`, 'Faster attacks. Hang in there!');
      b.s.setTint(0xf87858);
      b.tint = 0xf87858;
    }
    this.bossAffixTick(b, dt);
    if (this.bossTimer > 0) return;
    this.bossAttack(b);
  }

  /** A long boss fight wears the boss down: past the crumble mark it takes more and more damage (+5%/s, max x8). */
  private bossVuln() {
    const w1 = this.wave === 1 && !this.yolo;
    const t = this.elapsed - this.bossAt - (w1 ? 50 : WAVE.crumble);
    return t > 0 ? Math.min(w1 ? 8 : 16, 1 + t / (w1 ? 20 : 8)) : 1;
  }

  /** Monolith: armour plates (x0.35 damage) that break one by one. */
  private bossArmour(b: Enemy) {
    return b.boss && this.bossAffixes.includes('monolith') && this.bossPlates > 0 ? 0.35 : 1;
  }
  private plateHit(b: Enemy, d: number) {
    if (this.bossPlates <= 0) return;
    this.bossPlateDmg += d;
    if (this.bossPlateDmg >= b.maxHp * 0.06) {
      this.bossPlateDmg = 0;
      this.bossPlates--;
      burst(this, b.s.x, b.s.y, 0xbcbcbc, 20, { speed: 180 });
      this.sfx('explode', 0.5, 100);
      if (!this.bossPlates) this.banner('PLATES DOWN!', 'The monolith is exposed');
    }
  }

  /** Per-frame boss affixes: Memory Leak grows, Heisenbug blinks, Infinite Loop fires spirals. */
  private bossAffixTick(b: Enemy, dt: number) {
    const fx = this.bossAffixes;
    if (fx.includes('leak')) {
      const k = Math.min(1.7, 1 + (this.elapsed - this.bossAt) / 60);
      b.s.setScale((b.hitAt.sc ?? 1) * k);
      b.r = 22 * (b.hitAt.sc ?? 1) * k;
      b.hitAt.leakT = (b.hitAt.leakT ?? 3) - dt;
      if (b.hitAt.leakT <= 0 && this.puddles.length < 12) { b.hitAt.leakT = 4; this.puddles.push({ x: b.s.x, y: b.s.y, r: 8, age: 8 }); }
    }
    if (fx.includes('heisen')) {
      b.hitAt.hzT = (b.hitAt.hzT ?? 6) - dt;
      if (b.hitAt.hzT <= 0) {
        const hidden = b.s.alpha < 0.5;
        if (hidden) {
          const a = Math.random() * 6.28;
          b.s.setPosition(this.player.x + Math.cos(a) * 130, this.player.y + Math.sin(a) * 100).setAlpha(1);
          b.armour = 1;
          b.hitAt.hzT = 6;
          burst(this, b.s.x, b.s.y, 0xfcfcfc, 20, { speed: 150, gravity: 0 });
        } else {
          b.s.setAlpha(0.15);
          b.armour = 0.3;
          b.hitAt.hzT = 1.8;
        }
      }
    }
    if (fx.includes('loop')) {
      b.hitAt.loopT = (b.hitAt.loopT ?? 0.3) - dt;
      if (b.hitAt.loopT <= 0 && b.mode === 0) {
        b.hitAt.loopT = 0.35;
        const a = this.elapsed * 2.4;
        this.shoot('boss_shot', b.s.x, b.s.y, Math.cos(a) * 75, Math.sin(a) * 75, 9 * this.diff.dmg * this.dmgScale(), 4, 1, 'boss', true);
      }
    }
  }

  /** Race Condition: the boss forks. Both halves must die. */
  private forkBoss(b: Enemy) {
    const t = this.addEnemy('tank', b.s.x + 40, b.s.y, null);
    if (!t) return;
    t.s.setTexture(spr('boss')).play(anim('boss')).setScale(0.8).setDepth(6);
    Object.assign(t, { twin: true, hp: b.hp, maxHp: b.hp, speed: b.speed * 1.4, dmg: b.dmg, r: 18, armour: 1, kb: 0, xp: 20, tint: 0xf85898 });
    this.restoreTint(t);
    this.banner('RACE CONDITION!', 'It forked. Kill both halves');
  }

  /** Boss movement: walk, telegraphed dash, spiral spin, rollout, loop orbit. */
  private moveBoss(b: Enemy, dt: number) {
    const px = this.player.x, py = this.player.y;
    const dx = px - b.s.x, dy = py - b.s.y, d = Math.hypot(dx, dy) || 1;
    if (b.mode === 1) { // dash telegraph
      b.t -= dt;
      if (b.t <= 0) { b.mode = 2; b.t = 0.7; }
    } else if (b.mode === 2) {
      b.t -= dt;
      b.s.x += b.vx * 175 * dt;
      b.s.y += b.vy * 175 * dt;
      if (b.t <= 0) { b.mode = 0; this.restoreTint(b); }
    } else if (b.mode === 5) { // rollout telegraph: four lines blink, then go live
      b.t -= dt;
      if (b.t <= 0) { b.mode = 6; b.t = 0.45; this.sfx('bossshot', 0.8); shake(this, 3, 200); }
    } else if (b.mode === 6) { // rollout live: the lines hurt
      b.t -= dt;
      const px2 = this.player.x - b.s.x, py2 = this.player.y - b.s.y;
      for (let k = 0; k < 4; k++) {
        const a = b.vy + (k * Math.PI) / 2, cx = Math.cos(a), cy = Math.sin(a);
        const along = px2 * cx + py2 * cy;
        if (along > 0 && along < 420 && Math.abs(-px2 * cy + py2 * cx) < 8) { this.hurt(18 * this.diff.dmg * this.dmgScale(), 'boss'); break; }
      }
      if (b.t <= 0) b.mode = 0;
    } else if (b.mode === 4) { // spiral
      b.t -= dt;
      b.vx += dt;
      if (b.vx >= 0.09) {
        b.vx = 0;
        const base = this.elapsed * 3.2;
        for (const off of [0, Math.PI]) {
          const a = base + off;
          this.shoot('boss_shot', b.s.x, b.s.y, Math.cos(a) * 80, Math.sin(a) * 80, 10 * this.diff.dmg * this.dmgScale(), 5, 1, 'boss', true);
        }
      }
      if (b.t <= 0) b.mode = 0;
    } else if (this.bossAffixes.includes('loop') && this.bossPhase > 0) {
      // Infinite Loop: circles the hog.
      const a = Math.atan2(b.s.y - py, b.s.x - px) + dt * 0.9;
      const tx = px + Math.cos(a) * 150, ty = py + Math.sin(a) * 110;
      b.s.x += (tx - b.s.x) * Math.min(1, dt * 2.5);
      b.s.y += (ty - b.s.y) * Math.min(1, dt * 2.5);
    } else if (this.bossPhase > 0) {
      // Angry: 1.5x. Crumbling (long fight): keeps speeding up toward the hog's pace so kiting can't stall the fight.
      const crumble = Math.max(0, this.elapsed - this.bossAt - (this.wave === 1 && !this.yolo ? 50 : WAVE.crumble));
      const sp = b.speed * b.slow * (this.bossPhase >= 2 ? 1.5 : 1) * Math.min(3.2, 1 + crumble / 40);
      b.s.x += (dx / d) * sp * dt;
      b.s.y += (dy / d) * sp * dt;
    }
    b.s.x = Phaser.Math.Clamp(b.s.x, 32, WORLD_W - 32);
    b.s.y = Phaser.Math.Clamp(b.s.y, 32, WORLD_H - 32);
    if (b.flash > -1000) {
      const was = b.flash;
      b.flash -= dt * 1000;
      if (was > 0 && b.flash <= 0 && b.mode !== 1) this.restoreTint(b);
    }
    if (b.acc > 0) { b.accT -= dt; if (b.accT <= 0) this.flushNumber(b); }
  }

  /** Boss telegraphs (drawn with the rest of the frame's fx, after fx is cleared). */
  private drawBossFx() {
    const b = this.boss;
    if (!b || !b.alive) return;
    const g = this.fx;
    if (b.mode === 1) {
      g.lineStyle(2, 0xf83800, Math.floor(b.t * 14) % 2 ? 0.9 : 0.3).lineBetween(b.s.x, b.s.y, b.s.x + b.vx * 150, b.s.y + b.vy * 150);
    }
    if (b.mode === 5 || b.mode === 6) {
      const live = b.mode === 6;
      for (let k = 0; k < 4; k++) {
        const a = b.vy + (k * Math.PI) / 2, ex = b.s.x + Math.cos(a) * 420, ey = b.s.y + Math.sin(a) * 420;
        if (live) {
          g.lineStyle(9, 0xf87858, 0.45).lineBetween(b.s.x, b.s.y, ex, ey);
          g.lineStyle(3, 0xfcfcfc, 0.95).lineBetween(b.s.x, b.s.y, ex, ey);
        } else {
          g.lineStyle(1, 0xf83800, Math.floor(b.t * 16) % 2 ? 0.95 : 0.35).lineBetween(b.s.x, b.s.y, ex, ey);
          g.lineStyle(9, 0xf83800, 0.08).lineBetween(b.s.x, b.s.y, ex, ey);
        }
      }
    }
    if (this.bossAffixes.includes('monolith')) {
      // The plates: grey slabs around the boss.
      for (let k = 0; k < this.bossPlates; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        g.fillStyle(0x7c7c7c, 1).fillRect(b.s.x + Math.cos(a) * b.r - 5, b.s.y + Math.sin(a) * b.r - 5, 10, 10);
        g.lineStyle(1, 0xbcbcbc, 1).strokeRect(b.s.x + Math.cos(a) * b.r - 5, b.s.y + Math.sin(a) * b.r - 5, 10, 10);
      }
    }
  }

  /** Powerups on the floor get a pulsing ring; Self-Driving Mode gets a ring around the hog. */
  private drawPowerFx() {
    const g = this.fx, t = this.time.now;
    for (const it of this.items) {
      if (!isPower(it.kind) && it.kind !== 'relic' && it.kind !== 'page') continue;
      const c = isPower(it.kind) ? POWERUPS[it.kind].col : it.kind === 'relic' ? 0xf8d878 : 0xfcfcfc;
      g.lineStyle(1, c, 0.5 + 0.4 * Math.sin(t / 150)).strokeCircle(it.s.x, it.s.y, 11 + Math.sin(t / 200) * 1.5);
    }
    const p = this.player;
    if (this.pu.autopilot > 0) {
      g.lineStyle(1, 0x3cbcfc, 0.9).strokeCircle(p.x, p.y, 15 + Math.sin(t / 80));
      g.lineStyle(1, 0xfcfcfc, 0.5).strokeCircle(p.x, p.y, 18 + Math.sin(t / 80 + 1));
    }
    if (this.pu.shipit > 0) g.fillStyle(0xfca044, 0.8).fillRect(Math.round(p.x - 1 + Math.sin(t / 50) * 8), Math.round(p.y + 10), 2, 2);
    if (this.pu.party > 0) {
      const col = [0xf878f8, 0x58d854, 0x3cbcfc, 0xf8d878][Math.floor(t / 120) % 4];
      g.lineStyle(2, col, 0.6).strokeCircle(p.x, p.y, 60 + Math.sin(t / 90) * 3);
    }
  }

  /** Boss attack library; the pool grows with heat, phase and version. */
  private bossAttack(b: Enemy) {
    const angry = this.bossPhase >= 2, rage = this.bossPhase >= 3;
    const v = this.bossVersion();
    const pool = ['ring', 'charge'];
    if (this.heat >= 2 || this.bossKills > 0 || angry) pool.push('spiral');
    if (angry) pool.push('summon');
    if (v >= 2 || this.bossAffixes.includes('rollout')) pool.push('rollout');
    if (this.bossAffixes.includes('rollout')) pool.push('rollout'); // its signature trick
    const pick = Phaser.Utils.Array.GetRandom(pool.filter((p) => p !== this.bossLast)) ?? 'ring';
    this.bossLast = pick;
    const pace = (rage ? 0.65 : angry ? 0.8 : 1) * Math.max(0.6, 1 - 0.04 * (v - 1));
    const px = this.player.x, py = this.player.y;
    const dm = this.ease(this.diff.dmg) * this.dmgScale();
    if (pick === 'ring') {
      const n = (angry ? 18 : 12) + Math.min(8, v - 1);
      const off = Math.random() * Math.PI;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        this.shoot('boss_shot', b.s.x, b.s.y, Math.cos(a) * 72, Math.sin(a) * 72, 12 * dm, 5, 1, 'boss', true);
      }
      this.sfx('bossshot', 0.7);
      this.bossTimer = 2.6 * pace;
    } else if (pick === 'charge') {
      const d = Math.hypot(px - b.s.x, py - b.s.y) || 1;
      b.mode = 1; b.t = 0.55; b.vx = (px - b.s.x) / d; b.vy = (py - b.s.y) / d;
      b.s.setTintFill(0xf83800);
      this.sfx('charge', 0.7);
      this.bossTimer = 2.4 * pace;
    } else if (pick === 'rollout') {
      // "Rolling out to 100%": four lines from the boss blink for 0.9 s, then sweep damage along them.
      b.mode = 5; b.t = 0.9; b.vy = Math.random() < 0.5 ? 0 : Math.PI / 4;
      this.sfx('charge', 0.7);
      this.bossTimer = 3.2 * pace;
      if (!this.seen.has('rollout')) { this.seen.add('rollout'); this.banner('NEW TRICK: ROLLOUT', 'Step off the blinking lines before they go live'); }
    } else if (pick === 'spiral') {
      b.mode = 4; b.t = 1.6; b.vx = 0;
      this.sfx('bossshot', 0.7);
      this.bossTimer = 2.8 * pace;
    } else {
      for (let i = 0; i < 6; i++) this.addEnemy(i % 2 ? 'splitter' : 'swarmer', b.s.x + Phaser.Math.Between(-40, 40), b.s.y + Phaser.Math.Between(-40, 40));
      this.bossTimer = 1.4 * pace;
    }
  }

  private spawnBoss() {
    const [x, y] = this.offscreenPoint();
    const s = this.add.sprite(x, y, spr('boss')).setDepth(6);
    s.play(anim('boss'));
    const v = this.bossVersion();
    // Affixes: 2.0 Rollout, 3.0 Race Condition... 8.0+ two random; heat 5 adds one more.
    const fx: BossAffix[] = [];
    if (v >= 2) {
      if (BOSS_AFFIX[v]) fx.push(BOSS_AFFIX[v]);
      else if (v >= 8) fx.push(...this.R.shuffle([...ZERO_DAY]).slice(0, 2));
      if (this.heat >= 5) { const extra = this.R.pick(ZERO_DAY.filter((a) => !fx.includes(a))); if (extra) fx.push(extra); }
    }
    this.bossAffixes = fx;
    this.bossPlates = fx.includes('monolith') ? 4 : 0;
    this.bossPlateDmg = 0;
    const base = 900 * this.diff.boss * (1 + Math.min(this.level, 25) / 25) * (1 + this.heat * 0.12);
    let hp = base;
    if (v >= 2) {
      // A marker, not a wall: sized so the build's real DPS takes about a minute (floor: the wave's HP curve).
      const floor = base * 2.5 * (this.wave >= 3 ? this.gpow(this.wave, 0) : 1);
      // Later bosses' affixes (plates, blinking, forks) soak more of the build's damage, so they need less HP per DPS.
      const focus = WAVE.bossFocus / (1 + 0.35 * Math.max(0, v - 3));
      hp = Math.max(floor, this.dps() * focus * (this.wave === 2 ? WAVE.bossT : WAVE.bossT3));
    }
    const sc = v >= 2 ? ACT2.bossScale : 1;
    const b: Enemy = { s, arch: 'tank', type: 3, hp, maxHp: hp, speed: 24 * (1 + 0.08 * (v - 1)), dmg: 20 * this.diff.dmg * this.dmgScale(), xp: 0,
      r: 22 * sc, kx: 0, ky: 0, flash: 0, slow: 1, hitAt: { sc }, alive: true, boss: true, elite: null, mode: 0, t: 0, vx: 0, vy: 0, acc: 0, accT: 0,
      accCrit: false, armour: 1, kb: 0, tint: null };
    if (v >= 2) { b.tint = [ACT2.bossTint, 0xf8b8f8, 0xf8d878, 0xa4e4fc, 0xb8f818, 0xf87858][(v - 2) % 6]; s.setTint(b.tint).setScale(sc); }
    this.enemies.push(b);
    this.boss = b;
    this.bossPhase = 1;
    this.bossAt = this.elapsed;
    this.bossTimer = 2.5;
    hooks.state = 'boss';
    this.sfx('boss');
    shake(this, 6, 500);
    hitstop(this, 120);
    const name = bossTitle(v).toUpperCase();
    this.banner(name, v >= 2 ? `Release ${v}.0. It learned new tricks` : `"${K.theme.game.boss.taunt}"`);
    for (const a of fx) this.banner(`NEW TRICK: ${AFFIX_TEXT[a][0]}`, AFFIX_TEXT[a][1]);
    if (v >= 2) this.banner(name, `"${K.theme.game.boss.taunt}"`);
    if (this.yolo) allHands(this, 18);
    if (!this.hud.bossBar) this.makeBossBar();
    this.hud.bossBar!.g.setVisible(true);
    this.hud.bossName?.setText(bossTitle(v)).setVisible(true);
  }

  /** Bottom right, beside the build icons; a narrow view is short of width, so the bar runs along the top, under the wave line. */
  private makeBossBar() {
    const narrow = NARROW();
    const bb = narrow ? bar(this, 6, 52, W - 42, 5, 0xf83800, 0x000000, K.ui.textInt) : bar(this, 250, H - 9, W - 256, 5, 0xf83800, 0x000000, K.ui.textInt);
    bb.g.setDepth(UI + 90);
    this.hud.bossBar = bb;
    this.hud.bossName = narrow
      ? text(this, 6, 61, K.theme.game.boss.name, { color: K.ui.accentInt, fixed: true, depth: UI + 90, maxWidth: W - 44, maxLines: 1 })
      : text(this, W - 6, H - 21, K.theme.game.boss.name, { align: 'right', color: K.ui.accentInt, fixed: true, depth: UI + 90,
        maxWidth: W - 256, maxLines: 1 });
  }

  private bossDown(b: Enemy) {
    if (this.over) return;
    this.kills++;
    this.sfx('explode');
    shake(this, 8, 700);
    hitstop(this, 220);
    this.cameras.main.flash(300, 255, 255, 255);
    this.tweens.add({ targets: b.s, alpha: 0, scale: 1.6, duration: 900, onComplete: () => b.s.destroy() });
    this.boss = null;
    this.hud.bossBar?.g.setVisible(false);
    this.hud.bossName?.setVisible(false);
    const fight = this.elapsed - this.bossAt;
    if (fight < 20) this.earn('apm');
    for (let k = 0; k < 8; k++) this.dropItem('coin', b.s.x + Phaser.Math.Between(-24, 24), b.s.y + Phaser.Math.Between(-24, 24));
    this.run.waves.push({ wave: this.wave, t: Math.round(this.elapsed), level: this.level, dps: Math.round(this.dps()), boss: Math.round(fight) });
    if (this.forceWin) { this.bossKills++; this.cashedOut = true; this.winNow(); return; }
    // Race Condition: the fork still lives, so the wave isn't clear yet.
    if (this.enemies.some((e) => e.twin && e.alive)) { this.bossWaiting = true; this.banner('ONE HALF DOWN', 'Kill the fork to ship it'); return; }
    this.waveClear();
  }

  /** The wave's boss (and its fork) are down: crests, lore, then SHIPPED (continue / cash out). */
  private waveClear() {
    if (this.over) return;
    this.bossKills++;
    const v = this.bossVersion();
    const sv = save();
    // Crests for clearing waves.
    if (this.wave === 1) {
      this.earn('a-default-crest');
      if (this.run.hitsWave1 === 0) this.earn('dev-experience');
      if (this.heat >= 3) this.earn('product-lead-sales-east');
      if (this.hog.startsWith('wizard')) this.earn('wizard-docs');
      if (!sv.cleared1.includes(this.hog)) { sv.cleared1.push(this.hog); persist(); }
      if (sv.cleared1.length >= 10) this.earn('client-libraries');
    }
    if (this.wave === 3 && this.heat >= 3) this.earn('forward-deployed-engineering');
    if (this.wave === 3 && this.heat >= 5) this.earn('product-led-sales-west');
    if (this.wave === 6 && this.waveFlags.minHp >= 0.5) this.earn('security');
    capture('wave_cleared', { wave: this.wave, t: Math.round(this.elapsed), level: this.level, dps: Math.round(this.dps()) });
    if (this.yolo) {
      // YOLO: no break. Max ships a release for you and the next wave starts right away.
      this.funding++;
      this.goldSafe = this.gold;
      const cards = drawRelease(this.build(), () => this.RC.next());
      const c = cards.reduce((a, x) => (botRank(x, this.build()) > botRank(a, this.build()) ? x : a));
      this.applyCard(c);
      floatText(this, this.player.x, this.player.y - 30, this.RC.pick(YOLO_SNARK).replace('{c}', this.cardName(c)), 0x3cbcfc, 0.8);
      this.startWave(this.wave + 1);
      return;
    }
    // Lore: the first time you beat each version, its handbook page; a merch relic from every boss after the first.
    this.dropPage(this.player.x - 20, this.player.y - 16, v - 1);
    if (v >= 2) this.dropRelic(this.player.x + 20, this.player.y - 16);
    this.actBreak();
  }

  // ---------------------------------------------------------------- shipped screen + next wave
  /** The boss is down: clear the field, then vN.0 SHIPPED with CONTINUE / CASH OUT. */
  private actBreak() {
    this.interlude = true;
    this.nextBossAt = Infinity; // startWave schedules the next boss
    hooks.state = 'actbreak';
    for (const pr of this.projs) if (pr.hostile) { pr.life = 0; pr.s.setVisible(false); }
    for (const e of [...this.enemies]) if (!e.boss && !e.reaper && e.arch !== 'crate') this.kill(e);
    this.gems.forEach((g) => { g.pull = true; g.t = Math.max(g.t, 0); }); // the field's XP flies in during the victory beat
    this.items.forEach((it) => { if (it.kind !== 'chest') it.pull = true; }); // lore and coins too
    const v = this.bossVersion();
    this.banner(v >= 2 ? `v${v}.0 SHIPPED!` : 'WAVE 1 CLEAR!', `${bossTitle(v)} is squashed`);
    this.time.delayedCall(1500, () => this.openActBreak());
  }

  private openActBreak(keep?: Keep) {
    if (this.over || this.won) return;
    if (!keep && (this.modal || this.paused)) { this.time.delayedCall(300, () => this.openActBreak()); return; } // a chest is open, or paused
    const ui = K.ui, narrow = NARROW();
    const objs: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { objs.push(o); return o; };
    this.showBanner(false);
    hooks.state = 'actbreak';
    const D = UI + 101;
    const T = (x: number, y: number, str: string, opts: Parameters<typeof text>[4]) => add(text(this, x, y, str, { fixed: true, depth: D, ...opts }));
    const v = this.bossVersion();
    const risk = this.gold - this.goldSafe;
    const bonus = this.cashBonus();
    const head = v >= 2 ? `v${v}.0 SHIPPED!` : 'WAVE 1 CLEAR!';
    const next = this.wave + 1;
    const opts: [string, string, number][] = [
      ['CONTINUE', `Wave ${next}: ${this.waveName(next)}. Pick a release, +${Math.round(WAVE.funding * 100)}% funding. Your gold is safe from here`, 0x58d854],
      ['CASH OUT', `Bank ${this.gold} gold${bonus ? ` + ${bonus} cash-out bonus` : ''} and end the run`, 0xf8d878],
    ];
    const warn = risk > 0 && this.wave >= 2 ? `${risk} gold at risk: die later, lose half. Cash out keeps it all.` : 'Keep going? Later waves have the biggest scores.';
    const footer = TOUCH ? 'TAP a choice, TAP it again to confirm' : 'Click or LEFT/RIGHT choose   double-click or ENTER confirm';
    const stats = `TIME ${clock(this.elapsed)}   BUGS ${this.kills}   LEVEL ${this.level}   SCORE ${this.score()}`;
    const art = (i: number, x: number, y: number) => add((i ? this.add.image(x, y + 2, spr('chest'), 0).setScale(2) : this.add.image(x, y, HOG32, hogFrame('rocket'))).setScrollFactor(0).setDepth(D + 1));
    const rects: Rect[] = [];
    add(this.add.rectangle(0, 0, W, H, 0x000000, 0.8).setName('fill').setOrigin(0).setScrollFactor(0).setDepth(UI + 100));
    if (narrow) {
      // Portrait: the two choices stack, each a wide row with its picture on the left; the block sits mid-screen.
      const cw = W - 16, ch = 86, x = 8;
      let y = 0;
      T(W / 2, y, head, { scale: fitScale(head, cw, 3), align: 'center', color: ui.accentInt, shadow: ui.panelInt });
      y += 32;
      y += T(W / 2, y, `${bossTitle(v)} is squashed. Nice work.`, { align: 'center', color: ui.textInt, maxWidth: cw, maxLines: 2 }).lineCount * 10 + 4;
      y += T(W / 2, y, stats, { align: 'center', color: 0xf8d878, maxWidth: cw, maxLines: 2 }).lineCount * 10 + 8;
      opts.forEach(([t, line, col], i) => {
        add(box(this, x, y, cw, ch, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(D));
        art(i, x + 28, y + ch / 2);
        T(x + 56, y + 8, t, { scale: 2, color: col, depth: D + 1 });
        T(x + 56, y + 30, line, { color: ui.dimInt, depth: D + 1, maxWidth: cw - 64, maxLines: 5 });
        rects.push({ x, y, w: cw, h: ch });
        y += ch + 8;
      });
      add(this.add.graphics().setScrollFactor(0).setDepth(UI + 103));
      y += T(W / 2, y, warn, { align: 'center', color: risk > 0 ? 0xf87858 : ui.textInt, maxWidth: cw, maxLines: 2 }).lineCount * 10 + 8;
      y += T(W / 2, y, footer, { align: 'center', color: ui.dimInt, maxWidth: cw, maxLines: 2 }).lineCount * 10;
      const dy = Math.max(6, Math.round(H / 2 - y / 2));
      this.shiftObjs(objs, 0, dy);
      rects.forEach((r) => { r.y += dy; });
    } else {
      const my = MY();
      T(W / 2, 14 + my, head, { scale: 3, align: 'center', color: ui.accentInt, shadow: ui.panelInt });
      T(W / 2, 44 + my, `${bossTitle(v)} is squashed. Nice work.`, { align: 'center', color: ui.textInt, maxWidth: W - 40, maxLines: 1 });
      T(W / 2, 58 + my, stats, { align: 'center', color: 0xf8d878, maxWidth: W - 30, maxLines: 1 });
      const cw = 200, gap = 16, x0 = (W - (cw * 2 + gap)) / 2, y = 76 + my;
      opts.forEach(([t, line, col], i) => {
        const x = x0 + i * (cw + gap);
        add(box(this, x, y, cw, 126, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(D));
        art(i, x + cw / 2, y + 24);
        T(x + cw / 2, y + 48, t, { scale: 2, align: 'center', color: col, depth: D + 1 });
        T(x + cw / 2, y + 70, line, { align: 'center', color: ui.dimInt, depth: D + 1, maxWidth: cw - 16, maxLines: 5 });
        rects.push({ x, y, w: cw, h: 126 });
      });
      add(this.add.graphics().setScrollFactor(0).setDepth(UI + 103));
      T(W / 2, 214 + my, warn, { align: 'center', color: risk > 0 ? 0xf87858 : ui.textInt, maxWidth: W - 20, maxLines: 1 });
      T(W / 2, 238 + my, footer, { align: 'center', color: ui.dimInt });
    }
    const m: Modal = { kind: 'act', cards: [], sel: 0, objs, armed: false, rects, rebuild: (k) => this.openActBreak(k) };
    m.at = keep?.at ?? this.time.now;
    this.modal = m;
    if (keep) {
      m.armed = keep.armed;
      if (!keep.armed) this.time.delayedCall(700, () => (m.armed = true));
      m.sel = keep.sel;
      if (m.sel >= 0) this.selectAct(m.sel, true);
      return;
    }
    this.sfx('evolve', 0.8);
    this.time.delayedCall(this.autopilot ? 300 : 700, () => (m.armed = true));
    if (TOUCH) m.sel = -1; else this.selectAct(0, true);
  }

  private selectAct(i: number, silent = false) {
    const m = this.modal;
    if (!m || m.kind !== 'act') return;
    m.sel = i;
    this.frameSel(m, i);
    if (!silent) this.sfx('move', 0.5);
  }

  private chooseAct(i: number) {
    const m = this.modal;
    if (!m || m.kind !== 'act' || !m.armed || i < 0) return;
    this.sfx('select');
    this.closeModal();
    if (i === 1) {
      this.cashedOut = true;
      capture('cash_out', { t: Math.round(this.elapsed), level: this.level, kills: this.kills, wave: this.wave });
      this.earn('new-business-sales');
      if (this.wave >= 3 && this.gold >= 500) this.earn('gtm-engineering');
      this.interlude = false;
      this.winNow();
    } else {
      // CONTINUE: this wave's gold merges (safe), the funding round lands, then the Release pick.
      this.goldSafe = this.gold;
      this.funding++;
      this.recalc();
      this.openLevelUp(drawRelease(this.build(), () => this.RC.next()), 'release');
    }
  }

  cashBonus() { return this.wave >= 2 ? Math.round((this.gold - this.goldSafe) * 0.15 * this.wave) : 0; }

  waveName(n: number) {
    if (WAVES[n]) return WAVES[n].name;
    return `SCALE ${n > REAPER_WAVE ? n - 9 : n - 8}`;
  }

  /** Start wave n: its modifiers, events, elites and boss timer; full HP; wave-start perks. */
  startWave(n: number) {
    const prevBest = save().bestWave;
    this.wave = n;
    this.toolsOpen = true;
    this.interlude = false;
    this.waveAt = this.elapsed;
    const T = this.elapsed;
    if (n === 3) this.hpBase = (1 + T / 150) * ACT2.hp1;
    const def = WAVES[n];
    this.waveMods = def ? (def.mod === 'none' ? [] : [def.mod]) : this.R.shuffle([...SCALE_MODS]).slice(0, 2);
    if (n > REAPER_WAVE) this.waveMods.push('reaper');
    const evs = n === 2 ? ACT2_EVENTS : LATE_EVENTS;
    const ts = this.yolo ? YOLO.bossEvery / WAVE.len : n >= 3 ? WAVE.lenLate / WAVE.len : 1;
    const extra = this.waveMods.includes('spikes') ? [{ at: 40, id: 'spike' as EventId }, { at: 135, id: 'spike' as EventId }] : [];
    this.evQueue = [...this.evQueue, ...[...evs, ...extra].map((e) => ({ at: T + e.at * ts, id: e.id }))].sort((a, b) => a.at - b.at);
    this.eliteQueue = [...this.eliteQueue, ...(n === 2 ? ACT2_ELITES : LATE_ELITES).map((t) => T + t * ts)].sort((a, b) => a - b);
    this.nextBossAt = T + this.waveLen();
    this.waveFlags = { offsite: false, killswitch: false, minHp: 1 };
    this.recalc();
    this.hp = this.st.maxHp;
    const sv = save();
    if (this.mode !== 'daily' && n > sv.bestWave) { sv.bestWave = n; persist(); }
    // Milestones and crests for reaching waves.
    if (n >= 3) this.unlock('caveman');
    if (n >= 5) this.unlock('terminator');
    if (n >= 5 && T < 14 * 60) this.earn('blitzscale');
    if (n >= 8) this.earn('cloud-foundations');
    if (n >= 10) this.earn('cloud-platform');
    capture('wave_start', { wave: n, t: Math.round(T), level: this.level, tools: [...this.weapons.keys()].filter(isTool), mods: this.waveMods });
    hooks.state = 'playing';
    this.sfx('boss', 0.5);
    this.cameras.main.flash(250, 120, 220, 120);
    const title = `WAVE ${n}: ${this.waveName(n)}`;
    const mods = this.waveMods.filter((m) => m !== 'reaper').map((m) => WAVE_MOD_TEXT[m]);
    this.banner(title, def?.sub ?? `Modifiers: ${mods.join(' + ')}`);
    if (this.trait === 'evolving' && (n === 3 || n === 6)) {
      this.player.setFrame(this.hogArtFrame());
      this.banner('YOUR HOGGIE EVOLVED!', `Now: ${hogName(EVOLVING_FORMS[n === 6 ? 2 : 1])}`);
      burst(this, this.player.x, this.player.y, 0xf8d878, 40, { speed: 200, gravity: 0 });
    }
    const p = this.player;
    if (n === 2) this.dropItem('autopilot', Phaser.Math.Clamp(p.x + 50, 20, WORLD_W - 20), p.y); // a first powerup to try
    if (n >= 2) this.dropItem('chest', Phaser.Math.Clamp(p.x - 50, 20, WORLD_W - 20), p.y, true); // the boss's chest
    if (this.releases.has('freetier')) this.dropItem('chest', p.x, Phaser.Math.Clamp(p.y + 50, 20, WORLD_H - 20));
    if (this.trait === 'selfdrive') this.pu.autopilot = 5 * this.st.dur;
    if (this.trait === 'rewind') this.dropItem('rewind', p.x + 30, p.y + 30);
    if (this.trait === 'angel' && this.revivesUsed > 0) { this.revivesUsed = Math.max(0, this.revivesUsed - 1); this.recalc(); }
    if (n === REAPER_WAVE) this.unlock('reaper');
    if (n >= REAPER_WAVE) this.time.delayedCall(20000 / this.simSpeed, () => { if (!this.over && this.wave >= REAPER_WAVE) spawnReaper(this); });
    if (n > prevBest && n >= 3 && this.mode !== 'daily') {
      this.time.delayedCall(1200, () => { if (!this.over) { this.banner('NEW PERSONAL BEST!', `Wave ${n}. The whole company showed up`); allHands(this, 24); } });
    }
  }

  /** Unlock a hoggie mid-run (milestones); it's announced at the end. */
  unlock(id: string) {
    if (this.run.unlocks.includes(id)) return;
    if (unlockHog(id)) { this.run.unlocks.push(id); floatText(this, this.player.x, this.player.y - 40, `NEW HOGGIE: ${hogName(id).toUpperCase()}`, 0x58d854, 0.8); }
  }

  /** The Reaper is down (it can happen, with a broken enough build). */
  private reaperDown(e: Enemy) {
    this.pool.push(e);
    e.s.setTexture(spr('enemy_1')).setScale(1).setAngle(0);
    this.banner('NOHOG IS DOWN?!', 'You filled the void... an angel appears');
    this.unlock('angel');
    shake(this, 10, 900);
    this.cameras.main.flash(500, 255, 255, 255);
    for (let k = 0; k < 20; k++) this.dropItem('coin', e.s.x + Phaser.Math.Between(-30, 30), e.s.y + Phaser.Math.Between(-30, 30), k < 5);
  }

  /** Gold that survives: everything on a cash-out (plus the bonus); from wave 2, only half of this wave's gold on death. */
  keptGold(cashed: boolean) {
    if (cashed) return this.gold + this.cashBonus();
    if (this.wave < 2) return this.gold;
    return this.goldSafe + Math.floor((this.gold - this.goldSafe) * 0.5);
  }

  private winNow() {
    if (this.won) return;
    this.won = true;
    this.pendingLevels = 0; // no level-up cards on the victory beat
    // Expire hostile shots (don't splice: this can run inside the projectile loop, when a shot kills the boss).
    for (const pr of this.projs) if (pr.hostile) { pr.life = 0; pr.s.setVisible(false); }
    for (const e of [...this.enemies]) if (!e.boss && !e.reaper) this.kill(e);
    this.time.delayedCall(1600, () => this.finish(true));
  }

  // ---------------------------------------------------------------- drawing & end
  private draw() {
    this.fx.clear();
    this.wfx.forEach((g) => g.clear());
    // Your own effects sit under the bugs and fade as the waves climb (evolved weapons most); bugs, their shots,
    // telegraphs and pickups stay fully visible. A weapon you just picked up stays bright for a while so you can see it.
    const a = this.fxAlpha();
    this.auraG.setAlpha(a);
    particleAlpha(this, a);
    for (const pr of this.projs) if (!pr.hostile) pr.s.setAlpha(this.wAlpha(pr.src));
    this.weapons.forEach((w) => {
      const wa = this.wAlpha(w.id);
      w.orbs.forEach((o) => o.setAlpha(wa));
      w.flags.forEach((f) => f.s.setAlpha(wa));
      w.drone?.setAlpha(wa);
      for (const it of w.items) if (typeof it?.s?.setAlpha === 'function') it.s.setAlpha(wa);
    });
    const gfx = (id: WeaponId) => {
      let g = this.wfx.get(id);
      if (!g) { g = this.add.graphics().setDepth(OWN + 0.2); this.wfx.set(id, g); }
      return g.setAlpha(this.wAlpha(id));
    };
    drawWeapons(this, gfx, this.auraG);
    drawTools(this, gfx);
    drawSystems(this, this.fx); // the drive-by lane and Nohog's void are threats: never faded
    this.drawMoat();
    this.drawShots();
    this.drawHazards();
    this.drawEnemyFx();
    this.drawBossFx();
    this.drawPowerFx();
    this.drawBlasts(hitstopped(this) ? 0 : 1 / 60);
    this.drawDark();
    this.drawJoy();
    // The hoggie: one pose, animated in code (bob and squash while walking, blink when hit).
    const t = this.time.now, p = this.player;
    const walk = this.moving && !this.modal && !this.paused;
    const bob = walk ? Math.abs(Math.sin(t / 70)) : 0;
    const sc = this.pu.hogzilla > 0 ? 1.5 : 1;
    p.setScale(sc * (1 + (walk ? 0.05 * bob : 0.02 * Math.sin(t / 400))), sc * (1 - (walk ? 0.06 * bob : 0.02 * Math.sin(t / 400))));
    p.setAngle(walk ? Math.sin(t / 110) * 5 : 0);
    if (this.pu.party > 0) p.setTint([0xf878f8, 0x58d854, 0x3cbcfc, 0xf8d878][Math.floor(t / 120) % 4]);
    else if (p.tintTopLeft !== 0xf83800 && p.isTinted && !this.over) p.clearTint();
    if (this.invuln > 0 && this.pu.autopilot <= 0) p.setAlpha(Math.floor(t / 60) % 2 ? 0.4 : 1);
    else p.setAlpha(1);
  }

  /** How opaque your weapons' effects are: fully until wave 3, then fainter, so late waves stay readable. */
  fxAlpha() { return this.wave >= 7 ? 0.45 : this.wave >= 5 ? 0.55 : this.wave >= 3 ? 0.7 : this.wave >= 2 ? 0.85 : 1; }

  /** One weapon's fade: fxAlpha, lower once evolved (v1.0+ looks calmer, not louder), but full for SPOTLIGHT seconds
   * after you pick it up so a late tool never gets lost under the ones you maxed early. Other sources use fxAlpha. */
  wAlpha(src: string) {
    const w = this.weapons.get(src as WeaponId), base = this.fxAlpha();
    if (!w) return base;
    const calm = base * (w.evo ? 0.6 : 1) * (w.major ? 0.85 : 1);
    const age = this.elapsed - w.born;
    return age < SPOTLIGHT ? 1 : age < SPOTLIGHT + 3 ? 1 + (calm - 1) * ((age - SPOTLIGHT) / 3) : calm;
  }

  /** Enemy shots: a pulsing red halo and a short trail, so an incoming shot pops out of any swarm. */
  private drawShots() {
    const g = this.shotG;
    g.clear();
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 70);
    for (const pr of this.projs) {
      if (!pr.hostile) continue;
      const x = pr.s.x, y = pr.s.y, sp = Math.hypot(pr.vx, pr.vy) || 1, tx = x - (pr.vx / sp) * 14, ty = y - (pr.vy / sp) * 14;
      g.lineStyle(4, 0xf83800, 0.35).lineBetween(tx, ty, x, y).lineStyle(2, 0xfca044, 0.6).lineBetween(x - (pr.vx / sp) * 8, y - (pr.vy / sp) * 8, x, y);
      g.fillStyle(0xf83800, 0.25 + 0.2 * pulse).fillCircle(x, y, 6 + 1.5 * pulse);
      g.lineStyle(1, 0xfcfcfc, 0.5 + 0.4 * pulse).strokeCircle(x, y, 7 + 1.5 * pulse);
    }
  }

  /** Outage: the lights go out beyond a circle around the hog. */
  private drawDark() {
    const g = this.darkG;
    g.clear();
    if (!this.waveMods.includes('outage') || this.interlude) return;
    const p = this.player, r = 105 + Math.sin(this.time.now / 300) * 3;
    g.lineStyle(700, 0x000000, 0.88).strokeCircle(p.x, p.y, r + 350);
    g.lineStyle(24, 0x000000, 0.45).strokeCircle(p.x, p.y, r - 12);
  }

  score() {
    const base = this.kills * 10 + (this.level - 1) * 100 + Math.floor(this.elapsed) * 5;
    let waves = 0;
    for (let w = 1; w <= this.bossKills; w++) waves += 2000 * w;
    return Math.round((base + waves + (this.cashedOut ? 3000 * this.wave : 0)) * (1 + this.heat * 0.2));
  }

  finish(won: boolean) {
    if (this.over) return;
    this.over = true;
    if (this.modal) { this.modal.objs.forEach((o) => o.destroy()); this.modal = null; }
    this.pauseObjs.forEach((o) => o.destroy());
    this.pauseObjs = [];
    won = this.bossKills > 0 || this.cashedOut;
    this.won = won;
    const score = this.score();
    const survived = clock(this.elapsed);
    const sv = save();
    // Bank gold and lifetime totals, then check run crests.
    const kept = this.keptGold(this.cashedOut);
    sv.kills += this.kills;
    sv.gold += kept;
    sv.elites += this.run.elites;
    sv.aiKills += this.run.aiKills;
    try { meta.bank(kept); } catch { /* storage trouble: the gold is lost, the game goes on */ }
    if (this.mode === 'daily') {
      const d = today();
      if (sv.daily.date !== d) sv.daily = { date: d, best: 0 };
      sv.daily.best = Math.max(sv.daily.best, score);
      sv.dailies++;
      this.earn('customer-success-eu');
      if (sv.dailies >= 7) this.earn('customer-success-na');
    }
    persist();
    this.earn('onboarding');
    if (sv.kills >= 100000) this.earn('clickhouse');
    if (sv.gold >= 1000) this.earn('billing');
    if (sv.elites >= 50) this.earn('customer-analytics');
    if (sv.aiKills >= 1000) this.earn('ai-gateway');
    if (score >= 250000) this.earn('marketing');
    try { if (meta.data.runs + 1 >= 10) this.earn('builder-relations'); } catch { /* ignore */ }
    // Capsules: one per wave cleared after the first (max 5), each a random new hoggie.
    const caps = Math.min(5, Math.max(0, this.bossKills - 1));
    for (let i = 0; i < caps; i++) { const h = rollCapsule(); if (h && unlockHog(h)) this.run.unlocks.push(h); }
    this.rosterCrests();
    // End-screen lines: damage split, unlocks.
    const total = Object.entries(this.dmgBy).filter(([k]) => k !== 'debug').reduce((a, [, b]) => a + b, 0) || 1;
    const label = (k: string) => (WEAPONS as Record<string, { short: string }>)[k]?.short ?? (k === 'super' ? 'Nova' : k.charAt(0).toUpperCase() + k.slice(1));
    const headline = this.cashedOut ? (this.wave >= 2 ? `SHIPPED v${this.wave}.0!` : 'BUGS SQUASHED!')
      : !won ? 'GAME OVER' : `REACHED WAVE ${this.wave}`;
    const top = Object.entries(this.dmgBy).filter(([k]) => k !== 'debug').sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, v]) => `${label(k)} ${Math.round((v / total) * 100)}%`);
    lastRun.lines = [];
    if (top.length) lastRun.lines.push(`DAMAGE  ${top.join('  ')}`);
    const newHogs = [...new Set(this.run.unlocks)];
    if (newHogs.length) lastRun.lines.push(`NEW HOGGIES: ${newHogs.slice(0, 3).map((h) => hogName(h).toUpperCase()).join(', ')}${newHogs.length > 3 ? ` +${newHogs.length - 3}` : ''}`);
    else if (this.mode === 'daily') lastRun.lines.push(`DAILY BEST TODAY ${sv.daily.best}`);
    else lastRun.lines.push(`BEST WAVE ${sv.bestWave}   HOGGIES ${sv.hogs.length}/${HOGS.length}`);
    const products = [...this.weapons.keys()];
    finishRun({ won, score, stats: { kills: this.kills, level: this.level } });
    const go = () => this.scene.start('End', {
      won, score,
      headline,
      stats: [['Survived', `${survived} (wave ${this.wave})`], ['Bugs squashed', this.kills], ['Level', this.level],
        ['Gold', `+${kept}${kept < this.gold ? ` of ${this.gold}` : ''} (bank ${meta.data.coins})`]],
      props: { level: this.level, kills: this.kills, products, gold: kept, hog: this.hog, evolutions: this.run.evolutions,
        elites: this.run.elites, boss_kills: this.bossKills, wave: this.wave, cashed_out: this.cashedOut, powerups: this.run.powerups,
        releases: [...this.releases.keys()], yolo: this.yolo },
    });
    if (!won) {
      this.player.setTintFill(0xf83800);
      this.tweens.add({ targets: this.player, angle: 360, alpha: 0, duration: 800 });
    }
    // New hoggies: a reveal before the end screen.
    if (newHogs.length && !this.autopilot && !this.skipReveal) this.time.delayedCall(won ? 300 : 1000, () => this.showReveal(newHogs, go));
    else this.time.delayedCall(won ? 200 : 900, go);
  }

  /** Roster-size crests. */
  private rosterCrests() {
    const sv = save();
    if (sv.hogs.length >= 25) this.earn('graphics');
    if (sv.hogs.length >= 50) this.earn('people-ops');
    if (Object.keys(SIGNATURE).every((id) => sv.hogs.includes(id) || id === 'angel')) this.earn('talent');
  }

  /** "NEW HOGGIES!": portraits pop in one by one; any key goes on to the end screen. */
  private showReveal(ids: string[], then: () => void) {
    const ui = K.ui;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const D = UI + 150;
    objs.push(this.add.rectangle(0, 0, W, H, 0x000000, 0.85).setName('fill').setOrigin(0).setScrollFactor(0).setDepth(D));
    objs.push(text(this, W / 2, 20, ids.length > 1 ? 'NEW HOGGIES!' : 'NEW HOGGIE!', { scale: 3, align: 'center', color: 0xf8d878, fixed: true, depth: D + 1 }));
    const show = ids.slice(0, 8);
    const cols = Math.min(NARROW() ? 2 : 4, show.length), cw = 108, x0 = W / 2 - (cols * cw) / 2 + cw / 2;
    const rowsN = Math.ceil(show.length / cols);
    // A narrow screen stacks up to four rows: the block is laid out from the top, then centred as a whole.
    const gy = (i: number) => 94 + Math.floor(i / cols) * 86;
    show.forEach((id, i) => {
      const x = x0 + (i % cols) * cw, y = gy(i);
      const img = this.add.image(x, y, HOG64, hogFrame(id)).setScrollFactor(0).setDepth(D + 1).setScale(0);
      const nm = text(this, x, y + 36, hogName(id).toUpperCase(), { align: 'center', color: isSignature(id) ? 0xf8d878 : ui.textInt, fixed: true, depth: D + 1, maxWidth: cw - 6, maxLines: 1 });
      nm.setAlpha(0);
      objs.push(img, nm);
      this.tweens.add({ targets: img, scale: 1, duration: 300, delay: 250 * i, ease: 'Back.Out', onStart: () => this.sfx('select', 0.6) });
      this.tweens.add({ targets: nm, alpha: 1, duration: 200, delay: 250 * i + 200 });
    });
    const fy = NARROW() ? gy((rowsN - 1) * cols) + 56 : 240;
    if (ids.length > 8) objs.push(text(this, W / 2, fy, `+${ids.length - 8} more in MERCH > HOGGIES`, { align: 'center', color: ui.dimInt, fixed: true, depth: D + 1 }));
    objs.push(text(this, W / 2, fy + 12, `Pick one in MERCH > HOGGIES.   ${TOUCH ? 'TAP' : 'ENTER'}`, { align: 'center', color: ui.dimInt, fixed: true, depth: D + 1, maxWidth: W - 12, maxLines: 2 }));
    this.shiftObjs(objs, 0, NARROW() ? Math.max(0, Math.round(H / 2 - (fy + 24) / 2)) : MY());
    this.revealing = true; // onKey lets the reveal's ENTER through while the run is over
    const m: Modal = { kind: 'reveal', cards: [], sel: 0, objs, armed: false };
    m.at = this.time.now;
    this.modal = m;
    hooks.state = 'reveal';
    this.time.delayedCall(700 + 250 * show.length, () => (m.armed = true));
    const origClose = this.closeModal.bind(this);
    this.closeModal = () => { origClose(); this.closeModal = origClose; this.revealing = false; then(); };
    this.time.delayedCall(5000, () => { if (this.modal === m) this.closeModal(); });
  }

  // ---------------------------------------------------------------- test hooks
  private installDebug() {
    const prods = () => K.theme.products as ProductId[];
    const evolveAll = () => {
      this.weapons.forEach((w) => {
        const pid = WEAPONS[w.id].evo?.passive;
        if (w.evo || !pid) return;
        w.level = MAX_LEVEL;
        if (!this.passives.has(pid)) this.passives.set(pid, 1);
        this.evolve(w);
      });
      this.recalc();
      this.refreshIcons();
    };
    const killBoss = () => {
      this.elapsed = Math.max(this.elapsed, this.nextBossAt); this.runBoss(0);
      if (this.boss) this.damage(this.boss, this.boss.hp + 1, 0, 0, 'debug', true, true);
      for (const e of this.enemies.filter((x) => x.twin)) this.damage(e, e.hp + 1, 0, 0, 'debug', true, true);
    };
    hooks.debug = {
      warp: (s: number) => { this.elapsed = s; this.evQueue = this.evQueue.filter((e) => e.at > s); this.eliteQueue = this.eliteQueue.filter((t) => t > s); },
      speed: (n: number) => { this.simSpeed = Math.max(1, Math.min(8, Math.round(n))); setJuiceSpeed(this.simSpeed); },
      god: (on = true) => { this.god = !!on; },
      autopilot: (on = true, style = '') => { this.autopilot = !!on; this.novice = style === 'novice'; },
      botCash: (wave = 99) => { this.botCashAt = wave; },
      holdLevels: (on = true) => { this.holdLevels = !!on; this.pendingLevels = 0; },
      spawnBoss: () => { this.elapsed = Math.max(this.elapsed, this.nextBossAt); },
      hurtBoss: (frac = 1) => { if (this.boss) this.damage(this.boss, this.boss.maxHp * frac, 0, 0, 'debug', true, true); },
      giveAll: () => { prods().forEach((id) => this.addWeapon(id)); },
      maxAll: () => { this.weapons.forEach((w) => (w.level = MAX_LEVEL)); this.refreshIcons(); },
      evolveAll,
      evolve: (id: WeaponId) => {
        const w = this.weapons.get(id), evo = WEAPONS[id]?.evo;
        if (w && evo) { this.passives.set(evo.passive, 1); w.level = MAX_LEVEL; this.evolve(w); }
      },
      // Ladder hooks: killBoss() beats the current wave's boss (SHIPPED screen), wave(n) jumps straight into wave n,
      // release(id) / major(id) apply a release card, tool(id) / tools() give tools, powerup(kind) drops a powerup.
      killBoss,
      act2: killBoss,
      wave: (n = 2) => { this.closeModal(); this.boss?.s.destroy(); this.boss = null; this.interlude = false; this.startWave(Math.max(2, n | 0)); },
      startAct2: () => { this.closeModal(); this.startWave(2); },
      finalBoss: () => { if (!this.boss) this.elapsed = Math.max(this.elapsed, this.nextBossAt); },
      bossHere: (dx = 110) => { if (this.boss) this.boss.s.setPosition(this.player.x + dx, this.player.y - 20); },
      bossHp: (mult = 10) => { if (this.boss) { this.boss.maxHp *= mult; this.boss.hp = this.boss.maxHp; } },
      tool: (id: ToolId = 'web_analytics') => { this.toolsOpen = true; this.addWeapon(id); this.recalc(); this.refreshIcons(); },
      tools: () => { this.toolsOpen = true; TOOL_IDS.forEach((id) => this.addWeapon(id)); this.recalc(); this.refreshIcons(); },
      release: (id: ReleaseId = 'hedgehog') => this.applyCard({ kind: 'release', id }),
      major: (id: WeaponId) => this.applyCard({ kind: 'major', id }),
      patch: (id: WeaponId, n = 1) => { const w = this.weapons.get(id); if (w) { w.level = MAX_LEVEL; w.patch += n; } },
      powerup: (kind: PowerId = 'autopilot') => { this.dropItem(kind, this.player.x + 20, this.player.y); },
      activate: (kind: PowerId = 'autopilot') => this.activatePowerup(kind),
      relic: () => this.dropRelic(this.player.x + 20, this.player.y),
      page: (n?: number) => this.dropPage(this.player.x + 20, this.player.y, n),
      superNova: () => { this.superNova = true; },
      passives: (lvl = 1) => {
        (Object.keys(PASSIVES) as PassiveId[]).slice(0, 6).forEach((id) => this.passives.set(id, Math.min(PASSIVES[id].max, lvl)));
        this.recalc(); this.refreshIcons();
      },
      passive: (id: PassiveId, lvl = 1) => { this.passives.set(id, Math.min(PASSIVES[id].max, lvl)); this.recalc(); this.refreshIcons(); },
      chest: (big = false) => { this.dropItem('chest', this.player.x + 20, this.player.y, !!big); },
      pickup: (kind: ItemKind = 'vacuum') => { this.dropItem(kind, this.player.x + 20, this.player.y); },
      hotfix: () => this.hotfix(),
      crate: () => { this.addEnemy('crate', this.player.x + 40, this.player.y); },
      puddle: () => { this.puddles.push({ x: this.player.x + 60, y: this.player.y, r: 6, age: 0 }); },
      elite: (arch: ArchId = 'tank') => { this.spawnElite(arch); },
      event: (id: EventId = 'stampede') => this.startEvent(id),
      spawn: (arch: ArchId = 'charger', n = 5) => {
        for (let i = 0; i < n; i++) { const [x, y] = this.offscreenPoint(); if (arch === 'race') this.spawnRace(x, y); else this.addEnemy(arch, x, y); }
      },
      reaper: () => spawnReaper(this),
      driveBy: () => startDriveBy(this),
      allHands: (n = 24) => allHands(this, n),
      pr: () => selfDrivingPr(this),
      heat: (n: number) => { this.heat = Math.max(0, Math.min(5, n | 0)); },
      gold: (n = 100) => { this.gold += n; },
      numbers: (on = true) => { this.numbers = !!on; },
      xp: (n: number) => this.gainXp(n),
      flood: (n = 300) => { for (let i = 0; i < n; i++) { const [x, y] = this.offscreenPoint(); this.addEnemy((['swarmer', 'splitter', 'tank'] as ArchId[])[i % 3], x, y); } },
      lose: () => { if (!this.won) { this.skipReveal = true; this.finish(false); } },
      // For the gameplay GIF: a mid-game swarm with evolved weapons going.
      showcase: () => {
        this.elapsed = 150;
        // Level 15 so level-up cards interrupt the GIF less often.
        this.level = 15;
        this.xpNext = xpFor(this.level);
        this.evQueue = this.evQueue.filter((e) => e.at > 150);
        this.eliteQueue = [];
        prods().slice(0, 4).forEach((id) => this.addWeapon(id));
        evolveAll();
        this.hp = this.st.maxHp;
        for (let i = 0; i < 150; i++) { const [x, y] = this.offscreenPoint(); this.addEnemy((['swarmer', 'splitter', 'tank', 'charger', 'exploder'] as ArchId[])[i % 5], x, y); }
        this.spawnElite('tank');
      },
      win: () => { this.heat = Math.min(this.heat, 4); this.forceWin = true;
        this.elapsed = Math.max(this.elapsed, this.nextBossAt); this.runBoss(0);
        if (this.boss) this.damage(this.boss, this.boss.hp + 1, 0, 0, 'debug', true, true);
        else if (!this.won) { this.cashedOut = true; this.bossKills = Math.max(1, this.bossKills); this.winNow(); } },
      unlockAll: () => { const r = sharedDebug.unlockAll?.(); return r; },
    };
  }
}

/** XP to the next level; past level 40 the curve steepens (late levels are patches, not new weapons). */
const xpFor = (l: number) => Math.floor(3 + l * 2.2 + l ** 1.3 + (l > 40 ? (l - 40) ** 1.8 : 0));

function punchText(t: PixelText) {
  if (t.scale !== 1) return;
  t.scene.tweens.add({ targets: t, scale: 1.25, duration: 60, yoyo: true, onComplete: () => t.setScale(1) });
}
