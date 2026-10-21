// Kit save data (shop levels, hoggies, lifetime totals, collections, daily best, evolution codex) on top of the
// shared meta blob. Everything is defensive: a broken or blocked store reads as a first run.
import { meta, achieve } from '@shared/meta';
import { RELIC_IDS, PAGES, MERCH } from './content';
import { HOGS, HOG_INDEX, DEFAULT_HOG, STARTERS, SECRET_HOGS, SIGNATURE, EVOLVING_FORMS } from './hoggies';
import { LEGACY, LEGACY_HEROES, CREST_BY_ID } from './crests';

export interface KitSave {
  shop: Record<string, number>; // the old upgrade levels (refunded as gold when merch replaced them)
  hero: string;           // legacy hero id (pre-hoggies)
  hog: string;            // selected hoggie
  hogs: string[];         // unlocked hoggies
  capsules: number;       // bought from the shop (price rises)
  kills: number;          // lifetime
  gold: number;           // lifetime earned
  chests: number;
  elites: number;
  revives: number;
  aiKills: number;
  dailies: number;        // (the daily mode is gone; kept for old saves)
  coops: number;          // co-op games finished
  bestWave: number;       // highest wave reached (any mode but daily)
  cleared1: string[];     // hoggies that have cleared wave 1 (client-libraries crest)
  relics: string[];       // merch collected
  merch: Record<string, number>; // merch owned: copies of each (they stack)
  pages: number[];        // handbook pages found
  codex: string[];        // evolution names found
  daily: { date: string; best: number };
  numbers: boolean;       // damage numbers on/off
  migrated: number;
}

const defaults = (): KitSave => ({ shop: {}, hero: 'max', hog: DEFAULT_HOG, hogs: [], capsules: 0, kills: 0, gold: 0, chests: 0, elites: 0,
  revives: 0, aiKills: 0, dailies: 0, coops: 0, bestWave: 0, cleared1: [], relics: [], merch: {}, pages: [], codex: [], daily: { date: '', best: 0 }, numbers: true,
  migrated: 0 });

const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, max) : []);

let migrating = false;

/** The kit's save, repaired field by field. */
export function save(): KitSave {
  let k: any;
  try { k = meta.kitData(defaults() as unknown as Record<string, unknown>); } catch { return defaults(); }
  if (!k || typeof k !== 'object') return defaults();
  if (!k.shop || typeof k.shop !== 'object' || Array.isArray(k.shop)) k.shop = {};
  refundShop(k);
  for (const f of ['kills', 'gold', 'chests', 'elites', 'revives', 'aiKills', 'dailies', 'coops', 'bestWave', 'capsules', 'migrated']) k[f] = Math.max(0, n(k[f]));
  k.codex = strs(k.codex, 60);
  k.hogs = strs(k.hogs, 400).filter((h: string) => HOG_INDEX.has(h));
  k.cleared1 = strs(k.cleared1, 400);
  k.relics = strs(k.relics, 20).filter((r: string) => (RELIC_IDS as string[]).includes(r));
  if (!k.merch || typeof k.merch !== 'object' || Array.isArray(k.merch)) k.merch = {};
  for (const id of Object.keys(k.merch)) if (!(id in MERCH)) delete k.merch[id]; else k.merch[id] = Math.max(0, Math.min(50, Math.floor(n(k.merch[id]))));
  delete k.wear;
  k.pages = Array.isArray(k.pages) ? k.pages.filter((p: unknown) => typeof p === 'number' && p >= 0 && p < PAGES.length) : [];
  if (typeof k.hero !== 'string') k.hero = 'max';
  if (typeof k.hog !== 'string' || !HOG_INDEX.has(k.hog)) k.hog = DEFAULT_HOG;
  if (!k.daily || typeof k.daily !== 'object') k.daily = { date: '', best: 0 };
  k.daily = { date: String(k.daily.date ?? ''), best: Math.max(0, n(k.daily.best)) };
  if (typeof k.numbers !== 'boolean') k.numbers = true;
  if (k.migrated < 1 && !migrating) migrate(k as KitSave);
  return k as KitSave;
}

/** First load on the hoggie build: starter hoggies, old achievements -> crests, old heroes -> hoggies. */
function migrate(k: KitSave) {
  migrating = true;
  try {
    k.migrated = 1;
    for (const h of STARTERS) if (!k.hogs.includes(h)) k.hogs.push(h);
    // One random cast hoggie so the roster starts with a surprise.
    const cast = HOGS.map((h) => h.id).filter((id) => !SIGNATURE[id] && !k.hogs.includes(id));
    if (cast.length) k.hogs.push(cast[Math.floor(Math.random() * cast.length)]);
    let got: Record<string, number> = {};
    try { got = meta.data.achievements ?? {}; } catch { /* ignore */ }
    const heroUnlock: Record<string, string> = { kills_2000: 'sprinter', evolve: 'wizard', heat2: 'hacker' };
    for (const [old, hero] of Object.entries(heroUnlock)) {
      const hog = LEGACY_HEROES[hero];
      if (old in got && hog && !k.hogs.includes(hog)) k.hogs.push(hog);
    }
    if (LEGACY_HEROES[k.hero] && k.hogs.includes(LEGACY_HEROES[k.hero])) k.hog = LEGACY_HEROES[k.hero];
    persist();
    for (const [old, crest] of Object.entries(LEGACY)) if (old in got) earnCrest(crest);
  } finally {
    migrating = false;
  }
}

export function persist() {
  try { meta.save(); } catch { /* memory copy is enough */ }
}

export const merchOwned = (id: string) => save().merch[id] ?? 0;

/** The upgrade shop's old prices: levels bought there come back as gold, once, now that the shop sells merch. */
const OLD_SHOP: Record<string, number[]> = {
  might: [30, 60, 100, 150, 220], hp: [25, 50, 90, 140, 200], speed: [40, 90, 160], magnet: [30, 70, 130],
  luck: [40, 100, 180], reroll: [50, 120, 220], skip: [60, 150], revive: [400],
};
function refundShop(k: KitSave) {
  let gold = 0;
  for (const [id, costs] of Object.entries(OLD_SHOP)) {
    const lvl = Math.max(0, Math.min(costs.length, Math.floor(n(k.shop[id]))));
    for (let i = 0; i < lvl; i++) gold += costs[i];
  }
  k.shop = {};
  if (gold > 0) { try { meta.bank(gold); } catch { /* ignore */ } persist(); }
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Best daily score for today (0 if none yet). */
export function dailyBest(): number {
  const d = save().daily;
  return d.date === today() ? d.best : 0;
}

export const hogUnlocked = (id: string) => save().hogs.includes(id);

/** Unlock a hoggie; true if it's new. Caveman brings its later forms' art along (same slot). */
export function unlockHog(id: string): boolean {
  const sv = save();
  if (!HOG_INDEX.has(id) || sv.hogs.includes(id)) return false;
  sv.hogs.push(id);
  persist();
  return true;
}

/** A random locked hoggie for a capsule (never the secret ones), or null when the roster is complete. */
export function rollCapsule(rnd: () => number = Math.random): string | null {
  const sv = save();
  const pool = HOGS.map((h) => h.id).filter((id) => !sv.hogs.includes(id) && !SECRET_HOGS.has(id) && !EVOLVING_FORMS.slice(1).includes(id));
  if (!pool.length) return null;
  return pool[Math.floor(rnd() * pool.length)];
}

/** The hoggie to play: the saved pick if unlocked, else the default. */
export function currentHog(): string {
  const sv = save();
  return sv.hogs.includes(sv.hog) ? sv.hog : DEFAULT_HOG;
}

/** Earn a crest (achievement) and unlock its hoggie; true the first time. */
export function earnCrest(id: string): boolean {
  let got = false;
  try { got = achieve(id); } catch { /* storage trouble */ }
  const c = CREST_BY_ID.get(id);
  if (c && (got || hasCrest(id))) unlockHog(c.hog);
  return got;
}

export function hasCrest(id: string): boolean {
  try { return id in meta.data.achievements; } catch { return false; }
}

/** Every crest already earned has its hoggie (e.g. after a data reset of the kit block). */
export function syncCrestHogs() {
  for (const c of CREST_BY_ID.values()) if (hasCrest(c.id)) unlockHog(c.hog);
}
