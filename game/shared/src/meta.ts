// Meta progression that survives between runs: one versioned JSON blob in localStorage per
// kit id + game slug (theme/manifest.json). Every read/write is try/catch; blocked or broken storage
// silently falls back to an in-memory blob, so the worst case is always "first run", never a crash.
//
//   import { meta, achieve, dailySeed, rng } from '@shared/meta';
//   meta.data                 the blob (runs, wins, bestScore, coins, unlocks, achievements, kit: {...})
//   meta.recordRun({won, score, durationS, heat?, mode?, stats?}) -> RunResult {newBest, firstWin, heatUnlocked...}
//                             (EndScene calls this for you if the kit hasn't for the current run)
//   meta.bank(n) / meta.spend(n) -> bool     between-runs currency (meta.data.coins)
//   meta.unlock(id) -> bool (true if new) / meta.has(id)
//   meta.heatUnlocked()       highest heat (0-5) the player may pick = highest heat cleared + 1
//   meta.kitData<T>(defaults) free-form per-kit save space (meta.data.kit), merged over defaults; call save() after changing
//   meta.achievements()       the kit's table (KitDef.achievements) with got flags; hidden+missing ones read "???"
//   achieve(id) -> bool       idempotent; true + a toast the first time
//   dailySeed()               stable 32-bit seed for today's UTC date + slug
//   rng(seed)                 mulberry32: next() int(a,b) float(a,b) chance(p) pick(arr) shuffle(arr)
// Hooks: __game.meta (the blob), __game.debug.resetMeta(), .unlockAll(), .meta(patch?) (always present,
// even after a kit replaces hooks.debug).
import { hooks, sharedDebug } from './hooks';

export interface AchievementDef {
  id: string;
  name: string;   // short, ASCII, fits a toast (<= 24 chars reads best)
  desc: string;
  hidden?: boolean;
}

export interface RunInput {
  won: boolean;
  score: number;
  durationS: number;
  heat?: number;
  mode?: string;
  stats?: Record<string, unknown>;
}

export interface RunResult {
  newBest: boolean;       // score beat the previous best (and previous best > 0 or first scoring run)
  prevBest: number;
  firstWin: boolean;
  fastestWin: boolean;    // won faster than any previous win
  heatUnlocked: number | null; // a new heat level became pickable
  runNumber: number;
  streak: number;
}

export interface MetaBlob {
  v: number;
  runs: number;
  wins: number;
  bestScore: number;
  fastestWinS: number;    // 0 = no win yet
  longestRunS: number;
  maxHeatCleared: number; // -1 = none
  streak: number;         // consecutive wins
  bestStreak: number;
  coins: number;
  unlocks: string[];
  achievements: Record<string, number>; // id -> unix ms first unlocked
  settings: { reducedMotion: boolean };
  history: { won: boolean; score: number; durationS: number; heat: number; mode: string; t: number }[]; // last 10
  kit: Record<string, unknown>;
}

const VERSION = 1;
export const MAX_HEAT = 5;

function fresh(): MetaBlob {
  let reduced = false;
  try { reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
  return { v: VERSION, runs: 0, wins: 0, bestScore: 0, fastestWinS: 0, longestRunS: 0, maxHeatCleared: -1, streak: 0,
    bestStreak: 0, coins: 0, unlocks: [], achievements: {}, settings: { reducedMotion: reduced }, history: [], kit: {} };
}

const num = (v: unknown, d: number, lo = -1e12, hi = 1e12) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Take whatever parsed out of storage and keep only well-typed fields. */
function clean(raw: unknown): MetaBlob {
  const b = fresh();
  if (!isObj(raw)) return b;
  for (const k of ['runs', 'wins', 'bestScore', 'fastestWinS', 'longestRunS', 'streak', 'bestStreak', 'coins'] as const) {
    b[k] = Math.floor(num(raw[k], 0, 0));
  }
  b.maxHeatCleared = Math.floor(num(raw.maxHeatCleared, -1, -1, MAX_HEAT));
  if (Array.isArray(raw.unlocks)) b.unlocks = raw.unlocks.filter((x: unknown) => typeof x === 'string').slice(0, 500);
  if (isObj(raw.achievements)) {
    for (const [k, v] of Object.entries(raw.achievements)) if (typeof v === 'number') b.achievements[k] = v;
  }
  if (isObj(raw.settings) && typeof raw.settings.reducedMotion === 'boolean') b.settings.reducedMotion = raw.settings.reducedMotion;
  if (Array.isArray(raw.history)) b.history = raw.history.filter(isObj).slice(-10) as MetaBlob['history'];
  if (isObj(raw.kit)) b.kit = raw.kit;
  return b;
}

let key = 'phkit:default:unknown';
let memory: string | null = null; // fallback store when localStorage is blocked
let blob: MetaBlob = fresh();
let table: AchievementDef[] = [];
let slug = 'default';
let onAchieve: (def: AchievementDef) => void = () => {};

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__phkit_probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export const meta = {
  get data() { return blob; },
  get slug() { return slug; },

  load(): MetaBlob {
    let raw: string | null = null;
    try { raw = storage()?.getItem(key) ?? memory; } catch { raw = memory; }
    try { blob = clean(raw ? JSON.parse(raw) : null); } catch { blob = fresh(); }
    return blob;
  },

  save() {
    let s = '';
    try { s = JSON.stringify(blob); } catch { return; }
    memory = s;
    try { storage()?.setItem(key, s); } catch { /* quota or blocked: memory copy is enough */ }
  },

  reset() {
    blob = fresh();
    memory = null;
    try { storage()?.removeItem(key); } catch { /* ignore */ }
  },

  recordRun(r: RunInput): RunResult {
    const score = Math.max(0, Math.floor(num(r.score, 0)));
    const dur = Math.max(0, num(r.durationS, 0));
    const heat = Math.floor(num(r.heat, 0, 0, MAX_HEAT));
    const prevBest = blob.bestScore;
    const heatBefore = meta.heatUnlocked();
    const firstWin = r.won && blob.wins === 0;
    const fastestWin = r.won && dur > 0 && (blob.fastestWinS === 0 || dur < blob.fastestWinS);
    blob.runs++;
    if (r.won) {
      blob.wins++;
      blob.streak++;
      blob.bestStreak = Math.max(blob.bestStreak, blob.streak);
      blob.maxHeatCleared = Math.max(blob.maxHeatCleared, heat);
      if (fastestWin) blob.fastestWinS = Math.round(dur);
    } else {
      blob.streak = 0;
    }
    blob.longestRunS = Math.max(blob.longestRunS, Math.round(dur));
    const newBest = score > prevBest;
    if (newBest) blob.bestScore = score;
    blob.history.push({ won: !!r.won, score, durationS: Math.round(dur), heat, mode: String(r.mode ?? ''), t: Date.now() });
    blob.history = blob.history.slice(-10);
    const heatAfter = meta.heatUnlocked();
    meta.save();
    return { newBest, prevBest, firstWin, fastestWin, heatUnlocked: heatAfter > heatBefore ? heatAfter : null,
      runNumber: blob.runs, streak: blob.streak };
  },

  bank(n: number) {
    blob.coins = Math.max(0, blob.coins + Math.floor(num(n, 0)));
    meta.save();
    return blob.coins;
  },

  spend(n: number): boolean {
    n = Math.floor(num(n, 0, 0));
    if (blob.coins < n) return false;
    blob.coins -= n;
    meta.save();
    return true;
  },

  unlock(id: string): boolean {
    if (blob.unlocks.includes(id)) return false;
    blob.unlocks.push(id);
    meta.save();
    return true;
  },

  has: (id: string) => blob.unlocks.includes(id),

  heatUnlocked: () => Math.min(MAX_HEAT, blob.maxHeatCleared + 1),

  /** Free-form per-kit save data, merged over `defaults` (kept on meta.data.kit). Call meta.save() after edits. */
  kitData<T extends Record<string, unknown>>(defaults: T): T {
    for (const [k, v] of Object.entries(defaults)) if (!(k in blob.kit)) blob.kit[k] = v;
    return blob.kit as T;
  },

  achievements: () => table.map((a) => {
    const got = a.id in blob.achievements;
    return { ...a, got, name: got || !a.hidden ? a.name : '???', desc: got || !a.hidden ? a.desc : '???' };
  }),

  /** "3/12" or '' when the kit has no achievements. */
  achievementCount: () => (table.length ? `${table.filter((a) => a.id in blob.achievements).length}/${table.length}` : ''),

  reducedMotion: () => blob.settings.reducedMotion,
  setReducedMotion(on: boolean) { blob.settings.reducedMotion = !!on; meta.save(); },
};

/** Unlock an achievement. Idempotent: returns true (and toasts) only the first time. */
export function achieve(id: string): boolean {
  if (id in blob.achievements) return false;
  blob.achievements[id] = Date.now();
  meta.save();
  const def = table.find((a) => a.id === id) ?? { id, name: id, desc: '' };
  try { onAchieve(def); } catch { /* a toast must never break the game */ }
  hooks.events.push({ event: 'achievement', props: { id }, t: Math.round(performance.now()) });
  return true;
}

/** Called once by startKit. */
export function initMeta(kitId: string, gameSlug: string, achievements: AchievementDef[] | undefined,
  toast: (def: AchievementDef) => void) {
  slug = gameSlug || 'default';
  key = `phkit:${slug}:${kitId}`;
  table = Array.isArray(achievements) ? achievements : [];
  onAchieve = toast;
  meta.load();
  Object.defineProperty(hooks, 'meta', { get: () => blob, configurable: true, enumerable: true });
  Object.assign(sharedDebug, {
    resetMeta: () => { meta.reset(); return blob; },
    unlockAll: () => {
      // Fake a seasoned player: every achievement, every heat, some runs and coins.
      const now = Date.now();
      for (const a of table) blob.achievements[a.id] ??= now;
      blob.maxHeatCleared = MAX_HEAT;
      blob.runs = Math.max(blob.runs, 12);
      blob.wins = Math.max(blob.wins, 7);
      blob.bestScore = Math.max(blob.bestScore, 12345);
      blob.coins = Math.max(blob.coins, 999);
      meta.save();
      return blob;
    },
    meta: (patch?: Partial<MetaBlob>) => {
      if (isObj(patch)) { blob = clean({ ...blob, ...patch }); meta.save(); }
      return blob;
    },
    reducedMotion: (on = true) => meta.setReducedMotion(!!on),
  });
}

// ---------------------------------------------------------------- seeds

/** FNV-1a 32-bit hash of a string. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable seed for today's UTC date + the game slug: everyone playing this game today gets the same run. */
export function dailySeed(date = new Date()): number {
  return hash32(`${date.toISOString().slice(0, 10)}|${slug}`);
}

export const randomSeed = () => (Math.random() * 0x100000000) >>> 0;

export interface Rng {
  seed: number;
  next(): number;                 // [0, 1)
  int(a: number, b: number): number; // inclusive
  float(a: number, b: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: T[]): T[];      // in place, returns arr
}

/** mulberry32 seeded RNG. */
export function rng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r: Rng = {
    seed: seed >>> 0,
    next,
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    float: (a, b) => a + next() * (b - a),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
  return r;
}
