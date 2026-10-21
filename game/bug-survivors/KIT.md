# Bug Survivors (kit 1)

A Vampire Survivors-style game. A PostHog hoggie stands in the prospect's arena while swarms of bugs named after
their pain points close in. Weapons fire on their own and every weapon is a PostHog product, picked from 3 cards at
each level-up. At 3:30 a boss (their biggest generic problem) arrives. Beating it clears wave 1: cash out with the
win (about 4 minutes), or keep climbing the **wave ladder**. Every later boss is a release marker ("<boss> 2.0",
"3.0"...), each followed by CONTINUE / CASH OUT and a free Release pick. Enemies and the player both keep scaling
until the run ends. Best for engineering buyers.

The first run (Enter on the title = RUN, heat 0, the default hoggie) plays like the original through the 3:30
boss: same length, same boss time, winnable by a novice on easy/normal. Depth comes from the ladder and later runs:
evolutions, releases, 15 PostHog tools, 171 hoggies to unlock, 55 crests, heat 1-5, the shop, YOLO mode and the
daily run.

## What the theme changes (unchanged contract: no new theme fields)
| Field | Where it shows | Matters most because |
|---|---|---|
| `title`, `tagline` | Title screen, browser tab | First thing the prospect reads |
| `game.enemies[].name/pain` | "NEW BUG" banner, "NEW TRICK" / "ELITE" banners, event banners | The personal hook: their own problems, in their words |
| `game.boss.name/taunt` | Boss banners, HP bar ("<name> 3.0"), how-to text | The climax, then every wave's marker |
| `products`, `game.starting_product` | Level-up cards, HUD icons, hoggie start weapons | Which PostHog products they "try" |
| `game.product_lines` | Level-up card text for a new product | Tailored pitch without a pitch |
| `palette` | Background, boxes, highlights, recoloured default art | Brand feel |
| `game.arena.name` | Start banner | Setting |
| `text.win/lose/credits` | End screen | Last impression |
| `game.difficulty` | Enemy HP/damage/spawn, regen | easy for execs, hard for gamers |
| `*.sprite_prompt` | Per-prospect sprites (the prompt is the art brief) for enemies, boss, floor tile | Look |

Fixed in the kit (never per prospect): the hoggies and crests (PostHog brand art, `tools/import_brand.py` bakes
`@posthog/brand` into `public/assets/kit/`), product/passive/tool icons, projectiles, gem, coin, chest, food, hotfix
bomb, vacuum magnet, crate, merch and handbook page pickups, the level curve, weapon behaviour, evolutions, the
whole ladder (waves, modifiers, boss affixes, releases, powerups) and YOLO mode. Pixel sprites use master-palette
letters only, so existing prospect builds pick everything up on reassembly.

## How a run plays
- **Wave 1 (heat 0):** swarmers, then splitters (0:30), exploders (1:00), chargers + tanks (1:40), spitters (2:30).
  Elites at 1:30 and 2:30. Events: 1:00 ring encirclement, 2:00 stampede (warning chevrons, always a gap),
  3:00 elite pack. Heat or daily runs shuffle the event order. Boss at 3:30.
- **Enemy archetypes:** each theme enemy drives several behaviours, told apart by tint and a one-time "NEW TRICK"
  banner: enemy 1 swarmer / exploder / Flaky (blinks) / Race Condition (a linked pair: kill both within 2 s or the
  other enrages); enemy 2 splitter / charger / Regression (comes back once) / Scope Creep (grows); enemy 3 tank /
  spitter / Legacy Nest (stationary mini factory) / Heisenbug (invisible unless close or scanned).
- **Elites:** 1.6x size, ~9x HP, a modifier (fast / shielded / regenerating; from wave 3 also Memory Leak (puddles),
  Flaky, Swarming, Dead Letter Queue (bursts into bugs)), two modifiers from wave 4. They drop a chest + coins.
- **Chests:** evolve a weapon if one is ready, else fuse (secret), else level up (or patch) 1-3 owned items. Gold.
- **Weapons (level 1-5), evolutions and versions:** weapon at level 5 + partner passive + a chest = evolution
  (v1.0). After that its card keeps coming as a **patch** (v1.1, v1.2... x1.12 damage each, compounding). A
  Release card can bump an evolved weapon to **v2.0** (x1.6 damage, +1 amount, 15% faster). Product evolutions:
  Experiments + Pair Programming = Multivariate Barrage; Error Tracking + Rubber Duck = Stack Trace Storm;
  Session Replay + Autocapture = Rage Click Vortex; Feature Flags + Hot Reload = Kill Switch Grid;
  Product Analytics + Big Monitor = Funnel Quake; Surveys + Code Review = NPS Blizzard.
  Secret: Rage Click Vortex + Stack Trace Storm + another chest = Full Stack Nova.
- **Passives (6 held, 8 from wave 3):** Hedgehog Sprint, Autocapture, Snack Break, Hot Reload, Code Review, Big
  Monitor, Pair Programming, Rubber Duck, Docs Day, Lucky Commit, Rollback; from wave 2 the handbook values:
  You're the Driver (+damage while moving), Make It Public (bugs take more damage, armour or not), Do More Weird
  (hits proc a random weapon), Why Not Now? (longer powerups), Optimistic by Default (+damage above half HP, regen).
  Maxed passives patch at half a level.
- **Level-up:** cards weighted toward the build (owned items, evolution partners), "Evolves with X" hints.
  R reroll (Drake Nah), X skip (+3 gold), B banish (Drake Yah): 1 each per run (more from the shop and merch).
- **Pickups:** gems (XP), coins (gold), food (+25 HP), vacuum magnet, hotfix bomb, powerups, merch relics, handbook
  pages. Breakable crates are the steady source of food. Tech-debt puddles slow the hog to 55%.
- **Boss (wave 1):** ring, telegraphed charge, spiral (heat 2+ or angry) and summon (angry). Angry at 50% HP or after
  50 s; at heat 5 it rages at 25%. From 50 s it crumbles (+5% damage taken per second, max x8).
- **Hits:** one hit takes at most 35% of max HP (after armour). The Hogzilla drive-by is the exception.
- **Pause (ESC):** each weapon with its version and evolution status, releases, merch, wave and funding.

## The wave ladder
- **After every boss:** the field clears, gems and lore fly in, then **vN.0 SHIPPED!** (wave 1: WAVE 1 CLEAR!) with
  CONTINUE (default) or CASH OUT. CONTINUE = a **funding round** (+15% damage, +10 max HP, stacking), this wave's gold
  becomes safe, and **SHIP A RELEASE**: pick 1 of 3 from releases, new tools (at least one on offer through wave 5)
  and v2.0 majors. The next wave starts at full HP with the boss's big chest a few steps away.
- **Push your luck:** from wave 2, gold picked up since the last CONTINUE is at risk (HUD: "N AT RISK"). Die and
  you keep half of it; CASH OUT banks all of it plus a bonus of 15% x the wave number. Wave 1 gold is always kept.
- **Waves** (each 3:00 of traffic, then its boss):
  | wave | name | modifier | new trick |
  |---|---|---|---|
  | 1 | MVP | - (the original run) | the six classics |
  | 2 | HACKER NEWS LAUNCH | old Act 2 script: traffic spike, stampede, incident, elite pack | - |
  | 3 | PRODUCT-MARKET FIT | two extra traffic spikes | Regression |
  | 4 | THE BIG MIGRATION | twice the tech-debt puddles | Legacy Nest |
  | 5 | HYPERGROWTH | +30% spawns, +30% XP | Flaky |
  | 6 | ENTERPRISE DEAL | bugs take 35% less damage | Scope Creep |
  | 7 | OUTAGE | darkness beyond a circle round the hog | Heisenbug |
  | 8 | CODE FREEZE | icy floor: the hog slides | Race Condition |
  | 9-12 | SCALE 1-4 | two random modifiers (the pool adds ingestion lag: gems take 2 s to appear) | all mixed |
  | 13 | DEPRECATION | the Reaper arrives 20 s in (and every wave after) | - |
  Wave 3+ events: 0:20 traffic spike, 0:55 stampede, 1:30 Hogzilla drive-by, 1:50 incident, 2:30 elite pack; lone
  elites at 0:15, 0:45, 1:20, 1:50, 2:20.
- **Scaling:** wave 2 keeps the old Act 2 ramps (spawns x1.35, bug HP x1.3 -> x2.6, damage x1.3). From wave 3 bug HP
  grows x2.1 per wave (x2.5 from wave 9: the soft wall), damage x1.25 per wave, speed +5% per wave (max x1.4), spawns
  +10% per wave (the 320-bug cap turns the rest into HP). Difficulty and heat multiply on top.
- **Boss markers:** the theme boss at version N with a kit affix; every earlier trick stays in its library.
  2.0 Rollout (blinking lines go live), 3.0 Race Condition (forks at half HP; kill both), 4.0 Memory Leak (grows,
  drips puddles), 5.0 Heisenbug (blinks out and back), 6.0 Monolith (four armour plates to chip off), 7.0 Infinite
  Loop (circles you, firing spirals), 8.0+ two random affixes (the pool adds Backpressure: every live bug slows you).
  Heat 5 adds one more. HP is set from the build's real DPS so fights last about 60 s at wave 2 and 45 s later, and
  from 55 s the boss crumbles fast (up to x16 damage taken).
- **Releases** (1 of 3 per boss; Hedgehog Mode stacks to 3): Self-Driving Product (a PR blast on the biggest crowd
  every 20 s), Hedgehog Mode (two hoggie pals), Generous Free Tier (a chest per wave and per 1,000 kills), 97% Pay $0
  (+1% damage per 10 gold grabbed, max +60%), Burning Money (coins become fireballs, no gold), Dangerously Skip
  Permissions (+50% damage, -30% HP), Token Burning Cap (damage ramps until you're hit), Rollout 100% (+1 amount),
  Source Maps (x3 crits), Default to Transparency (bugs under 12% die on the next hit), Small Teams (+15% damage per
  empty weapon slot below 6), Maker Days (+40% fire rate every other 30 s), ClickHouse (+30% XP, heal on level-up),
  Ingestion Pipeline (gems auto-collect after 3 s), Dopamine Mode (agent orbs per level-up), Offsite Hackathon (a free
  mid-wave level-up), DeskHog (a turret pal), Kill Switch Protocol (once per wave, dropping under 25% clears the screen).
- **PostHog tools** (kit-fixed weapons, never theme products; offered from the first Release screen):
  | tool | weapon | behaviour | evolution (partner) |
  |---|---|---|---|
  | Web Analytics | Traffic Beam | sweeping beams | Realtime Dashboard: six-beam star (Autocapture) |
  | Heatmaps | Heat Trail | hot tiles behind you | Heat Wave: bigger, slows bugs (Hedgehog Sprint) |
  | PostHog AI | Max AI | drone that bolts the toughest bug | Deep Research: triple jumping bolts (Docs Day) |
  | Data Warehouse | Warehouse Vault | orbiting data drums | Managed Warehouse: drums shatter into shards (Snack Break) |
  | Workflows | Automation | zap that hops bug to bug | Multi-Channel Blast: forks every hop (Why Not Now?) |
  | Data Pipelines | Pipeline | a pipe toward the crowd sucks bugs in and hits them at the destination | Hog Transformations: bugs that die in a pipe fire back out as homing events (Optimistic by Default) |
  | Batch Exports | Batch Export | every hit tags the bug; every ~10 s the batch exports a share of the damage at once | Backfill: every export replays at half (Docs Day) |
  | Scouts | Scout Troop | drones flag bugs: +40% damage from everything | Troop of 90: every 12 flags a PR laser (Do More Weird) |
  | HogQL | DELETE FROM bugs | executes on-screen bugs under 6-10% HP (bosses take a chip) | Materialized View: 15%, every 3 s (Make It Public) |
  | Logs | tail -f | log lines scroll across the screen through the bugs | Firehose: from two sides (Hot Reload) |
  | Replay Vision | Vision Scanner | scanner eyes sweep a cone, zap, reveal Heisenbugs | Sees Everything: Monitor / Scorer / Classifier / Summarizer (Big Monitor) |
  | AI Observability | Trace | a hit spreads along a span tree | Evaluations: spans crit on traced bugs (Rubber Duck) |
  | Revenue Analytics | MRR Cannon | cannonballs that hit harder the more gold you grabbed | Net Revenue Retention: compounds per wave (Lucky Commit) |
  | Endpoints | Endpoint Turret | drops turrets that repeat a shot | Edge Cache: three permanent turrets (You're the Driver) |
  | PostHog Desktop | Command Center | a ring of up to 9 agent orbs | Dopamine Mode: all 9 volley every 5 s (Pair Programming) |
- **Powerups** (glow ring, at most 2 on the floor; wave 1 rare, later common): Self-Driving Mode (autopilot, can't be
  touched), Feature Freeze, Ship It! (x2 fire rate), Rewind (HP back 5 s); from wave 2 Kill Switch (the most common
  bug on screen dies), Webhook (kills chain bolts), Party Mode (damage aura, everything flies in), Scout Troop; from
  wave 3 Hogzilla (become Driving Hogzilla and run bugs over), Sampling (90% of bugs go ghostly: harmless, double
  damage), Cmd+K (pick any powerup).
- **Unhinged:** the **Hogzilla drive-by** (a horn, a flashing lane, then the car flattens everything in it, including
  you for 25% HP if you stay); **ALL HANDS** (every hoggie you've unlocked stampedes across the screen: on a new best
  wave and at every YOLO boss); **the Reaper** at wave 13 (never stops, keeps speeding up; killing it unlocks Angel);
  **YOLO mode** (below).
- **Lore:** merch relics (from every boss from 2.0 and ~3% of late elites; one of each per run, small buffs, collected
  for good: token.burning_cap, dangerously_skip.pad, posthog_playing.cards, the Owala bottle, tech anorak, summer socks,
  retired-billboard duffel, home jersey, top hat) and 22 handbook pages (page N from the first boss N.0 you beat,
  and rare wave 6+ crates) with checked PostHog history, values and quotes.

## Hoggies (the player characters)
All 171 hoggies from `@posthog/brand` are playable (32 px in the arena with code animation: bob, squash, tilt, flip;
64 px portraits in menus). About 40 **signature** hoggies bring a start weapon and a trait (Terminator: minigun
Experiments + a free revive; Reaper: reaps weak bugs, -30% HP; Self-driving: autopilot every wave start; Driving
Hogzilla: runs bugs over; Burning Money; Caveman evolves into Business Evolution and Final Evolution at waves 3 and 6;
Noir and X-ray see Heisenbugs; Data Thief starts with Data Pipelines; Desk Wizard brings a DeskHog; Angel revives at
full HP every wave...). The rest are the **cast**: default stats plus one small perk that matches the art (`hoggies.ts`
PERK_RULES). A signature start weapon that's a theme product is used only if the theme features it; tools always work.
**Unlocks:** 3 on a fresh save (I'm The Driver, Wizard, one random), every crest unlocks its hoggie, milestones
(Caveman at wave 3, Terminator at wave 5, 996 at 9:36, Reaper at wave 13, Burning Money by taking that release,
Angel by killing the Reaper), and **capsules**: one per wave cleared after the first (max 5 a run) plus buyable in the
shop (price rises with the roster). New hoggies get a reveal screen after the run. Daily runs use the default hoggie.

## Crests (the achievements)
All 55 PostHog team crests, each earned by something fitting its team or product (`crests.ts`): evolutions for the
product crests, reaching waves 8/10 (Cloud Foundations/Platform), 100,000 bugs (ClickHouse), a 100-row export (Batch
Exports), 9 agents (PostHog Desktop), getting run over by Hogzilla (YouTube)... Each pops a badge in-game and unlocks
a hoggie. Old achievement ids migrate to crests (`LEGACY` in crests.ts) and old heroes to hoggies.

## Touch (phones and tablets)
On a touch device (`(hover: none) and (pointer: coarse)`) the kit sets `touch: true` and everything plays by finger:
drag anywhere to move (a floating joystick where the finger lands, with a little analog range), tap a card to select it
and tap it again to pick (nothing starts selected, so a stray tap can't pick), REROLL / SKIP / BANISH buttons, tap
twice to CONTINUE or CASH OUT, tap to close chests and the hoggie reveal, a pause button left of the clock (RESUME,
NUMBERS, SOUND, QUIT), and a shop with tappable tabs, rows and grids (swipe the hoggie grid) plus a BACK button. The
shared Title / How-to / End screens show tap hints and take taps (a tapped title choice selects; a tap elsewhere starts).
Phones get a fractional zoom that fills the screen, the page blocks scrolling and pinch-zoom, portrait shows "Turn your
phone sideways", and Android goes fullscreen on the first tap. The mouse drives the same joystick and taps on desktop.

## Title menu, meta and modes
- Title rows: `RUN  YOLO  MERCH  SCORES` and `HEAT 0-5` (SCORES only where leaderboards are on). Enter (or a double-click on a choice) = start; the wheel
  changes the choice. Enter = RUN heat 0. YOLO unlocks by reaching wave 6.
  Heat n unlocks by winning heat n-1 (a win = clearing wave 1). The title shows gold, best wave, hoggie count and
  today's daily best, and the current hoggie.
- **Heat (stacking):** 1 more bugs, 2 faster bugs, 3 elites early, 4 no regen + half food, 5 boss rage + an extra boss
  affix. Each level also adds pressure that ramps in over 2:30 (+15% bug HP and +10% spawns per level, +8% damage).
  Gold x(1 + 0.1 heat), score x(1 + 0.2 heat).
- **YOLO (`--dangerously-skip-permissions`):** x3 spawns, XP and gold, x2 damage both ways, 90 s waves, no level-up
  pauses (PostHog AI picks your cards and releases, with commentary), a powerup every 6 s, ALL HANDS at every boss.
- **MERCH** (title choice, the shop scene; TAB or 1-3 switch tabs): MERCH (the Hoggie Capsule, then all 57 items in
  PostHog's real merch store, `MERCH` in content.ts, each with a strange but useful effect; anything owned works in every
  run, and copies stack, each costing x1.6 the last), HOGGIES (the roster grid; ENTER plays as), CRESTS (the wall, with
  what each unlocks). Mouse: click selects, a
  second click (double-click) buys / plays as, the wheel scrolls. The old upgrade levels were refunded as gold.
- **Leaderboards** (`shared/src/leaderboard.ts`, `scores.ts`; server `mp-server/src/board.ts`): top 20 per game slug and
  mode (RUN, YOLO), 3-letter initials. A run that makes the board gets NEW HIGH SCORE on the End screen (or type a letter).
  On wherever the game is hosted and in the Android app; off on localhost unless `?lb=<endpoint>`.
- The daily mode is gone (its code is dormant). Its two crests (Customer Success EU/NA) were earned by finishing co-op games, which this build does not have, so they cannot be earned.
- Save: shared meta blob per slug + kit (`meta.data.kit`: merch (copies owned), hog, hogs, capsules, lifetime totals, best wave,
  collections, codex, daily best, damage-number setting). Blocked storage = first run, never a crash.

## Analytics (optional PostHog capture, unchanged transport)
Kit events: `product_picked`, `weapon_evolved`, `bug_event` (event, t, wave), `wave_start` (wave, t, level, tools, mods),
`wave_cleared` (wave, t, level, dps), `release_picked` (release, wave), `cash_out` (t, level, kills, wave), `powerup`
(kind, t, wave), plus the shared `achievement`. `game_finished` props add gold, hog, evolutions, elites, boss_kills,
wave, cashed_out, powerups, releases, yolo.

## Test hooks
`__game.debug`: autopilot(on, style) (`'novice'` = first card, no rerolls, ignores pickups), botCash(wave) (the bot
cashes out after that wave's boss; default 2 so Gate 1's bot run ends), holdLevels(on), speed, god, lose, win,
showcase, warp(s), spawnBoss, hurtBoss(frac), killBoss (beats the current wave's boss: SHIPPED screen), wave(n) (jump
into wave n), giveAll, maxAll, xp(n), flood(n), evolve(id), evolveAll, patch(id, n), major(id), release(id), tool(id),
tools, powerup(kind) (drop), activate(kind), relic, page(n), superNova, passives(lvl), chest(big), pickup(kind),
hotfix, crate, puddle, elite(arch), event(id), spawn(arch, n), passive(id, lvl), reaper, driveBy, allHands(n), pr, bossHere(dx),
bossHp(mult), heat(n), gold(n), numbers(on); in the shop: shopBuy(id | 'capsule'), hog(id), tab(i); plus the shared
resetMeta, unlockAll, meta(patch), goto, juiceTest.
`__game.stats`: hp, level, enemies, kills, weapons, versions, passives, gold, goldSafe, heat, mode, hog, trait, elites,
chests, evolutions, bossKills, wave, waveAt, waveMods, funding, releases, relics, powerups, tools, pu, bossAffixes,
dps, waves (per cleared wave: t, level, dps, boss fight s), dmg (per source). States add `actbreak`, `release`,
`cmdk` and `reveal`.
Screenshot tour of the ladder: `uv run -q --with playwright --with pillow python bug-survivors/tools/shots_waves.py`.
Balance runs: `uv run -q --with playwright python bug-survivors/tools/sim.py --n 6 --diff normal [--heat 3] [--novice]
[--cash N] [--hog id]` (prints the death wave and per-wave telemetry).

## Known limits
- Default art is generic; Flux sprites at 16px keep colour and silhouette but lose fine detail. Variant
  archetypes are told apart by tint, size and behaviour, which is weaker on very dark themed sprites.
- Hoggies are single illustrations animated in code; they don't walk-cycle.
- A late build with most tools evolved is visually very busy by design (the genre's endgame).
- Enemies don't collide with each other beyond a cheap per-cell separation; big swarms can overlap.
- `debug.goto('Title')` while already on the title leaves a black screen (shared); tools save + reload instead.
