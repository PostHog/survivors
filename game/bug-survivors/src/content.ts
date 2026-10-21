// Bug Survivors content tables: weapons and their evolutions, passives, enemy archetypes, elites, events,
// waves, bosses, releases, powerups, lore, heat and shop. Fixed kit text (never per prospect): plain ASCII
// that fits the 5x7 font. Prospect words (bug names, pain, boss) always come from the theme.
// Hoggies (player characters) live in hoggies.ts, crest achievements in crests.ts.

export type ProductId = 'session_replay' | 'feature_flags' | 'experiments' | 'error_tracking' | 'product_analytics' | 'surveys';
/** PostHog tools: kit-fixed weapons (never theme products), offered from the first boss onward. */
export type ToolId = 'web_analytics' | 'heatmaps' | 'posthog_ai' | 'data_warehouse' | 'workflows'
  | 'data_pipelines' | 'batch_exports' | 'scouts' | 'hogql' | 'logs' | 'replay_vision' | 'ai_observability' | 'revenue'
  | 'endpoints' | 'desktop';
export type WeaponId = ProductId | ToolId;
export const TOOL_IDS: ToolId[] = ['web_analytics', 'heatmaps', 'posthog_ai', 'data_warehouse', 'workflows',
  'data_pipelines', 'batch_exports', 'scouts', 'hogql', 'logs', 'replay_vision', 'ai_observability', 'revenue', 'endpoints', 'desktop'];
export type PassiveId = 'speed' | 'magnet' | 'maxhp' | 'cooldown' | 'armour' | 'area' | 'amount' | 'crit' | 'growth' | 'luck' | 'revive'
  | 'driver' | 'public' | 'weird' | 'whynow' | 'optimist' | 'moat' | 'regen';

export const MAX_LEVEL = 5;
export const MAX_PASSIVES = 6;
/** From wave 3 the passive cap goes up: "headcount approved". */
export const MAX_PASSIVES_LATE = 8;
export const BOSS_AT = 210; // seconds (3:30)

/** Player numbers every weapon and system reads; rebuilt from base + shop + hoggie + passives + releases. */
export interface Stats {
  might: number;   // damage multiplier
  area: number;    // weapon size multiplier
  cd: number;      // cooldown multiplier (lower = faster)
  amount: number;  // extra projectiles / orbs / flags
  crit: number;    // crit chance
  critMul: number; // crit damage multiplier
  armour: number;  // fraction of contact damage ignored
  luck: number;    // drop + chest luck multiplier
  growth: number;  // xp multiplier
  magnet: number;  // pickup radius in px
  speed: number;   // px/s
  maxHp: number;
  revives: number;
  regen: number;   // extra HP per second
  vuln: number;    // bugs take this much more damage, ignoring armour (Make It Public)
  gold: number;    // coin value multiplier
  dur: number;     // powerup duration multiplier
}

export const baseStats = (): Stats => ({ might: 1, area: 1, cd: 1, amount: 0, crit: 0.05, critMul: 2, armour: 0, luck: 1, growth: 1,
  magnet: 48, speed: 80, maxHp: 100, revives: 0, regen: 0, vuln: 0, gold: 1, dur: 1 });

// ---------------------------------------------------------------- weapons

export interface WeaponDef {
  upgrade: string;  // level-up card line for levels 2-5
  short: string;    // end-screen damage label
  evo?: { passive: PassiveId; name: string; line: string };
  name?: string;    // tools only: display name (theme products use shared/products.json)
  line?: string;    // tools only: card line when new
  crest?: string;   // tools only: the crest mini badge used as the icon (else the icon_<id> sprite)
  major?: string;   // v2.0 signature line
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  experiments: { upgrade: 'More shots per variant', short: 'Tests', major: 'Every shot pierces 2 more',
    evo: { passive: 'amount', name: 'Multivariate Barrage', line: 'Every variant, every direction' } },
  error_tracking: { upgrade: 'Faster, pierces more bugs', short: 'Errors', major: 'Traces chain 2 more times',
    evo: { passive: 'crit', name: 'Stack Trace Storm', line: 'Homing swarm that chains on each squash' } },
  session_replay: { upgrade: '+1 replay orb, wider orbit', short: 'Replay', major: '+2 orbs, faster spin',
    evo: { passive: 'magnet', name: 'Rage Click Vortex', line: 'Pulsing orbs that pull in gems' } },
  feature_flags: { upgrade: 'More flags, faster zaps', short: 'Flags', major: 'Zaps chain to 5 bugs',
    evo: { passive: 'cooldown', name: 'Kill Switch Grid', line: 'Flags chain zaps to 3 bugs' } },
  product_analytics: { upgrade: 'Bigger, more frequent pulse', short: 'Analytics', major: 'A third shockwave',
    evo: { passive: 'area', name: 'Funnel Quake', line: 'Double shockwave, huge knockback' } },
  surveys: { upgrade: 'Wider area, stronger slow', short: 'Surveys', major: 'Frozen bugs shatter',
    evo: { passive: 'armour', name: 'NPS Blizzard', line: 'Freezing aura that shreds bugs' } },
  // PostHog tools (kit-fixed)
  web_analytics: { name: 'Web Analytics', line: 'Traffic Beam: a sweeping beam of pageviews', upgrade: 'Longer, faster beam', short: 'Web',
    evo: { passive: 'magnet', name: 'Realtime Dashboard', line: 'Six beams spin into a star' }, major: 'Beams reach much further' },
  heatmaps: { name: 'Heatmaps', line: 'Heat Trail: everywhere you walk gets hot', upgrade: 'Hotter, longer trail', short: 'Heatmaps',
    evo: { passive: 'speed', name: 'Heat Wave', line: 'A blazing trail that slows bugs' }, major: 'Tiles burn twice as long' },
  posthog_ai: { name: 'PostHog AI', line: 'Max AI: a drone that fixes the biggest bug first', upgrade: 'Faster, smarter bolts', short: 'Max AI',
    evo: { passive: 'growth', name: 'Deep Research', line: 'Triple bolts that jump to the next bug' }, major: 'A second drone' },
  data_warehouse: { name: 'Data Warehouse', line: 'Warehouse Vault: heavy data drums orbit you', upgrade: '+1 drum, harder hits', short: 'Warehouse',
    evo: { passive: 'maxhp', name: 'Managed Warehouse', line: 'Drums shatter bugs into shards' }, major: 'Two rings of drums' },
  workflows: { name: 'Workflows', line: 'Automation: a zap that hops from bug to bug', upgrade: 'Longer chains, more often', short: 'Workflows',
    evo: { passive: 'whynow', name: 'Multi-Channel Blast', line: 'Zaps fork at every hop' }, major: 'Chains never stop early' },
  data_pipelines: { name: 'Data Pipelines', line: 'Once a minute: vacuum up the bugs ahead, blast the screen clean', upgrade: 'Wider intake',
    short: 'Pipelines', crest: 'ingestion', major: 'Sucks in elites too',
    evo: { passive: 'optimist', name: 'Hog Transformations', line: 'Sucks in bugs from every side' } },
  batch_exports: { name: 'Batch Exports', line: 'Every 10 s, tagged bugs take a bulk hit', upgrade: 'Bigger export, shorter batches',
    short: 'Batch', crest: 'batch-exports', major: 'Exports hit twice as hard',
    evo: { passive: 'growth', name: 'Backfill', line: 'Every export replays the last one' } },
  scouts: { name: 'Scouts', line: 'Scout drones flag bugs: flagged bugs take +40%', upgrade: '+1 scout, faster flags', short: 'Scouts',
    crest: 'self-driving', major: 'Flags stick twice as long',
    evo: { passive: 'weird', name: 'Troop of 90', line: 'Signals merge into a report: PR laser' } },
  hogql: { name: 'HogQL', line: 'DELETE FROM bugs WHERE hp < 6%', upgrade: 'Higher threshold, runs more often', short: 'HogQL',
    crest: 'clickhouse', major: 'Query runs twice',
    evo: { passive: 'public', name: 'Materialized View', line: 'Deletes every 3 s, higher threshold' } },
  logs: { name: 'Logs', line: 'Hogzilla drives through the bugs, dropping log bombs', upgrade: 'Harder blasts, runs more often', short: 'Logs',
    crest: 'apm', major: 'Blasts half again as big',
    evo: { passive: 'cooldown', name: 'Firehose', line: 'Two Hogzillas on crossing lanes' } },
  replay_vision: { name: 'Replay Vision', line: 'Scanner eyes sweep and zap, and see hidden bugs', upgrade: '+1 scanner, wider cone',
    short: 'Vision', crest: 'customer-analytics', major: 'Scanners fire twice',
    evo: { passive: 'area', name: 'Sees Everything', line: 'Four scanner types at once' } },
  ai_observability: { name: 'AI Observability', line: 'Trace: a hit spreads along a span tree', upgrade: 'Deeper traces', short: 'Traces',
    crest: 'ai-observability', major: 'Traces branch wider',
    evo: { passive: 'crit', name: 'Evaluations', line: 'Spans crit on bugs already hit' } },
  revenue: { name: 'Revenue Analytics', line: 'MRR Cannon: hits harder the more gold you grab', upgrade: 'Faster cannon', short: 'MRR',
    crest: 'billing', major: 'Cannonballs explode',
    evo: { passive: 'luck', name: 'Net Revenue Retention', line: 'Damage compounds every wave' } },
  endpoints: { name: 'Endpoints', line: 'Drop a turret that repeats your best shot', upgrade: 'Faster turrets', short: 'Endpoints',
    crest: 'platform-features', major: '+1 turret',
    evo: { passive: 'driver', name: 'Edge Cache', line: 'Three turrets that never expire' } },
  desktop: { name: 'PostHog Desktop', line: 'Command Center: a ring of agent orbs', upgrade: '+1 agent (up to 9)', short: 'Agents',
    crest: 'posthog-desktop', major: 'Agents fire twice',
    evo: { passive: 'amount', name: 'Dopamine Mode', line: 'All 9 agents fire at once' } },
};

/** Hidden super evolution: two evolved weapons + a chest. */
export const SUPER = { a: 'session_replay' as ProductId, b: 'error_tracking' as ProductId, name: 'Full Stack Nova',
  line: 'Replay and errors, fused' };

/** A maxed weapon's cards keep coming as patches: v1.1, v1.2... each x1.12 damage (compounding). */
export const PATCH_MUL = 1.12;
/** v2.0 major release: damage x1.6, +1 amount and 15% faster, for that weapon only. */
export const MAJOR = { dmg: 1.6, amount: 1, cd: 0.85 };

// ---------------------------------------------------------------- passives

export interface PassiveDef { name: string; line: string; max: number; apply: (s: Stats, lvl: number) => void; crest?: string; patch?: boolean }

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  speed: { name: 'Hedgehog Sprint', line: '+10% move speed', max: 5, patch: true, apply: (s, l) => { s.speed *= 1 + 0.1 * Math.min(l, 8); } },
  magnet: { name: 'Autocapture', line: '+35% gem pickup range', max: 5, patch: true, apply: (s, l) => { s.magnet *= 1 + 0.35 * l; } },
  maxhp: { name: 'Snack Break', line: '+20 max HP and heal 20', max: 5, patch: true, apply: (s, l) => { s.maxHp += 20 * l; } },
  cooldown: { name: 'Hot Reload', line: 'Weapons fire 8% faster', max: 5, patch: true, apply: (s, l) => { s.cd *= Math.max(0.45, 1 - 0.08 * l); } },
  armour: { name: 'Code Review', line: 'Take 8% less damage', max: 5, patch: true, apply: (s, l) => { s.armour += Math.min(0.56, 0.08 * l); } },
  area: { name: 'Big Monitor', line: '+10% weapon area', max: 5, patch: true, apply: (s, l) => { s.area *= 1 + 0.1 * l; } },
  amount: { name: 'Pair Programming', line: '+1 projectile or orb', max: 3, apply: (s, l) => { s.amount += l; } },
  crit: { name: 'Rubber Duck', line: '+6% critical hits', max: 5, patch: true, apply: (s, l) => { s.crit += 0.06 * l; } },
  growth: { name: 'Docs Day', line: '+12% XP from gems', max: 5, patch: true, apply: (s, l) => { s.growth *= 1 + 0.12 * l; } },
  luck: { name: 'Lucky Commit', line: 'More drops, better chests', max: 5, patch: true, apply: (s, l) => { s.luck *= 1 + 0.15 * l; } },
  revive: { name: 'Rollback', line: 'Revive once at half HP', max: 1, apply: (s, l) => { s.revives += l; } },
  // Staying alive without snacks: a moat that holds bugs off, and regen that scales with max HP.
  moat: { name: 'Data Moat', line: 'A moat holds bugs and shots off you. It drains, then refills', max: 5, patch: true, crest: 'security',
    apply: () => { /* game.ts: tickMoat */ } },
  regen: { name: 'Self-Healing', line: 'Regen 0.8% of max HP a second', max: 5, patch: true, crest: 'support', apply: () => { /* game.ts: recalc */ } },
  // Handbook values
  driver: { name: "You're the Driver", line: '+8% damage while moving', max: 5, patch: true, crest: 'gtm-engineering', apply: () => { /* game.ts: moving */ } },
  public: { name: 'Make It Public', line: 'Bugs take +8% damage, armour or not', max: 5, patch: true, crest: 'editorial',
    apply: (s, l) => { s.vuln += 0.08 * l; } },
  weird: { name: 'Do More Weird', line: 'Hits sometimes proc a random weapon', max: 5, patch: true, crest: 'graphics', apply: () => { /* game.ts */ } },
  whynow: { name: 'Why Not Now?', line: 'Powerups last 20% longer', max: 5, patch: true, crest: 'platform-ux',
    apply: (s, l) => { s.dur *= 1 + 0.2 * l; } },
  optimist: { name: 'Optimistic by Default', line: '+6% damage above half HP, regen', max: 5, patch: true, crest: 'talent',
    apply: (s, l) => { s.regen += 0.3 * l; } },
};

// ---------------------------------------------------------------- enemies

export type ArchId = 'swarmer' | 'splitter' | 'tank' | 'exploder' | 'charger' | 'spitter' | 'mini' | 'runner' | 'crate'
  | 'regression' | 'nest' | 'flaky' | 'creep' | 'heisen' | 'race';

export interface ArchDef {
  sprite: number;      // theme enemy index (0-2): name, pain, sprite
  hp: number; speed: number; dmg: number; xp: number; r: number;
  scale?: number;
  tint?: number;       // variants are tinted so they read as a different trick
  armour?: number;     // damage taken multiplier
  kb?: number;         // knockback taken multiplier
  trick?: string;      // one-time banner line for variants ({n} = plural bug name)
  key?: string;        // fixed kit sprite instead of the theme enemy (crates)
}

export const ARCH: Record<ArchId, ArchDef> = {
  swarmer: { sprite: 0, hp: 6, speed: 54, dmg: 6, xp: 1, r: 6 },
  splitter: { sprite: 1, hp: 16, speed: 38, dmg: 10, xp: 2, r: 7 },
  tank: { sprite: 2, hp: 55, speed: 25, dmg: 14, xp: 5, r: 8, scale: 1.25, armour: 0.6, kb: 0.3 },
  exploder: { sprite: 0, hp: 9, speed: 60, dmg: 0, xp: 2, r: 6, tint: 0xf8b800, trick: '{n} with a fuse: pop them from afar' },
  charger: { sprite: 1, hp: 22, speed: 34, dmg: 12, xp: 3, r: 7, tint: 0xf87858, trick: '{n} that charge: sidestep the dash' },
  spitter: { sprite: 2, hp: 26, speed: 30, dmg: 9, xp: 4, r: 7, tint: 0xb8f818, trick: '{n} that spit from range: close in' },
  mini: { sprite: 1, hp: 5, speed: 60, dmg: 5, xp: 1, r: 5, scale: 0.65 },
  runner: { sprite: 1, hp: 14, speed: 125, dmg: 9, xp: 1, r: 7, tint: 0xf8d878 },
  crate: { sprite: 0, hp: 10, speed: 0, dmg: 0, xp: 0, r: 7, kb: 0, key: 'crate' },
  // Wave 3+ tricks
  regression: { sprite: 1, hp: 20, speed: 40, dmg: 11, xp: 3, r: 7, tint: 0xd8b8f8, trick: 'Regressions: {n} that come back once. Again.' },
  nest: { sprite: 2, hp: 260, speed: 0, dmg: 10, xp: 12, r: 12, scale: 1.8, tint: 0xac7c00, kb: 0, armour: 0.8,
    trick: 'Legacy Nests: {n} factories. Break them!' },
  flaky: { sprite: 0, hp: 10, speed: 58, dmg: 7, xp: 2, r: 6, tint: 0x00e8d8, trick: 'Flaky {n}: now you see them...' },
  creep: { sprite: 1, hp: 26, speed: 36, dmg: 10, xp: 4, r: 7, tint: 0xfca044, trick: 'Scope Creep: {n} that grow. Squash them early' },
  heisen: { sprite: 2, hp: 30, speed: 34, dmg: 12, xp: 4, r: 7, tint: 0xfcfcfc, trick: 'Heisenbugs: {n} that vanish unless you look' },
  race: { sprite: 0, hp: 18, speed: 50, dmg: 9, xp: 3, r: 6, tint: 0xf85898, trick: 'Race Conditions: kill both {n} together' },
};

/** Spawn weights by time (wave 1). The last row whose `at` has passed is used. */
export const SPAWN_TABLE: { at: number; w: Partial<Record<ArchId, number>> }[] = [
  { at: 0, w: { swarmer: 1 } },
  { at: 30, w: { swarmer: 0.75, splitter: 0.25 } },
  { at: 60, w: { swarmer: 0.5, splitter: 0.3, exploder: 0.2 } },
  { at: 100, w: { swarmer: 0.32, splitter: 0.25, exploder: 0.1, charger: 0.18, tank: 0.15 } },
  { at: 150, w: { swarmer: 0.26, splitter: 0.2, exploder: 0.1, charger: 0.14, tank: 0.18, spitter: 0.12 } },
];

export type EliteMod = 'fast' | 'shield' | 'regen' | 'leak' | 'flaky' | 'swarm' | 'dlq';
export const ELITE_MODS: Record<EliteMod, { label: string; tint: number }> = {
  fast: { label: 'Fast', tint: 0xf8f858 },
  shield: { label: 'Shielded', tint: 0x78c8f8 },
  regen: { label: 'Regenerating', tint: 0x78f878 },
  leak: { label: 'Memory Leak', tint: 0x98b838 },
  flaky: { label: 'Flaky', tint: 0x00e8d8 },
  swarm: { label: 'Swarming', tint: 0xf8b8f8 },
  dlq: { label: 'Dead Letter Queue', tint: 0xbcbcbc },
};
export const ELITE_BASIC: EliteMod[] = ['fast', 'shield', 'regen'];
export const ELITE_LATE: EliteMod[] = ['fast', 'shield', 'regen', 'leak', 'flaky', 'swarm', 'dlq'];

/** Seconds at which a lone elite shows up (wave 1, heat 0; heat 3+ uses ELITES_EARLY). */
export const ELITES_AT = [90, 150];
export const ELITES_EARLY = [45, 85, 125, 165];

// ---------------------------------------------------------------- events

export type EventId = 'ring' | 'stampede' | 'pack' | 'spike' | 'incident' | 'hogzilla';
export const EVENTS: Record<EventId, { title: string; body: string }> = {
  ring: { title: 'SURROUNDED!', body: 'Break out of the ring of {n0}s' },
  stampede: { title: 'STAMPEDE!', body: 'A herd of {n1}s is crossing: dodge!' },
  pack: { title: 'ELITE PACK!', body: 'Big bugs with chests. Evolve your weapons!' },
  spike: { title: 'TRAFFIC SPIKE!', body: 'Launch day: twice the bugs for 10 s' },
  incident: { title: 'INCIDENT!', body: 'Bugs pouring in from every side: keep moving' },
  hogzilla: { title: 'HOGZILLA DRIVE-BY!', body: 'Get out of the lane. Seriously.' },
};
export const EVENT_TIMES = [60, 120, 180];
export const EVENT_ORDER: EventId[] = ['ring', 'stampede', 'pack'];

// ---------------------------------------------------------------- waves
// Wave 1 is the original 3:30 run. Each boss is a release marker ("<boss> 2.0", "3.0"...); after it, CONTINUE
// or CASH OUT, then a Release pick, then the next wave. Times inside a wave are seconds after it starts.
export type WaveMod = 'none' | 'spikes' | 'puddles' | 'hyper' | 'enterprise' | 'outage' | 'freeze' | 'inglag' | 'reaper';
export interface WaveDef { name: string; sub: string; mod: WaveMod; arch?: ArchId }
export const WAVES: Record<number, WaveDef> = {
  1: { name: 'MVP', sub: '4 weeks to build it', mod: 'none' },
  2: { name: 'HACKER NEWS LAUNCH', sub: '300 deployments in a couple of days', mod: 'none' },
  3: { name: 'PRODUCT-MARKET FIT', sub: 'Traffic spikes twice as often', mod: 'spikes', arch: 'regression' },
  4: { name: 'THE BIG MIGRATION', sub: 'Moving to ClickHouse. Mind the tech debt', mod: 'puddles', arch: 'nest' },
  5: { name: 'HYPERGROWTH', sub: 'More bugs, more XP', mod: 'hyper', arch: 'flaky' },
  6: { name: 'ENTERPRISE DEAL', sub: 'Bugs in armour. Make It Public cuts through', mod: 'enterprise', arch: 'creep' },
  7: { name: 'OUTAGE', sub: 'The lights are out. Stay close', mod: 'outage', arch: 'heisen' },
  8: { name: 'CODE FREEZE', sub: 'Icy floor: you slide', mod: 'freeze', arch: 'race' },
  13: { name: 'DEPRECATION', sub: 'Something is coming for you', mod: 'reaper' },
};
/** Waves 9-12: "SCALE N" with two random modifiers. */
export const SCALE_MODS: WaveMod[] = ['spikes', 'puddles', 'hyper', 'enterprise', 'outage', 'freeze', 'inglag'];
export const WAVE_MOD_TEXT: Record<WaveMod, string> = {
  none: '', spikes: 'traffic spikes', puddles: 'tech debt', hyper: 'hypergrowth', enterprise: 'armoured bugs', outage: 'outage',
  freeze: 'icy floor', inglag: 'ingestion lag', reaper: 'Nohog',
};
export const REAPER_WAVE = 13;

/** Scaling. Wave 1-2 keep their tuned numbers; wave 3+ bug HP grows by g per wave (1.9 from wave 9). */
export const WAVE = {
  len: 180,             // seconds of traffic before wave 2's boss
  lenLate: 150,         // ...and before each boss from wave 3
  g: 2.35, gLate: 2.7, lateFrom: 9,
  dmg: 1.3,             // bug damage per wave from wave 3
  speed: 0.05,          // bug speed +5% per wave from wave 3 (max x1.4)
  spawn: 0.1,           // spawn rate +10% per wave from wave 3
  hitCap: 0.35,         // one hit takes at most 35% of max HP (after armour)
  xp: 0,                // gem XP per wave (more bugs already means more XP)
  bossFocus: 0.35,      // wave 2+ boss HP = recent DPS x focus x target s (focus shrinks per version: affixes soak damage)
  bossT3: 45,           // wave 3+ boss fights last about this long
  funding: 0.15,        // +15% damage per boss cleared ("funding round")
  fundingHp: 10,        // +10 max HP per boss cleared
  bossT: 60,            // wave 2+ boss fights last about this long
  crumble: 40,          // ...crumbling (taking more and more damage) from here
};
/** Wave 2 = the old Act 2 (spawn/hp/dmg ramps), kept as tuned. */
export const ACT2 = { spawn: 1.35, hp0: 1.3, hp1: 2.6, dmg: 1.3, bossScale: 1.35, bossTint: 0xd8b8f8 };
export const ACT2_SPAWN: { at: number; w: Partial<Record<ArchId, number>> }[] = [
  { at: 0, w: { swarmer: 0.3, splitter: 0.2, exploder: 0.12, charger: 0.14, tank: 0.12, spitter: 0.12 } },
  { at: 60, w: { swarmer: 0.24, splitter: 0.18, exploder: 0.14, charger: 0.16, tank: 0.14, spitter: 0.14 } },
  { at: 120, w: { swarmer: 0.2, splitter: 0.16, exploder: 0.14, charger: 0.18, tank: 0.16, spitter: 0.16 } },
];
export const ACT2_ELITES = [15, 50, 85, 125];
export const ACT2_EVENTS: { at: number; id: EventId }[] = [
  { at: 20, id: 'spike' }, { at: 60, id: 'stampede' }, { at: 100, id: 'incident' }, { at: 150, id: 'pack' },
];
/** Wave 3+: the old mix plus every trick introduced so far (the wave's own trick weighs most). */
export const LATE_BASE: Partial<Record<ArchId, number>> = { swarmer: 0.2, splitter: 0.14, exploder: 0.12, charger: 0.14, tank: 0.14, spitter: 0.12 };
export const LATE_TRICKS: ArchId[] = ['regression', 'nest', 'flaky', 'creep', 'heisen', 'race'];
export const LATE_ELITES = [15, 45, 80, 110, 140];
export const LATE_EVENTS: { at: number; id: EventId }[] = [
  { at: 20, id: 'spike' }, { at: 55, id: 'stampede' }, { at: 90, id: 'hogzilla' }, { at: 110, id: 'incident' }, { at: 150, id: 'pack' },
];

// ---------------------------------------------------------------- bosses
// Every version adds one kit affix on top of the theme boss; everything earlier stays in its attack library.
export type BossAffix = 'rollout' | 'race' | 'leak' | 'heisen' | 'monolith' | 'loop' | 'backpressure';
export const BOSS_AFFIX: Record<number, BossAffix> = { 2: 'rollout', 3: 'race', 4: 'leak', 5: 'heisen', 6: 'monolith', 7: 'loop' };
export const ZERO_DAY: BossAffix[] = ['race', 'leak', 'heisen', 'monolith', 'loop', 'backpressure'];
export const AFFIX_TEXT: Record<BossAffix, [string, string]> = {
  rollout: ['ROLLOUT', 'Step off the blinking lines before they go live'],
  race: ['RACE CONDITION', 'At half HP it forks in two. Kill both'],
  leak: ['MEMORY LEAK', 'It grows the longer the fight goes'],
  heisen: ['HEISENBUG', 'It blinks out of sight. Keep watching'],
  monolith: ['MONOLITH', 'Armour plates: chip them off one by one'],
  loop: ['INFINITE LOOP', 'It circles you, firing spirals'],
  backpressure: ['BACKPRESSURE', 'Every bug alive slows you down'],
};

// ---------------------------------------------------------------- releases
// After every boss: pick 1 of 3. Tools and v2.0 majors share the screen.
export type ReleaseId = 'selfdriving' | 'hedgehog' | 'freetier' | 'pay0' | 'burning' | 'dsp' | 'tokencap' | 'rollout' | 'sourcemaps'
  | 'transparency' | 'smallteams' | 'makerdays' | 'clickhouse' | 'ingestion' | 'dopamine' | 'offsite' | 'deskhog' | 'killswitch';
export interface ReleaseDef { name: string; line: string; stack?: number; hog?: string; crest?: string }
export const RELEASES: Record<ReleaseId, ReleaseDef> = {
  selfdriving: { name: 'Self-Driving Product', line: 'Every 20 s a scout opens a PR: a fix lands on the biggest crowd', crest: 'self-driving' },
  hedgehog: { name: 'Hedgehog Mode', line: 'Two hog pals fight beside you. Stacks', stack: 3, hog: 'party' },
  freetier: { name: 'Generous Free Tier', line: 'A free chest every wave, and one every 1,000 kills', crest: 'new-business-sales' },
  pay0: { name: '97% Pay $0', line: '+1% damage per 10 gold grabbed this run (max +60%)', crest: 'billing' },
  burning: { name: 'Burning Money', line: 'Every coin becomes a fireball. You bank nothing', hog: 'burning-money' },
  dsp: { name: 'Dangerously Skip Permissions', line: '+50% damage, -30% max HP', hog: 'dynamite' },
  tokencap: { name: 'Token Burning Cap', line: 'Damage ramps +2%/s to +60%. Getting hit resets it', hog: 'hot-popcorn' },
  rollout: { name: 'Rollout 100%', line: '+1 projectile, orb or flag on every weapon', crest: 'feature-flags' },
  sourcemaps: { name: 'Source Maps', line: 'Crits deal x3 instead of x2. +10% crit', crest: 'error-tracking' },
  transparency: { name: 'Default to Transparency', line: 'Bugs under 12% HP die on the next hit', crest: 'editorial' },
  smallteams: { name: 'Small Teams', line: '+15% damage per weapon slot below 6 you leave empty', hog: 'coding-group' },
  makerdays: { name: 'Maker Days', line: 'No meetings Tue/Thu: +40% fire rate every other 30 s', hog: 'remote-work' },
  clickhouse: { name: 'ClickHouse', line: '+30% XP, every level-up heals 5', crest: 'clickhouse' },
  ingestion: { name: 'Ingestion Pipeline', line: 'Every gem is ingested 3 s after it drops, wherever you are', crest: 'ingestion' },
  dopamine: { name: 'Dopamine Mode', line: 'Each level-up spawns an agent orb for 20 s (max 9)', crest: 'posthog-desktop' },
  offsite: { name: 'Offsite Hackathon', line: 'A free level-up in the middle of every wave', hog: 'campfire-cowboy' },
  deskhog: { name: 'DeskHog', line: "A tiny desk console that follows you and shoots. It's a friend.", hog: 'desk-wizard' },
  killswitch: { name: 'Kill Switch Protocol', line: 'Once per wave, dropping under 25% HP clears the screen', crest: 'feature-flags' },
};
export const RELEASE_IDS = Object.keys(RELEASES) as ReleaseId[];

// ---------------------------------------------------------------- powerups
// Timed pickups: rare in wave 1, common later. `hog` = the icon is a hoggie, `crest` = a crest badge.
export type PowerId = 'autopilot' | 'freeze' | 'shipit' | 'rewind' | 'killswitch' | 'webhook' | 'party' | 'hogzilla' | 'troop'
  | 'sampling' | 'cmdk';
export interface PowerDef { name: string; line: string; secs: number; weight: number; col: number; crest?: string; hog?: string; from?: number }
export const POWERUPS: Record<PowerId, PowerDef> = {
  autopilot: { name: 'SELF-DRIVING MODE', line: 'Hands off! Autopilot, and nothing can touch you', secs: 5, weight: 0.3, col: 0x3cbcfc },
  freeze: { name: 'FEATURE FREEZE', line: 'Every bug is paused for 4 s', secs: 4, weight: 0.25, col: 0xa4e4fc },
  shipit: { name: 'SHIP IT!', line: 'Weapons fire twice as fast for 8 s', secs: 8, weight: 0.25, col: 0xfca044 },
  rewind: { name: 'REWIND!', line: 'Session Replay rolls your HP back 5 s', secs: 1.5, weight: 0.2, col: 0xf8b800 },
  killswitch: { name: 'KILL SWITCH', line: 'The most common bug on screen is switched off', secs: 0, weight: 0.18, col: 0x58d854, crest: 'feature-flags', from: 2 },
  webhook: { name: 'WEBHOOK', line: 'Every kill fires a bolt at the next bug for 6 s', secs: 6, weight: 0.2, col: 0xfca044, crest: 'workflows', from: 2 },
  party: { name: 'PARTY MODE', line: 'Hedgehog mode 2.0: damage aura, everything flies in', secs: 6, weight: 0.16, col: 0xf878f8, hog: 'party', from: 2 },
  hogzilla: { name: 'HOGZILLA!', line: 'You are Hogzilla. Run them over', secs: 6, weight: 0.14, col: 0x58d854, hog: 'driving-hogzilla', from: 3 },
  troop: { name: 'SCOUT TROOP', line: '8 scout drones join you for 10 s', secs: 10, weight: 0.18, col: 0x3cbcfc, crest: 'self-driving', from: 2 },
  sampling: { name: 'SAMPLING', line: '90% of bugs go ghostly: harmless, double damage', secs: 5, weight: 0.16, col: 0xbcbcbc, crest: 'replay', from: 3 },
  cmdk: { name: 'CMD+K', line: 'The command palette: pick any powerup', secs: 0, weight: 0.1, col: 0xfcfcfc, crest: 'website', from: 3 },
};
export const POWER_IDS = Object.keys(POWERUPS) as PowerId[];

// ---------------------------------------------------------------- lore
// Merch relics: one per kind per run, from bosses (and rarely elites). Small buffs, collected for good.
export type RelicId = 'cap' | 'pad' | 'cards' | 'bottle' | 'anorak' | 'socks' | 'duffel' | 'jersey' | 'tophat';
export interface RelicDef { name: string; line: string; apply: (s: Stats) => void }
export const RELICS: Record<RelicId, RelicDef> = {
  cap: { name: 'token.burning_cap', line: '+8% damage', apply: (s) => { s.might *= 1.08; } },
  pad: { name: 'dangerously_skip.pad', line: '+6% crit', apply: (s) => { s.crit += 0.06; } },
  cards: { name: 'posthog_playing.cards', line: '+1 reroll', apply: () => { /* game.ts */ } },
  bottle: { name: 'posthog_owala.waterbottle', line: '+1 HP/s regen', apply: (s) => { s.regen += 1; } },
  anorak: { name: 'tech_anorak.jacket', line: '+8% armour', apply: (s) => { s.armour += 0.08; } },
  socks: { name: 'summer.socks', line: '+8% move speed', apply: (s) => { s.speed *= 1.08; } },
  duffel: { name: 'retired-billboard.duffel', line: '+30% pickup range', apply: (s) => { s.magnet *= 1.3; } },
  jersey: { name: 'home.jersey', line: '+12% XP', apply: (s) => { s.growth *= 1.12; } },
  tophat: { name: 'top.hat', line: '+15% luck (hedgehog mode approved)', apply: (s) => { s.luck *= 1.15; } },
};
export const RELIC_IDS = Object.keys(RELICS) as RelicId[];

/** Handbook pages: page n drops the first time you beat boss version n (and rarely from late crates). */
export const PAGES: [string, string][] = [
  ['Idea number 6', 'The sixth idea, after five pivots in six months.'],
  ['YC W20', 'Tim and James joined Y Combinator, winter 2020.'],
  ['The MVP', 'Built in four weeks, then launched on Hacker News.'],
  ['300 deployments', 'Over 300 deployments in a couple of days.'],
  ['ClickHouse', 'Oct 2020: moved to ClickHouse for billions of events.'],
  ['PostHog 3000', 'Going from 1 to 3000, not 0 to 1.'],
  ["Max's rule", 'Max is never drawn in profile. Self-conscious.'],
  ['The name', 'The hedgehog is still called Max.'],
  ["You're the driver", 'No deadlines, very minimal coordination.'],
  ['Make it public', 'We default to transparency with everything.'],
  ['Do more weird', "We aren't weird for the sake of it."],
  ['Why not now?', 'Doing the thing is the answer by default here.'],
  ['Optimistic by default', 'You cannot change the world without believing you can.'],
  ['Culture', 'If given a choice, go live. Write everything down.'],
  ['Free tier', 'Your free allowance renews every month. Yes, all of it.'],
  ['97%', '97% of companies use PostHog for free.'],
  ['Offsites', 'A 24-hour hackathon at every offsite.'],
  ['DeskHog', 'A palm-sized console with three buttons. A friend.'],
  ['Hedgehog mode', 'Tiny hedgehogs on your website, sometimes in top hats.'],
  ['Self-driving', 'A troop of more than 90 scouts watches PostHog.'],
  ['Mission', 'Equip every developer to build successful products.'],
  ['Owners', 'Zero intention of selling our business.'],
];

// ---------------------------------------------------------------- heat

export interface HeatDef { desc: string }
/** Heat h applies every row 1..h. */
export const HEAT: HeatDef[] = [
  { desc: 'The standard run' },
  { desc: 'More bugs' },
  { desc: 'Faster bugs' },
  { desc: 'Elites come early' },
  { desc: 'Less healing' },
  { desc: 'Boss rage and an extra boss affix' },
];

// ---------------------------------------------------------------- shop

/** Hoggie capsule price: rises with every hoggie you own. */
export const capsulePrice = (owned: number) => 110 + 15 * owned;

// ---------------------------------------------------------------- merch store
// SHOP is the merch store: every item in PostHog's real merch store, each with a strange but useful effect. Owning it is
// wearing it. Items stack: each copy applies the effect again and costs more than the last (MERCH_STACK). `apply` runs in
// recalc (4x a second) with the hog's live state; in co-op that state is the sim's, so it stays deterministic.
export interface MerchCtx { hpFrac: number; moving: boolean; elapsed: number; wave: number; level: number; weapons: number; boss: boolean }
export interface MerchDef {
  name: string; line: string; cost: number;
  apply?: (s: Stats, c: MerchCtx) => void;
  rerolls?: number; skips?: number; banishes?: number; // extra per run, per copy
}
/** Each copy costs this much more than the one before. */
export const MERCH_STACK = 1.6;
export const merchPrice = (id: string, owned: number) => Math.round((MERCH[id].cost * Math.pow(MERCH_STACK, owned)) / 10) * 10;
const still = (c: MerchCtx) => !c.moving;
export const MERCH: Record<string, MerchDef> = {
  pad: { name: 'dangerously_skip.pad', line: 'Skip the boring bits: +1 skip and +1 banish per run', cost: 320, skips: 1, banishes: 1 },
  owala: { name: 'posthog_owala.waterbottle', line: 'Sip on the move: +1 HP/s regen while moving', cost: 380,
    apply: (s, c) => { if (c.moving) s.regen += 1; } },
  cards: { name: 'posthog_playing.cards', line: 'Shuffle up: +1 reroll per run, +4% luck', cost: 300, rerolls: 1,
    apply: (s) => { s.luck *= 1.04; } },
  burncap: { name: 'token.burning_cap', line: 'Burns tokens: +7% damage, weapons 2% slower', cost: 280,
    apply: (s) => { s.might *= 1.07; s.cd *= 1.02; } },
  duffel: { name: 'retired-billboard.duffel', line: 'Hauls loot: +15% gold, +15% pickup range', cost: 350,
    apply: (s) => { s.gold *= 1.15; s.magnet *= 1.15; } },
  sleeve: { name: 'PostHog Laptop Sleeve', line: 'Padded: +12% armour while standing still', cost: 320,
    apply: (s, c) => { if (still(c)) s.armour += 0.12; } },
  home: { name: 'slimfit_home.jersey', line: 'Home advantage: +12% damage in waves 1-3', cost: 380,
    apply: (s, c) => { if (c.wave <= 3) s.might *= 1.12; } },
  away: { name: 'slimfit_away.jersey', line: 'Plays better away: +12% damage from wave 4 on', cost: 450,
    apply: (s, c) => { if (c.wave >= 4) s.might *= 1.12; } },
  tote: { name: 'tote.bag', line: 'Carries everything: +40% pickup range, -4% speed', cost: 250,
    apply: (s) => { s.magnet *= 1.4; s.speed *= 0.96; } },
  cycling: { name: 'cycling.shirt', line: 'Aerodynamic: +10% speed, -10 max HP', cost: 350,
    apply: (s) => { s.speed *= 1.1; s.maxHp -= 10; } },
  socks: { name: 'summer.socks', line: 'Fresh feet: +5% speed, +0.3 HP/s regen', cost: 300,
    apply: (s) => { s.speed *= 1.05; s.regen += 0.3; } },
  windbreaker: { name: 'windbreaker.jacket', line: 'Bugs bounce off: +8% armour, +6% speed while moving', cost: 480,
    apply: (s, c) => { s.armour += 0.08; if (c.moving) s.speed *= 1.06; } },
  wshorts: { name: 'womens.shorts', line: 'Long stride: +6% speed, +6% XP', cost: 380,
    apply: (s) => { s.speed *= 1.06; s.growth *= 1.06; } },
  mshorts: { name: 'mens.shorts', line: 'Knees out: +6% speed, +4% crit', cost: 380,
    apply: (s) => { s.speed *= 1.06; s.crit += 0.04; } },
  cap2020: { name: '2020.cap', line: 'Hindsight is 20/20: +10% luck, +8% XP', cost: 400,
    apply: (s) => { s.luck *= 1.1; s.growth *= 1.08; } },
  crossbody: { name: 'crossbody.bag', line: 'Room for options: +1 skip per run, +10% pickup range', cost: 380, skips: 1,
    apply: (s) => { s.magnet *= 1.1; } },
  canvas: { name: 'heavy_canvas.jacket', line: 'Built like a tent: +25 max HP, -6% speed', cost: 400,
    apply: (s) => { s.maxHp += 25; s.speed *= 0.94; } },
  camo: { name: 'camo.cap', line: 'Hard to spot when hurt: +18% armour below half HP', cost: 420,
    apply: (s, c) => { if (c.hpFrac < 0.5) s.armour += 0.18; } },
  wtee: { name: 'womens.tee', line: 'Comfy fit: +8% max HP, +3% speed', cost: 350,
    apply: (s) => { s.maxHp *= 1.08; s.speed *= 1.03; } },
  quilted: { name: 'womens_quilted.jacket', line: 'Cosy: +0.6 HP/s regen, +10 max HP', cost: 450,
    apply: (s) => { s.regen += 0.6; s.maxHp += 10; } },
  mug: { name: 'posthog_ceramic_art.mug', line: 'Caffeine: weapons 8% faster, -12 max HP (jitters)', cost: 520,
    apply: (s) => { s.cd *= 0.92; s.maxHp -= 12; } },
  calendar: { name: 'organizer_2026.cal', line: 'Time-boxed: weapons 1% faster per minute (max 12%)', cost: 500,
    apply: (s, c) => { s.cd *= 1 - Math.min(0.12, Math.floor(c.elapsed / 60) * 0.01); } },
  quickcall: { name: 'quick.call', line: 'Got a sec? Weapons 10% faster in boss fights', cost: 480,
    apply: (s, c) => { if (c.boss) s.cd *= 0.9; } },
  lightmode: { name: 'light_mode.shirt', line: 'Blinding: bugs take 5% more damage, +8% weapon size', cost: 550,
    apply: (s) => { s.vuln += 0.05; s.area *= 1.08; } },
  tracksuit: { name: 'posthog_track.suit', line: 'Warmed up: +12% speed above half HP', cost: 380,
    apply: (s, c) => { if (c.hpFrac > 0.5) s.speed *= 1.12; } },
  supabase: { name: 'supabase_posthog.shirt', line: 'Better together: +8% damage and XP with 3+ weapons', cost: 500,
    apply: (s, c) => { if (c.weapons >= 3) { s.might *= 1.08; s.growth *= 1.08; } } },
  plush: { name: 'max.hedgehog', line: 'Emotional support: +1 revive per run, -10% damage', cost: 880,
    apply: (s) => { s.revives += 1; s.might *= 0.9; } },
  deskhog: { name: 'DeskHog Kit', line: 'Soldered on: +1 projectile, -15% weapon size', cost: 1000,
    apply: (s) => { s.amount += 1; s.area *= 0.85; } },
  theo: { name: 'Theo mode t-shirt', line: 'Streamer mode: +18% XP while moving', cost: 450,
    apply: (s, c) => { if (c.moving) s.growth *= 1.18; } },
  backpack: { name: 'PostHog Timbuk2 Backpack', line: 'Pockets everywhere: +1 reroll, +1 skip, -5% speed', cost: 520, rerolls: 1, skips: 1,
    apply: (s) => { s.speed *= 0.95; } },
  keycaps: { name: 'posthog_caps.key', line: 'Clicky: +6% crit, +25% crit damage', cost: 550,
    apply: (s) => { s.crit += 0.06; s.critMul += 0.25; } },
  thirsty: { name: 'Thirsty for business t-shirt', line: 'Thirsty: +50% pickup range below half HP, +8% gold', cost: 350,
    apply: (s, c) => { if (c.hpFrac < 0.5) s.magnet *= 1.5; s.gold *= 1.08; } },
  growing: { name: "How's it growing? t-shirt", line: 'Green thumb: +20% XP, -8% damage', cost: 420,
    apply: (s) => { s.growth *= 1.2; s.might *= 0.92; } },
  runtime: { name: 'Runtime error t-shirt', line: 'Fails loudly: +40% crit damage, -4% crit', cost: 420,
    apply: (s) => { s.critMul += 0.4; s.crit -= 0.04; } },
  candle: { name: 'Candle by PostHog', line: 'Burns at both ends: +16% damage, -15% max HP', cost: 550,
    apply: (s) => { s.might *= 1.16; s.maxHp *= 0.85; } },
  college: { name: 'College t-shirt', line: 'Studied hard: +1% damage per level (max 20%)', cost: 580,
    apply: (s, c) => { s.might *= 1 + Math.min(0.2, 0.01 * c.level); } },
  scrabble: { name: 'Scrabble t-shirt', line: 'Triple word score: +25% damage every 3rd minute', cost: 480,
    apply: (s, c) => { if (Math.floor(c.elapsed / 60) % 3 === 2) s.might *= 1.25; } },
  hogzilla: { name: 'Hogzilla t-shirt', line: 'Size up: +18% weapon size, -4% speed', cost: 480,
    apply: (s) => { s.area *= 1.18; s.speed *= 0.96; } },
  watch: { name: 'Popular name brand watch t-shirt', line: 'Always on time: weapons 2% faster per wave (max 10%)', cost: 500,
    apply: (s, c) => { s.cd *= 1 - Math.min(0.1, 0.02 * c.wave); } },
  tactical: { name: 'Tactical black t-shirt', line: 'Operator: +5% speed, +5% armour', cost: 450,
    apply: (s) => { s.speed *= 1.05; s.armour += 0.05; } },
  danger: { name: 'Danger t-shirt', line: 'Cornered: +25% damage below 30% HP', cost: 450,
    apply: (s, c) => { if (c.hpFrac < 0.3) s.might *= 1.25; } },
  diffstickers: { name: 'The different sticker pack', line: 'Think different: +1 projectile below half HP', cost: 780,
    apply: (s, c) => { if (c.hpFrac < 0.5) s.amount += 1; } },
  memes: { name: 'PostHog meme sticker pack', line: 'Stick them on everything: +25% gold', cost: 320,
    apply: (s) => { s.gold *= 1.25; } },
  friends: { name: 'Hogzilla & friends sticker pack', line: 'Bring friends: +10% weapon size, +10% pickup range', cost: 380,
    apply: (s) => { s.area *= 1.1; s.magnet *= 1.1; } },
  darkls: { name: 'Dark mode long sleeve shirt', line: 'Eyes adjusted: +10% armour after 5 minutes', cost: 420,
    apply: (s, c) => { if (c.elapsed >= 300) s.armour += 0.1; } },
  hedgetee: { name: 'Hedgehog t-shirt', line: 'Spiky: +5% armour, +0.4 HP/s regen', cost: 420,
    apply: (s) => { s.armour += 0.05; s.regen += 0.4; } },
  hedgehoodie: { name: 'Hedgehog hoodie', line: 'Curl up: +1.5 HP/s regen while standing still', cost: 480,
    apply: (s, c) => { if (still(c)) s.regen += 1.5; } },
  warehouse: { name: 'Data warehouse t-shirt', line: 'Hoarder: +3% damage per weapon you own', cost: 520,
    apply: (s, c) => { s.might *= 1 + 0.03 * c.weapons; } },
  pastatee: { name: 'Copy/pasta t-shirt', line: 'Ctrl+C: +1 projectile, weapons 12% slower', cost: 850,
    apply: (s) => { s.amount += 1; s.cd *= 1.12; } },
  pastahoodie: { name: 'Copy/Pasta Hoodie', line: 'Ctrl+V: powerups last 40% longer', cost: 400,
    apply: (s) => { s.dur *= 1.4; } },
  darkhoodie: { name: 'PostHog Dark Mode Hoodie', line: 'Night shift: +10% damage, +8% armour after 10 minutes', cost: 520,
    apply: (s, c) => { if (c.elapsed >= 600) { s.might *= 1.1; s.armour += 0.08; } } },
  carhartt: { name: 'PostHog Carhartt cap', line: 'Workwear: +15 max HP, +4% armour', cost: 420,
    apply: (s) => { s.maxHp += 15; s.armour += 0.04; } },
  sticker: { name: 'PostHog sticker', line: 'Cheap and cheerful: +3% damage, +3% XP', cost: 150,
    apply: (s) => { s.might *= 1.03; s.growth *= 1.03; } },
  startups: { name: 'PostHog for Startups Kit', line: 'Runway: +15% gold and XP in waves 1-2', cost: 450,
    apply: (s, c) => { if (c.wave <= 2) { s.gold *= 1.15; s.growth *= 1.15; } } },
  yc: { name: 'PostHog YC kit', line: 'Demo day: +15% damage in boss fights', cost: 520,
    apply: (s, c) => { if (c.boss) s.might *= 1.15; } },
  newhire: { name: 'PostHog New Hire Kit', line: 'Onboarding: +30% XP for the first 3 minutes', cost: 350,
    apply: (s, c) => { if (c.elapsed < 180) s.growth *= 1.3; } },
  birthday: { name: 'PostHog Birthday Gift', line: 'Surprise! +12% luck, +6% gold', cost: 380,
    apply: (s) => { s.luck *= 1.12; s.gold *= 1.06; } },
};
export const MERCH_IDS = Object.keys(MERCH);
export type MerchOwned = Readonly<Record<string, number>>;
const copies = (owned: MerchOwned, id: string) => Math.max(0, Math.min(50, Math.floor(Number(owned[id]) || 0)));
/** Everything owned, every copy: stats now (MERCH_IDS order, so co-op peers agree); rerolls etc. are read at run start. */
export function applyMerch(owned: MerchOwned, s: Stats, c: MerchCtx) {
  for (const id of MERCH_IDS) {
    const m = MERCH[id], n = copies(owned, id);
    if (m.apply) for (let i = 0; i < n; i++) m.apply(s, c);
  }
  s.maxHp = Math.max(20, s.maxHp);
  s.speed = Math.max(40, s.speed);
  s.crit = Math.max(0, s.crit);
}
export const merchExtra = (owned: MerchOwned, k: 'rerolls' | 'skips' | 'banishes') =>
  MERCH_IDS.reduce((n, id) => n + (MERCH[id][k] ?? 0) * copies(owned, id), 0);

// ---------------------------------------------------------------- arena hazards

/** Breakable crates (food, coins, pickups) and spreading tech-debt puddles that slow the hog. */
export const HAZARDS = {
  crateEvery: 22, crateFrom: 20, crateMax: 3,
  puddleEvery: 30, puddleFrom: 75, puddleMax: 4, puddleLife: 45, puddleGrow: 15, puddleR: 34, puddleSlow: 0.55,
};

// ---------------------------------------------------------------- YOLO mode
/** --dangerously-skip-permissions: unlocked by clearing wave 5. */
export const YOLO = { spawn: 3, xp: 3, gold: 3, dmg: 2, bossEvery: 90, rainEvery: 6, unlockWave: 6 };
export const YOLO_SNARK = [
  'Max chose {c}. Again.', 'Max: "{c}. Trust me."', 'Max picked {c} without asking.', 'Max merged {c} straight to main.',
  'Max: "{c}? Ship it."', 'Max skipped review for {c}.', 'Max: "I read the docs. {c}."', 'Max: "{c}. No notes."',
];
