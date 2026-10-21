// Level-up cards: a weighted pool that leans toward the player's current build (owned items and evolution
// partners), plus the autopilot's ranking so the test bot builds toward evolutions. Maxed weapons and passives keep
// coming back as patches (v1.1, v1.2...), so late levels are never dead. The Release screen after each boss draws
// from releases, new tools and v2.0 majors.
import { WEAPONS, PASSIVES, MAX_LEVEL, RELEASES, RELEASE_IDS, TOOL_IDS, WeaponId, PassiveId, ReleaseId, ToolId } from './content';
import type { WState } from './weapons';

export interface Card { kind: 'weapon' | 'passive' | 'heal' | 'gold' | 'release' | 'major'; id: string }

export interface Build {
  weapons: Map<WeaponId, WState>;
  passives: Map<PassiveId, number>;
  ppatch: Map<PassiveId, number>;
  banished: Set<string>;
  products: WeaponId[];   // theme products, plus the tools once unlocked
  luck: number;
  maxPassives: number;
  releases: Map<ReleaseId, number>;
  wave: number;
}

/** Passives that evolve a weapon the player holds (and hasn't evolved yet). */
export const partnersOf = (b: Build) => new Set([...b.weapons.values()].filter((w) => !w.evo && WEAPONS[w.id].evo)
  .map((w) => WEAPONS[w.id].evo!.passive));
const evoPassive = (id: WeaponId) => WEAPONS[id].evo?.passive;
/** Weapons offered less often when new (a screen-wiping Pipeline should feel like a find). */
const RARE: Partial<Record<WeaponId, number>> = { data_pipelines: 0.3 };
const LATE_PASSIVES = new Set<PassiveId>(['driver', 'public', 'weird', 'whynow', 'optimist']);
/** A weapon at LV 5 that still waits for its evolution (partner + chest). */
const evoPending = (w: WState) => !w.evo && !!WEAPONS[w.id].evo;

export function cardPool(b: Build): { c: Card; w: number }[] {
  const pool: { c: Card; w: number }[] = [];
  const partners = partnersOf(b);
  const nW = b.weapons.size;
  for (const id of b.products) {
    if (b.banished.has(id)) continue;
    const w = b.weapons.get(id);
    if (!w) pool.push({ c: { kind: 'weapon', id }, w: (nW < 3 ? 2.4 : nW < 4 ? 1.3 : nW < 8 ? 0.8 : 0.4) * (RARE[id] ?? 1) });
    else if (w.level < MAX_LEVEL) {
      const ep = evoPassive(id);
      pool.push({ c: { kind: 'weapon', id }, w: 3 + (ep && b.passives.has(ep) ? 1.5 * b.luck : 0) });
    } else {
      // Patch: v1.1, v1.2... Evolved weapons patch best; one still waiting on a chest patches less.
      pool.push({ c: { kind: 'weapon', id }, w: evoPending(w) ? 0.6 : 1.6 });
    }
  }
  for (const id of Object.keys(PASSIVES) as PassiveId[]) {
    if (b.banished.has(id)) continue;
    if (b.wave < 2 && LATE_PASSIVES.has(id)) continue; // the handbook-value passives join with the tools
    const lvl = b.passives.get(id) ?? 0;
    if (lvl >= PASSIVES[id].max) {
      if (PASSIVES[id].patch) pool.push({ c: { kind: 'passive', id }, w: 0.7 });
      continue;
    }
    if (!lvl && b.passives.size >= b.maxPassives) continue;
    pool.push({ c: { kind: 'passive', id }, w: (lvl ? 1.8 : 0.9) + (partners.has(id) ? 1.6 * b.luck : 0) });
  }
  return pool;
}

function draw(pool: { c: Card; w: number }[], rnd: () => number, n: number): Card[] {
  const out: Card[] = [];
  pool = [...pool];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let x = rnd() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) { x -= pool[i].w; if (x <= 0) break; }
    out.push(pool[i].c);
    pool.splice(i, 1);
  }
  return out;
}

/** Up to `n` distinct cards by weighted draw; heal/gold filler when the build is complete. */
export function drawCards(b: Build, rnd: () => number, n = 3): Card[] {
  const out = draw(cardPool(b), rnd, n);
  if (out.length === 0) out.push({ kind: 'heal', id: 'heal' }, { kind: 'gold', id: 'gold' });
  return out;
}

/** The Release screen after a boss: 3 cards from releases, new tools and v2.0 majors. Through wave 5 at least
 * one new tool is on offer while any are left. */
export function drawRelease(b: Build, rnd: () => number): Card[] {
  const tools = TOOL_IDS.filter((t: ToolId) => !b.weapons.has(t) && !b.banished.has(t)).map((id) => ({ c: { kind: 'weapon', id } as Card, w: 1.2 * (RARE[id] ?? 1) }));
  const majors = [...b.weapons.values()].filter((w) => w.evo && !w.major).map((w) => ({ c: { kind: 'major', id: w.id } as Card, w: 1.1 }));
  const rel = RELEASE_IDS.filter((r) => (b.releases.get(r) ?? 0) < (RELEASES[r].stack ?? 1)).map((id) => ({ c: { kind: 'release', id } as Card, w: 1 }));
  const out: Card[] = [];
  if (tools.length && b.wave <= 5) out.push(...draw(tools, rnd, 1));
  const rest = [...tools, ...majors, ...rel].filter((p) => !out.some((c) => c.kind === p.c.kind && c.id === p.c.id));
  out.push(...draw(rest, rnd, 3 - out.length));
  if (!out.length) out.push({ kind: 'heal', id: 'heal' }, { kind: 'gold', id: 'gold' });
  return out;
}

/** Autopilot: how much it wants a card. Goes wide early, then chases evolutions, then patches. */
export function botRank(c: Card, b: Build): number {
  const partners = partnersOf(b);
  if (c.kind === 'weapon') {
    const w = b.weapons.get(c.id as WeaponId);
    if (!w) return b.weapons.size < 3 ? 9 : b.weapons.size < 5 ? 6 : b.weapons.size < 8 ? 4 : 2;
    if (w.level >= MAX_LEVEL) return w.evo ? 5 + Math.min(3, w.patch * 0.2) : 2;
    const ep = evoPassive(w.id);
    return 7 + w.level + (ep && b.passives.has(ep) ? 4 : 0);
  }
  if (c.kind === 'passive') {
    const id = c.id as PassiveId;
    const lvl = b.passives.get(id) ?? 0;
    if (lvl >= PASSIVES[id].max) return id === 'maxhp' || id === 'armour' ? 3.5 : 3;
    let r = lvl ? 4 : 3;
    if (partners.has(id)) r += 6;
    if (id === 'maxhp' || id === 'armour' || id === 'revive' || id === 'moat' || id === 'regen') r += 2;
    return r;
  }
  if (c.kind === 'major') return 8;
  if (c.kind === 'release') return RELEASE_RANK[c.id as ReleaseId] ?? 5;
  return 1;
}
const RELEASE_RANK: Partial<Record<ReleaseId, number>> = {
  rollout: 9, sourcemaps: 7, hedgehog: 8, freetier: 7, selfdriving: 7, transparency: 8, pay0: 6, tokencap: 5, dsp: 4, burning: 3,
  smallteams: 2, makerdays: 6, clickhouse: 6, ingestion: 5, dopamine: 6, offsite: 6, deskhog: 7, killswitch: 7,
};
