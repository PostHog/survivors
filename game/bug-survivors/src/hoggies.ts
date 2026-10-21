// Hoggies: every PostHog hedgehog illustration (@posthog/brand, baked by tools/import_brand.py) is a player
// character. ~30 signature hoggies bring a start weapon and a real trait; the rest are the cast: default stats plus
// one small perk that matches the art. Unlock more by earning crests (crests.ts), capsules and milestones.
import brand from './brand.json';
import type { Stats, WeaponId } from './content';

export interface BrandHog { id: string; name: string; tags: string[] }
export const HOGS: BrandHog[] = (brand as { hoggies: BrandHog[] }).hoggies;
export const HOG_INDEX = new Map(HOGS.map((h, i) => [h.id, i]));
export const hogFrame = (id: string) => HOG_INDEX.get(id) ?? HOG_INDEX.get(DEFAULT_HOG) ?? 0;
export const hogName = (id: string) => HOGS[hogFrame(id)]?.name ?? id;

export const DEFAULT_HOG = 'im-the-driver';

export type Trait = 'none' | 'area' | 'selfdrive' | 'rammer' | 'revive' | 'reaper' | 'burning' | 'ai' | 'seer' | 'magnet' | 'deskhog'
  | 'rewind' | 'evolving' | 'robot' | 'superhero' | 'armour' | 'thorns' | 'grind' | 'panic' | 'sleepy' | 'dynamite' | 'angel'
  | 'crit' | 'amount';

export interface SigDef { trait: Trait; line: string; start?: WeaponId; unlock?: string }

/** Signature hoggies. `start`: a theme product is used only if the theme features it; tools always work.
 * `unlock`: how it's earned besides capsules (crest unlocks are listed in crests.ts). */
export const SIGNATURE: Record<string, SigDef> = {
  'im-the-driver': { trait: 'none', line: "You're the driver. Starts with your main product" },
  'wizard-1': { trait: 'area', line: '+20% area', start: 'product_analytics' },
  'wizard-2': { trait: 'area', line: '+20% area (alt robe)', start: 'product_analytics' },
  'wizard-3': { trait: 'area', line: '+20% area, +10% XP', start: 'product_analytics' },
  'wizard-4': { trait: 'area', line: '+20% area (alt robe)', start: 'feature_flags' },
  'wizard-5': { trait: 'area', line: '+20% area (alt robe)', start: 'feature_flags' },
  'self-driving': { trait: 'selfdrive', line: 'Self-driving for 5 s every wave. Powerups last 2x' },
  'driving-hogzilla': { trait: 'rammer', line: 'Runs bugs over. Big and tough', start: 'heatmaps' },
  terminator: { trait: 'revive', line: "Minigun tests. I'll be back: one free revive", start: 'experiments', unlock: 'Reach wave 5' },
  reaper: { trait: 'reaper', line: 'Some kills reap every weak bug on screen. -30% HP', start: 'error_tracking', unlock: 'Meet Nohog (wave 13)' },
  'burning-money': { trait: 'burning', line: 'Every coin becomes a fireball. No gold', start: 'revenue', unlock: 'Pick Burning Money in a run' },
  'dadd-ai-1': { trait: 'ai', line: 'Max AI starts at level 3', start: 'posthog_ai' },
  'dadd-ai-2': { trait: 'ai', line: 'Max AI starts at level 3', start: 'posthog_ai' },
  'noir-1': { trait: 'seer', line: 'Sees Heisenbugs. +10% crit', start: 'replay_vision' },
  'noir-2': { trait: 'seer', line: 'Sees Heisenbugs. +10% crit', start: 'replay_vision' },
  'noir-3': { trait: 'seer', line: 'Sees Heisenbugs. +10% crit', start: 'replay_vision' },
  'noir-4': { trait: 'seer', line: 'Sees Heisenbugs. +10% crit', start: 'replay_vision' },
  'noir-5': { trait: 'seer', line: 'Sees Heisenbugs. +10% crit', start: 'replay_vision' },
  'x-ray': { trait: 'seer', line: 'Sees Heisenbugs. +magnet', start: 'session_replay' },
  'data-thief': { trait: 'magnet', line: 'Gems fly in from twice as far', start: 'data_warehouse' },
  'desk-wizard': { trait: 'deskhog', line: 'Brings a DeskHog turret' },
  'doc-brown': { trait: 'rewind', line: 'A free Rewind at the start of every wave', start: 'session_replay' },
  'back-to-the-future': { trait: 'rewind', line: 'A free Rewind at the start of every wave', start: 'session_replay' },
  caveman: { trait: 'evolving', line: 'Evolves at wave 3 and 6 (big stat jumps)', unlock: 'Reach wave 3' },
  robot: { trait: 'robot', line: '+1 projectile, -15% speed' },
  superhero: { trait: 'superhero', line: 'Flies over tech debt. +15% speed' },
  'stamp-approved': { trait: 'armour', line: '+20% armour', start: 'surveys' },
  'stamp-denied': { trait: 'thorns', line: 'Bugs that touch you take damage' },
  '996': { trait: 'grind', line: '+40% XP, but you slowly burn out', unlock: 'Survive 9:36 in one run' },
  panic: { trait: 'panic', line: 'Faster the lower your HP' },
  asleep: { trait: 'sleepy', line: 'Slow, but heals 2 HP/s' },
  sleepy: { trait: 'sleepy', line: 'Slow, but heals 2 HP/s' },
  dynamite: { trait: 'dynamite', line: 'A hotfix bomb every 60 s' },
  angel: { trait: 'angel', line: 'Revives at full HP once per wave', unlock: 'Kill Nohog' },
  error: { trait: 'crit', line: '+8% crit', start: 'error_tracking' },
  experiment: { trait: 'amount', line: '+1 projectile', start: 'experiments' },
  scientist: { trait: 'amount', line: '+1 projectile', start: 'experiments' },
  survey: { trait: 'area', line: '+20% area', start: 'surveys' },
  chart: { trait: 'area', line: '+20% area', start: 'product_analytics' },
  workflows: { trait: 'none', line: 'Starts with Workflows', start: 'workflows' },
};
/** Caveman's later forms (same save slot, different art). */
export const EVOLVING_FORMS = ['caveman', 'business-evolution', 'final-evolution'];
/** Never in capsules: earned only. */
export const SECRET_HOGS = new Set(['angel', 'reaper', 'business-evolution', 'final-evolution']);
/** Unlocked on a fresh save (plus one random cast hoggie). */
export const STARTERS = [DEFAULT_HOG, 'wizard-1'];

// ---------------------------------------------------------------- cast perks
export type Perk = 'speed' | 'might' | 'hp' | 'xp' | 'luck' | 'magnet' | 'area' | 'crit' | 'cd' | 'gold' | 'regen' | 'armour';
export const PERKS: Record<Perk, { line: string; apply: (s: Stats) => void }> = {
  speed: { line: '+6% speed', apply: (s) => { s.speed *= 1.06; } },
  might: { line: '+6% damage', apply: (s) => { s.might *= 1.06; } },
  hp: { line: '+15 max HP', apply: (s) => { s.maxHp += 15; } },
  xp: { line: '+8% XP', apply: (s) => { s.growth *= 1.08; } },
  luck: { line: '+10% luck', apply: (s) => { s.luck *= 1.1; } },
  magnet: { line: '+20% pickup range', apply: (s) => { s.magnet *= 1.2; } },
  area: { line: '+6% area', apply: (s) => { s.area *= 1.06; } },
  crit: { line: '+4% crit', apply: (s) => { s.crit += 0.04; } },
  cd: { line: '+5% fire rate', apply: (s) => { s.cd *= 0.95; } },
  gold: { line: '+15% gold', apply: (s) => { s.gold *= 1.15; } },
  regen: { line: '+0.4 HP/s', apply: (s) => { s.regen += 0.4; } },
  armour: { line: '+5% armour', apply: (s) => { s.armour += 0.05; } },
};
/** Keyword -> perk, matched against the hoggie's id and brand tags, first hit wins. */
const PERK_RULES: [RegExp, Perk][] = [
  [/coffee|rocket|car|commut|surf|swim|roller|sprint|runner|football-player|evel|two-player|cursor/, 'speed'],
  [/gladiator|scorpion|pit-viper|hooligan|ape|terminator|dynamite|bat|superhero|judge/, 'might'],
  [/burger|cake|croissant|cereal|chef|honey|banana|coconut|lemon|popcorn|waiter|cool/, 'hp'],
  [/read|research|einstein|beaker|scien|doctor|puzzle|code|reporter|organized|level-up/, 'xp'],
  [/card|star|heart|rose|pinata|party|dj|70s|caribana|boombox|lucky|selfie/, 'luck'],
  [/magnif|mailbox|safari|explorer|tourist|x-ray|camera|megaphone/, 'magnet'],
  [/speaker|soapbox|town-crier|director|oprah|pope|greek|chart/, 'area'],
  [/noir|trenchcoat|art-thief|data-thief|sailor|mountie|traffic-police/, 'crit'],
  [/ipad|phone|office|remote|loops|hourglass|construction|transformer|robot/, 'cd'],
  [/money|gatsby|pearl|bizz|business|burning/, 'gold'],
  [/namaste|asleep|sleepy|sitting|float|lifeguard|gardener|campfire|toilet|sunburn/, 'regen'],
  [/stamp|stop|traffic-controller|basketball|soccer|coach|climber|gravedigger|reaper/, 'armour'],
];
const PERK_ORDER = Object.keys(PERKS) as Perk[];
export function perkOf(id: string): Perk {
  const h = HOGS[hogFrame(id)];
  const hay = `${id} ${(h?.tags ?? []).join(' ')}`;
  for (const [re, p] of PERK_RULES) if (re.test(hay)) return p;
  let x = 0;
  for (const c of id) x = (x * 31 + c.charCodeAt(0)) | 0;
  return PERK_ORDER[Math.abs(x) % PERK_ORDER.length];
}

export const sigOf = (id: string): SigDef | null => SIGNATURE[id] ?? null;
export const hogLine = (id: string) => sigOf(id)?.line ?? PERKS[perkOf(id)].line;
export const isSignature = (id: string) => id in SIGNATURE;
