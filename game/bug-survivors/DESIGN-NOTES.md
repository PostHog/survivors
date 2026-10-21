# Bug Survivors: overnight design notes

North star: the Vampire Survivors "one more run" pull. The first run (heat 0, RUN, default hero) must
still be a ~4 minute win for a novice on easy/normal; depth comes from later runs.

## Code layout (after the restructure)
- `src/content.ts`: every data table (weapons + evolutions, passives, enemy archetypes, elites, events,
  heat, shop, heroes, achievements). Adding content = adding a row.
- `src/game.ts`: the GameScene (loop, player, enemies, pickups, boss, HUD).
- `src/weapons.ts`: one function per weapon (base + evolved form), called by the scene.
- `src/cards.ts`: level-up choice weighting and the autopilot's card ranking.
- `src/save.ts`: kit save data on top of `meta.kitData` (shop levels, hero, totals, daily best, codex).
- `src/shop.ts`: SHOP / HEROES / CODEX screen reached from the title menu.
- `src/main.ts`: kit definition: title menu, end summary, achievements.

## M1 juice
What: hitstop on elite/boss kills and crit kills of big bugs, knockback (kept), white flash (kept),
merged damage numbers (per-bug 0.25 s accumulation + a global budget, N toggles, saved), gem vacuum with
a rising "whoop", level-up fanfare (ring burst + 0.4 s slow-mo before the cards), boss arrival/death
shake + hitstop, a death pop in each bug's own sprite colours (sampled from the texture at start, so
themed Flux sprites pop in their own colours). Why: every hit should be felt, and the chaos should read
as "I did this". Interaction: the step is skipped while `hitstopped(this)`; `debug.speed(n)` calls
`setJuiceSpeed(n)` so bots aren't slowed; slow-mo runs on sim time so it shrinks at bot speed.

## M2 enemy archetypes + elites
Theme enemies stay 3 (names, pain text, sprites). Each theme enemy drives two behaviours:
| theme enemy | base | variant (tinted) |
|---|---|---|
| 1 (fast swarmer) | swarmer | exploder: fuse when close, area blast; kill it at range |
| 2 (sturdy mid) | splitter: splits in two minis | charger: telegraphed dash (flash + line) |
| 3 (slow tank) | tank: slow, armoured (60% damage), heavy | spitter: keeps distance, slow shots |
Variants get a one-time "NEW TRICK" banner with a kit line that tells a novice what to do.
Elites: 1.6x size, 8x HP, tinted by modifier (fast / shielded / regenerating), drop a chest.
Timeline (heat 0): swarmers first, splitters from 0:30, exploders 1:00, chargers + tanks 1:40,
spitters 2:30. Elites at 1:30 and 2:30, elite pack at 3:00.

## M3 evolutions + passives
Weapon at level 5 + its partner passive (any level) evolves when you open a chest (elite or boss).
| weapon | partner passive | evolution |
|---|---|---|
| Experiments | Pair Programming | Multivariate Barrage |
| Error Tracking | Rubber Duck | Stack Trace Storm |
| Session Replay | Autocapture | Rage Click Vortex |
| Feature Flags | Hot Reload | Kill Switch Grid |
| Product Analytics | Big Monitor | Funnel Quake |
| Surveys | Code Review | NPS Blizzard |
Passives (11): Hedgehog Sprint (speed), Autocapture (magnet), Snack Break (max HP), Hot Reload (cooldown),
Code Review (armour), Big Monitor (area), Pair Programming (+projectiles), Rubber Duck (crit),
Docs Day (XP), Lucky Commit (luck), Rollback (revive, max 1). Max 6 passives held: a real choice.
Cards show "EVOLVES WITH X" hints.

## M4 level-up choices
Reroll (R), Skip (X, +gold), Banish (B: removes that card for the run) 1 each per run, more from the
shop. Weighted pool: owned items and evolution partners are favoured, new weapons stay likely early.

## M5 pickups + events
Food (heal), vacuum magnet (all gems fly in), hotfix bomb (clears the screen, boss takes a chip),
gold coins (banked for the shop). 1:00 ring encirclement, 2:00 stampede across the screen (with
warning arrows), 3:00 elite pack.

## P1
Heat 0-5 (title HEAT row, stacking): 1 more bugs, 2 faster bugs, 3 elites early, 4 less healing,
5 boss rage phase + 45 s overtime after the boss. Gold x(1 + 0.25 heat).
Title mode row: RUN, DAILY, ENDLESS (after first win), SHOP. Enter = RUN heat 0.
Shop: might, max HP, speed, magnet, reroll, luck, skip/banish, rollback. Heroes: 4 hog variants
(tint + hat), unlocked by achievements. Endless: boss every 2:00 after the first, stronger; score =
time + kills. Daily: seeded weapon, spawns, drops, events, cards; best daily score on the title.

## Balance log
(filled in as measured)

### 2026-09-27 ~22:40, after P0 (bot = autopilot at speed 6, `tools/sim.py`, 4 runs each)
Before tonight: bot won easy at 227 s, level 22, 766 kills; KIT.md said it usually died near the boss on normal.
| config | wins | avg game s | avg level | kills | gold | evolved runs |
|---|---|---|---|---|---|---|
| easy h0 | 4/4 | 242 | 22.5 | 1153 | 103 | 4/4 |
| normal h0 | 4/4 | 226 | 23.8 | 1588 | 62 | 3/4 |
| hard h0 | 1/4 | 154 | 17 | 932 | 29 | 1/4 |
First heat pass (spawn x1.3, speed x1.15, early elites, half regen): normal h1 4/4, h3 2/2, h5 2/4: heat didn't bite
(more bugs = more XP = snowball). Added a per-heat pressure layer: +15% HP, +10% dmg, +12% spawns per level:
h3 0/4 and h5 0/4 (deaths at 70-130 s): too steep. Settled at +8% HP, +6% dmg, +6% spawns, speed x1.18, no regen at h4+:
| config | wins | avg game s | avg level | gold |
|---|---|---|---|---|
| normal h1 | 4/4 | 279 | 31.8 | 150 |
| normal h3 | 3/4 | 218 | 34 | 258 |
| normal h5 | 1/4 | 136 | 23 | 187 |
Runs are bimodal at high heat: die in the first two minutes, or snowball into 3-4 evolutions. That's the genre's shape;
the shop's might/HP levels exist to smooth the early phase.
Boss HP 950 -> 1250 base so the fight lasts ~15-30 s for the bot instead of ~5 s.
Perf: `flood(300)` twice with every weapon evolved, the fusion, and 6 passives at level 5: 60 fps, ~90 projectiles.

### ~23:10: first-run approachability + endless
Added `autopilot(true, 'novice')`: always takes the first card, never rerolls, ignores chests and food.
Novice easy h0 first pass: 4/4 wins but runs of 245-499 s: boss HP scaled with level (1 + lv/20) and a kiting
bot with short-range weapons never engaged the slow boss. Fix: boss HP 1100 x (1 + min(lv, 25)/25); boss gets angry
after 50 s (not only at 50% HP) and moves 1.5x when angry; the autopilot only keeps the boss at 160 px when hurt.
| config | wins | game s (each run) |
|---|---|---|
| easy h0 novice | 4/4 | 228, 242, 232, 241 |
| normal h0 smart | 4/4 | 227, 221, 260, 247 (4/4 evolved) |
| normal h0 novice (before the boss fix) | 3/4 | 234 (lose), 277, 300, 365 |
Endless: bugs toughen 1 + t/150 + (minutes past 5:00)^2, +8%/min speed (max x1.8), +25%/min damage; boss HP x2 per
return. The smart bot still survives 15:00 at normal (level ~90, 3-5 bosses); pressure is visibly building by 12:00.
Human players will die well before that; left as is.

## P2 arena hazards
Crates (fixed kit art) appear every 22 s from 0:20, 110-180 px away, max 3. Any weapon breaks them: 40% food
(halved at heat 4+), 12% vacuum magnet, 6% hotfix, else 3 coins. They're the reliable "floor food" source.
Tech-debt puddles: every 30 s from 1:15, 120-200 px away, max 4. They grow over 15 s to 34 px (+3 per heat),
last 45 s, and slow the hog to 55% while it stands in them. Bugs ignore them. The autopilot steers around them.

### ~23:55: shop vs skill
Normal h5 with might 3, HP 3, luck 2, reroll 1 (~545 gold, ~5 runs): 4/4 wins, ~600 gold per run. The shop
was replacing skill and paying for itself. Changes: heat gold bonus +25% -> +10% per level; Sprinter unlock
500 -> 2000 lifetime kills (a heat-0 win is ~1100 kills, so 500 unlocked it, and the Wizard, in run one).
After: normal h3 (no shop) 3/4 wins, 107 gold avg. Normal h5 with might 2 + HP 2 (~165 gold): 1/4 wins
(deaths at 74, 120, 187 s; the win snowballed to level 55 and 4 evolutions). Full shop ~2900 gold = ~15-25 runs.

### ~00:30: prospect themes with 3-4 products (Nimbus Grocer: Error Tracking start, no Flags/Analytics)
Added `stats.hurtBy` (damage taken by source) to find what kills runs. Nimbus normal, novice bot: early deaths at
118-153 s with very few kills. Error Tracking as a *starting* weapon killed ~1 bug per 1.15 s, about half the default
Experiments start, while spawns reach ~3/s by 1:00. Buff: cooldown 1.3-0.15L -> 1.05-0.1L, pierce 2 from level 1.
Some boss fights ran 100-260 s for weak builds. Added "IS CRUMBLING": from 70 s the boss takes +4%/s more damage
(max x4), with a banner.
| Nimbus theme | wins | game s |
|---|---|---|
| normal novice, before | 2/4 | 125 (lose), 128 (lose), 248, 385 |
| normal novice, after both fixes | 5/6 | 186 (lose), 230, 226, 271, 302, 318 |
| easy novice, after | 6/6 | 219-272 |

### ~00:50: every starting weapon (default theme with starting_product swapped; novice bot, normal, n=4)
| start | wins | game s |
|---|---|---|
| session_replay | 2/4 | 158 (L), 187 (L), 277, 393 |
| feature_flags | 4/4 | 219-279 |
| product_analytics | 4/4 | 225-263 |
| surveys | 4/4 | 272-331 |
| experiments | 4/4 | 353-409 (long boss fights) |
Changes: Session Replay gets 2+L orbs (3 at level 1), hit every 0.3 s. Boss base HP 1100 -> 900; crumbling starts at 50 s.
After: session_replay 3/4 (221-238 s wins). Experiments normal novice, n=8: 7/8 (219-295 s). Default easy novice, n=8:
8/8 (222-303 s).

### ~01:20: heat curve after the start-weapon buffs
Flat pressure (+10% HP, +8% dmg, +8% spawns per level): h1 6/6, h3 6/6, h5 1/6 with deaths at 50-60 s. A cliff:
it crushed the opening and did little once the build snowballed. Now the HP and spawn pressure ramps in over 2:30
(up to +15% HP, +10% spawns per level, x1.5 by 3:45); damage stays a flat +8%/level. The elite pack is always the
3:00 event (heat/daily runs only swap ring and stampede), since a 1:00 pack was a coin-flip death.
Smart bot, normal, no shop (n=6-8, lots of noise: run-to-run variance dominates at n<10):
| heat | wins | game s (sorted, l = loss) |
|---|---|---|
| 2 | 5/6 | 131 l, 218-262 w (before the pack change) |
| 3 | 5/8 | 74 l, 113 l, 204 l, 217-246 w |
| 5 | 3/8 | 83-128 l (5), 265-283 w |

### ~01:45: fixes from a read-only code review (subagent)
- A won run could still end in GAME OVER: during the 1.6 s win delay, boss shots and fresh spawns could land.
  Now `hurt` ignores hits once won, spawning stops, and hostile shots are cleared.
- Two chests picked up in one frame left a stuck modal overlay. Now one chest opens at a time.
- A dying splitter was pooled before its loot dropped, so its own mini reused the object: wrong XP, no Stack
  Trace chains off splitters. Now the dead bug is pooled last.
- `offscreenPoint` put ~37% of spawns inside the view, and could spawn next to the hog at a wall. Now spawns land on
  the view's edge, mirrored when that side is past the wall.
- Snack Break healed 40 instead of 20. Grid cells are reused (no per-step allocation). Homing retargets are
  throttled to every 0.15 s. The death tint no longer gets cleared.
Crumbling boss also speeds up toward the hog's pace (x3.2 max), so kiting can't stall a fight (3-product novice runs
had a 529 s outlier). Crumble cap x4 -> x8.
3-product theme (Surveys/Flags/Analytics), novice, normal, n=8: 6/8 wins, 224-329 s.

### ~01:25: crash caught by the sims
After the review fixes, 7/24 sim runs "timed out" with game time frozen right after the boss. It was a page error:
`winNow()` spliced hostile shots out of `projs` while `moveProjectiles` was iterating it (a player shot killed the
boss). Gate 1 missed it because its single bot run happened not to hit it. Fix: expire the shots (life 0) instead of
splicing, plus a guard in the loop. `tools/sim.py` now prints STUCK with the live state for any run that doesn't end.
Re-measured, n=8 each, 0 page errors:
| config | wins | game s |
|---|---|---|
| easy h0 novice | 8/8 | 222-282 |
| normal h0 novice | 7/8 | 157 (L), 221-307 |
| normal h0 smart | 8/8 | 216-256 |

### ~02:05: second read-only review pass
No crash reachable in normal play. Fixed: the shop no longer re-exposes the dead game's debug hooks (`debug.win()` from
the shop threw); `winNow` runs once and `debug.lose` can't undo a win; no level-up modal on the victory beat; no bugs
spawn after the win; Meltdown (heat 5) isn't awarded in endless (no overtime there); quitting from pause banks the
gold picked up (the run isn't recorded); the shop hand-off listener is module-scoped so `off()` works; invalid banish
gives feedback; daily how-to text no longer promises identical drops (shop luck still differs between players).
Checks after: easy novice n=8 8/8 (223-291 s), normal h5 n=4 2/4, 0 page errors; Gate 1 PASS.

## 2026-09-28: Act 2 (more after the boss)
Ask: "more after the current boss", new abilities from other PostHog products and tools, new powerups including a
self-driving mode. What: the 3:30 boss is now ACT 1 CLEAR with CONTINUE / CASH OUT, a free PostHog Toolbox pick, a
3:00 Act 2 and a final "<boss> 2.0" with a Rollout attack. Five kit-fixed tools (Web Analytics, Heatmaps, PostHog AI,
Data Warehouse, Workflows; two evolve with the free passives Hedgehog Sprint and Docs Day) and four powerups
(Self-Driving Mode, Feature Freeze, Ship It, Rewind). Act 1 is untouched through the boss. Details in KIT.md.
Why CASH OUT: prospects who want the 4-minute version still get it, and "keep going?" is the one-more-run pull
inside a run. Why tools are kit-fixed: the theme contract stays unchanged, so every existing prospect theme
gets Act 2 on reassembly.
Fixes found on the way: the boss dash telegraph was drawn during the step and cleared by draw() before it showed
(now drawn in draw()); the Act 1 boss respawned during the act break (nextBossAt is parked until Act 2 starts).
Sprites: CC0 bases (Kenney 1-Bit flame, snowflake, rocket, wheel silhouettes) + hand grids, 3-tone ramps, outlines
(tools/make_act2_sprites.py).

### Balance (tools/sim.py, speed 6, n=4-6; bot takes CONTINUE)
Act 1 first: same-load A/B of the committed build vs this one (normal, smart, n=15 each, Act 1 only): base 2 losses,
new 0. Act 1 boss still falls at 3:40-4:10 (act2@221-255 s).
First tuning (spawn x1.15, boss HP x2.2): every bot that reached Act 2 cleared it at full HP and the final boss died in
~13 s. Now: spawns x1.35, bug HP x1.3 ramping to x2.6, damage x1.3, final boss HP x7.
| config | reached Act 2 | full clears | run length (game s) |
|---|---|---|---|
| easy h0 novice | 10/10 | 10/10 | 417-530 |
| normal h0 smart | 5/6 | 5/5 | 413-478 (final boss 12-43 s) |
| normal h0 novice | 5/6 | 4/5 (one death 1:37 into Act 2) | 449-541 |
| normal h5 smart | 2/4 | 2/2 (overtime after the final boss) | 465-471 |
| endless normal | 2/2 | - (toolbox after boss 1; 4 bosses by 11:00) | - |
Powerups collected per run: Act 1 ~0-2, Act 2 ~2-8 (smart bot, which walks to them). Gate 1: PASS (bot win at 419 s).

## 2026-09-28: the wave ladder, hoggies, crests
Ask: more than 2 waves with enemies that keep scaling; bosses as markers between waves, not the end; player power
that keeps pace so it stays hard but possible; lots more PostHog (abilities, powerups, lore), data pipelines, something
unhinged; hoggies (brand.posthog.com) as the player characters, unlocked as you play; crests as the achievements.
Plan and decisions: PLAN-WAVES.md. What shipped: KIT.md.

Why each piece:
- **Waves as data, bosses as releases.** Act 1/Act 2 were hard-coded; the ladder is `wave` + tables. The theme has one
  boss, so later bosses are "<boss> N.0" with kit affixes; the theme contract is unchanged, so every prospect build
  gets the ladder on reassembly.
- **Open-ended power.** Weapons capped at LV 5 and passives capped, so a finished build drew heal/gold filler and a
  long run flatlined. Patches (x1.12 compounding per card), v2.0 majors, releases and funding rounds keep every card
  meaningful. Percentage effects (HogQL execute, Batch Export shares, Scouts' +40%) scale with any wave.
- **Push-your-luck gold** makes CASH OUT a real decision after every boss.
- **Hoggies at 32 px.** A downscale test (overnight-shots/hoggie-scale-test.png) showed the illustrations read well next to
  16 px bugs with a hard alpha edge and a 1 px outline; single poses are animated in code (bob, squash, tilt).
- **Crest minis as icons.** The 115 px crest badges stay legible at 16 px, so tools, value passives, releases and
  powerups use them instead of new pixel icons (crests16.png).

Bugs caught on the way: `sys` on the scene shadowed Phaser's own `Scene.sys` (renamed `xs`); the NEW HOGGIES reveal
blocked the end screen long enough to fail Gate 1's fuzz step (5 s auto-close, debug.lose skips it); a read-only review
agent found 12 more (the Reaper was swept up by the post-boss field clear and unlocked Angel for free; Angel's revive
never worked; the Race Condition enrage could hit a recycled bug; instant-kill effects hit the boss's fork; the Security
crest survived a revive; the frame kept running after death; bugs spawned during the field clear; the SHIPPED screen over
the pause panel; the YouTube crest during the interlude; the drive-by hit marker never cleared). All fixed.

### Balance (tools/sim.py, speed 8, n=6-16; bot plays the ladder until death unless --cash)
Wave 1 must stay the old first run. Same-load A/B vs the committed build, novice bot, normal, wave 1 only: new 12/16,
base 13/16 (and a god-mode probe of kills/level/damage at 30-180 s matched within noise). One regression found and fixed:
the five handbook-value passives diluted a novice's wave 1 card pool (4/8 wins); they now join from wave 2.
Smart wave 1: 7/8; easy novice wave 1: 8/8.
First ladder pass (bug HP x1.6 per wave): the bots never got hurt; player DPS grew ~x2-3 per wave (new tools, patches,
funding). Logs did 5-10x any other weapon (screen-wide lines hitting every bug each pass): nerfed lines, rate and damage.
Then HP x2.1: deaths all piled up at wave 8 regardless of skill. The damage logs showed why: nothing melee ever reaches a
late build; deaths come from spitter shots and bosses. HP growth isn't the binding constraint, damage is. Now: HP x2.35
per wave (x2.7 from 9), bug damage x1.3 per wave, speed +5%, a softer ice floor, waves 3+ at 2:30.
Boss sizing from the build's DPS (last 20 s): a flat share gave 7-100 s fights, because early bosses take most of the
build's damage and later affixes (plates, blinking, forks) soak it. Focus 0.35 / (1 + 0.35 x (version - 3)): fights now
~55-70 s at wave 2 and ~45-65 s after.
| config | death waves (n=6) | notes |
|---|---|---|
| normal h0 smart | 5, 5, 7, 8, 9, 11 | ~18-40 min runs; deaths: spitter shots, bosses, nests, Hogzilla |
| normal h0 novice | 1, 1, 3, 5, 5, 6 | median 5 |
| easy h0 novice | 8, 8, 9, 9, 10, 11 -> 5, 5, 6, 7, 8, 9 | easy's damage/HP discounts now fade to normal from wave 3 to 6 |
| normal h5 smart, wave 1 only | 5/8 clear (base build 2/8, same load) | heat 5 stays the hard mode |
| YOLO normal smart | 8, 8 | 90 s waves, ~19 min |
Exponential scaling squeezes every config into a few waves of each other, so difficulty and heat mostly shift the
start; the spread between bots comes from dodging (spitters, bosses, the drive-by). A human novice gets hit far more
than the novice bot, so real first ladders should end around waves 3-5.
