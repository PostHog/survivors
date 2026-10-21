# Bug Survivors: the complete guide

Everything in the game, with the real numbers. It's written from the source code (`src/content.ts`, `game.ts`,
`weapons.ts`, `tools.ts`, `systems.ts`, `cards.ts`, `hoggies.ts`, `crests.ts`), so where this guide and a card's text
disagree, the guide is right.

A few notes on reading it:

- **L** means a weapon's level (1 to 5). "L5" means level 5.
- Damage numbers are **base** damage. Everything you hit with is then multiplied by your damage bonus (funding rounds,
  passives, merch...), patches, crits, and the bug's armour. See [How damage works](#how-damage-works).
- **Cooldowns** get shorter with Hot Reload, Ship It! and the rest. Area grows with Big Monitor. "+amount" means
  extra projectiles (Pair Programming, Rollout 100%...).
- The bug names, the boss name and the arena come from the **theme**. This guide uses the default theme's names (Flaky
  Test, Silent Error, Scope Creep, Legacy Monolith). A prospect's game has their own names for the same bugs.
- A prospect's theme picks which of the six PostHog **products** the game has. The default theme has all six. The 15
  PostHog **tools** are always in every game.

---

## Contents

1. [The 60-second version](#the-60-second-version)
2. [Controls](#controls)
3. [How a run works](#how-a-run-works)
4. [Your stats](#your-stats)
5. [Leveling up](#leveling-up)
6. [Weapons: the six products](#weapons-the-six-products)
7. [Weapons: the 15 PostHog tools](#weapons-the-15-posthog-tools)
8. [Evolutions, patches, v2.0 and fusion](#evolutions-patches-v20-and-fusion)
9. [Passives](#passives)
10. [Chests](#chests)
11. [Bugs (enemies)](#bugs-enemies)
12. [Elites](#elites)
13. [Events](#events)
14. [The boss](#the-boss)
15. [The wave ladder](#the-wave-ladder)
16. [Releases](#releases)
17. [Powerups](#powerups)
18. [Pickups and the arena](#pickups-and-the-arena)
19. [Gold, risk and cashing out](#gold-risk-and-cashing-out)
20. [Score](#score)
21. [Heat](#heat)
22. [Difficulty](#difficulty)
23. [YOLO mode](#yolo-mode)
24. [Hoggies (characters)](#hoggies-characters)
25. [Crests (achievements)](#crests-achievements)
26. [The merch store](#the-merch-store)
27. [Merch relics and handbook pages](#merch-relics-and-handbook-pages)
28. [The unhinged set pieces](#the-unhinged-set-pieces)
29. [Leaderboards](#leaderboards)
30. [How damage works](#how-damage-works)
31. [Tips and builds](#tips-and-builds)
32. [Quick reference](#quick-reference)

---

## The 60-second version

You're a PostHog hedgehog ("hoggie") in an arena. Bugs pour in from every side. **You only move.** Your weapons fire
on their own, and every weapon is a PostHog product. Squashed bugs drop XP gems. Each level offers 3 cards: a new
weapon, a weapon upgrade, or a passive.

At **3:30** the boss arrives. Beat it and wave 1 is clear. Then you choose: **CASH OUT** (bank all your gold and end
the run as a win) or **CONTINUE** up the **wave ladder**: harder waves, a new boss version every wave ("Legacy Monolith
2.0", "3.0"...), and a free **Release** pick after each one. The run ends when you die or cash out.

The big power spikes:
- **Evolution:** a weapon at L5 + its partner passive + opening a chest = a much stronger evolved weapon.
- **Funding rounds:** every boss you beat gives +15% damage (compounding) and +10 max HP.
- **Releases and tools:** run-changing perks and 15 extra weapons, offered after each boss.

---

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move | WASD or arrow keys | Drag anywhere: a joystick appears where your finger lands (small drags walk slowly) |
| Pick a card | 1 / 2 / 3, or arrows + Enter, or double-click | Tap a card to select it, tap it again to pick |
| Reroll / Skip / Banish | R / X / B | The REROLL, SKIP, BANISH buttons |
| Pause | Esc or P | The pause button left of the clock |
| Quit from pause | Q | QUIT |
| Damage numbers on/off | N | NUMBERS in the pause menu |
| Close a chest | Enter / Space | Tap |

Nothing is selected when the cards appear, so a stray tap can't pick one. On phones the game plays in landscape
and asks you to turn sideways.

---

## How a run works

### Wave 1 (the original run)
The first run is built to be a ~4 minute win, even for a newcomer on easy or normal.

| Time | What happens |
|---|---|
| 0:00 | Swarmers (bug 1) only |
| 0:20 | First breakable crate (then one every 22 s, max 3) |
| 0:30 | Splitters (bug 2) join |
| 1:00 | Exploders join. **Event: SURROUNDED!** (a ring of 24 swarmers) |
| 1:15 | First tech-debt puddle (then one every 30 s) |
| 1:30 | Lone elite (with a chest) |
| 1:40 | Chargers and tanks join |
| 2:00 | **Event: STAMPEDE!** (3 herds of runners cross the screen) |
| 2:30 | Spitters join. Lone elite |
| 3:00 | **Event: ELITE PACK!** (3 elites + 8 swarmers) |
| 3:30 | **The boss** |

On heat 1+ the ring and the stampede can swap places; the elite pack is always last. On heat 3+ lone elites come at
0:45, 1:25, 2:05 and 2:45 instead.

### Spawning
Bugs spawn just off screen. The rate starts at 1.1 per second and grows by 0.034 per second for every second of the run
(capped at 7 minutes), so about 8 per second by 3:30. It halves while a boss is fighting (until it gets angry).
There can be at most 320 bugs at once. Past that, extra spawns are dropped and the later scaling turns into HP instead.

### After the boss
The field clears and the remaining XP flies to you. Then the **SHIPPED** screen:
- **CONTINUE** (the default): a funding round (+15% damage, +10 max HP), this wave's gold becomes safe, then **SHIP A
  RELEASE** (pick 1 of 3, free), then the next wave starts at full HP with the boss's big chest a few steps away.
- **CASH OUT:** the run ends as a win. You bank all your gold plus a bonus (wave 2+).

---

## Your stats

Every hoggie starts from the same base. Passives, hoggie traits, merch, relics and releases change it.

| Stat | Base | Notes |
|---|---|---|
| Max HP | 100 | +10 per funding round |
| Move speed | 80 px/s | |
| Damage (might) | x1 | Multiplies all your damage |
| Crit chance | 5% | Capped at 85% |
| Crit damage | x2 | x3 with Source Maps |
| Armour | 0% | Fraction of incoming damage ignored. Capped at 70% |
| Cooldown | x1 | Lower is faster. Floor x0.3 |
| Area | x1 | Weapon size |
| Amount | +0 | Extra projectiles, orbs, flags... |
| Pickup range | 48 px | Gems and coins inside this fly to you. Bonuses stack up to 120 px at most |
| XP (growth) | x1 | |
| Luck | x1 | Better drops and chests |
| Gold | x1 | Coin value |
| Powerup duration | x1 | |
| Regen | 0 HP/s | Plus the difficulty's base regen |
| Revives | 0 | Rollback, Terminator, Angel, the plushie... |

**Getting hit:** after a hit you're invulnerable for 0.55 s. **One hit can take at most 35% of your max HP** (after
armour), so nothing one-shots you from full. The Hogzilla drive-by is the only exception.

---

## Leveling up

### The XP curve
You start needing 5 XP. After that, level L needs `3 + 2.2L + L^1.3` XP (and from level 40 it steepens sharply).

| Level | XP to next | Level | XP to next |
|---|---|---|---|
| 1 | 6 | 25 | 123 |
| 5 | 22 | 30 | 152 |
| 10 | 44 | 40 | 211 |
| 15 | 69 | 50 | 337 |
| 20 | 96 | 100 | 2,208 |

A level-up plays a short slow-motion beat, then the cards. Several levels in a row queue up.

### The cards
Each level shows 3 cards, drawn by weight from:
- **New weapons:** likely while you own fewer than 3, less likely after that (and rarer still past 8).
- **Upgrades to weapons you own:** the most likely cards. Even more likely when you already hold that weapon's
  evolution partner.
- **Patches:** a weapon already at L5 keeps coming back as a patch (v1.1, v1.2...). See
  [patches](#patches-v11-v12).
- **Passives:** new ones (only while you have a free slot) and upgrades. A passive that would evolve a weapon you own
  gets a big weight boost. Maxed passives also come back as half-level patches.
- The five "handbook value" passives (You're the Driver, Make It Public, Do More Weird, Why Not Now?, Optimistic by
  Default) only show up from wave 2.
- The 15 tools only show up after your first boss.

Cards say **EVOLVES WITH X** when they'd complete an evolution. When nothing is left to offer, you get filler cards: a
snack (+30 HP) or +10 gold.

### Reroll, Skip, Banish
You get **one of each per run**. Merch adds more.
- **Reroll (R):** a fresh hand of 3.
- **Skip (X):** take no card, get +3 gold.
- **Banish (B):** select a card, then banish it. That weapon or passive never shows up again this run, and you get a
  fresh hand.

### Slots
- **Passives:** 6 slots, 8 from wave 3 ("headcount approved").
- **Weapons:** no hard cap. New-weapon cards just get rarer the more you hold. (Small Teams rewards holding fewer than 6.)

---

## Weapons: the six products

Every weapon has levels 1-5, an evolved form, patches and a v2.0. Which products appear depends on the theme. Your
**starting weapon** is the theme's starting product (Experiments by default) unless your hoggie brings its own.

### Experiments
*A/B test with real statistics.* Fires straight shots **forward and backward** at once (the way you face, and
behind you), in a small fan.

| | |
|---|---|
| Shots per side | 1 + floor(L/2), + amount |
| Damage | 9 + 3L |
| Cooldown | 0.95 - 0.08L s |
| Pierce | 1 bug (2 from L4) |
| **Evolution** | **Multivariate Barrage** (partner: **Pair Programming**) |
| Evolved | Every 0.45 s, a rotating burst in **8 directions**, 1-3 shots each (more with amount). 30 damage, pierces 3 |

*Tip:* the base version only shoots along your facing line, so keep moving across the swarm, not straight away from it.

### Error Tracking
*Catch exceptions and see who they hit.* Homing traces that seek the nearest bug.

| | |
|---|---|
| Traces | 1 (2 at L5), + amount, fanned out |
| Damage | 16 + 6L |
| Cooldown | 1.05 - 0.1L s |
| Range | 260 px |
| Pierce | 2 (3 from L3) |
| **Evolution** | **Stack Trace Storm** (partner: **Rubber Duck**) |
| Evolved | 3 traces + amount every 0.6 s, 42 damage, range 320. **Every kill spawns a new trace** from the body that hunts the next bug (chains twice) |

### Session Replay
*Watch real users hit the bug.* Orbs that circle you and knock bugs back.

| | |
|---|---|
| Orbs | min(5, 2 + L), + amount (3 at L1) |
| Damage | 7 + 3L, each orb can hit the same bug every 0.3 s |
| Orbit radius | 26 + 4L px (x area) |
| **Evolution** | **Rage Click Vortex** (partner: **Autocapture**) |
| Evolved | 6 bigger orbs + amount, the orbit **pulses** in and out (32-68 px), 28 damage every 0.22 s, heavy knockback, and **+60% pickup range** |

Session Replay is one half of the secret [Full Stack Nova](#full-stack-nova-the-secret-fusion).

### Feature Flags
*Ship safely, roll out to anyone.* Plants flags at your feet. Each flag zaps the nearest bug in range.

| | |
|---|---|
| Max flags | L + 1, + amount |
| New flag every | 2.4 - 0.3L s |
| Flag lasts | 4.5 s |
| Zap | 11 + 4L damage, range 72 px, every ~0.5 s (faster at higher L) |
| **Evolution** | **Kill Switch Grid** (partner: **Hot Reload**) |
| Evolved | Up to 6 + amount gold flags, a new one every 0.8 s, last 6 s. Each zap **chains through 3 bugs**, 32 damage, range 96 |

*Tip:* flags stay where you plant them. Walk in a loop around an area and you build a minefield.

### Product Analytics
*Funnels, trends and retention for every event.* A shockwave ring that expands out from you. Only the ring's edge
hurts, and it shoves bugs back.

| | |
|---|---|
| Pulse every | 3.2 - 0.35L s |
| Radius | 60 + 10L px (x area) |
| Damage | 13 + 5L, knockback 140 |
| **Evolution** | **Funnel Quake** (partner: **Big Monitor**) |
| Evolved | **Two** rings every 1.5 s, radius 125, 44 damage, huge knockback (260) |

### Surveys
*Ask users what they think, in-app.* An aura around you that slows and damages every bug inside.

| | |
|---|---|
| Radius | 40 + 8L px (x area) |
| Slow | bugs move at 60% - 5% per level (35% at L5) |
| Damage | 2 + 2L every 0.5 s (no crits) |
| **Evolution** | **NPS Blizzard** (partner: **Code Review**) |
| Evolved | Radius 88, bugs move at 30%, 12 damage every 0.3 s, snow |

*Tip:* the slow is the real value. Surveys makes chargers and swarms manageable for every other weapon.

---

## Weapons: the 15 PostHog tools

Tools are fixed in every game (never themed). They're offered **from the first Release screen onward** (after the
wave 1 boss), then in normal level-up cards too. Through wave 5, every Release screen offers at least one new tool.

### Web Analytics: Traffic Beam
Rotating beams of pageviews sweep around you.

| | |
|---|---|
| Beams | 1 (2 from L4), + amount, max 4 |
| Length | 70 + 10L px |
| Damage | 6 + 3L per bug, at most every 0.35 s |
| Spin | faster with level and with cooldown boosts |
| **Evolution** | **Realtime Dashboard** (partner: **Autocapture**): 6-8 beams spinning into a star, 110 px long, 30 damage |

### Heatmaps: Heat Trail
Everywhere you walk gets hot. Bugs standing on hot tiles burn.

| | |
|---|---|
| Tile radius | 8 + 1.5L px |
| Tile lasts | 2 + 0.3L s |
| Damage | 4 + 2.5L every 0.3 s (no crits) |
| **Evolution** | **Heat Wave** (partner: **Hedgehog Sprint**): radius 16, tiles last 4 s, 15 damage, and bugs on them are **slowed** |

*Tip:* a kiting weapon. Lead the swarm in circles and they walk through your trail.

### PostHog AI: Max AI
A drone that floats by you and bolts **the bug with the most HP** in range (the boss, if it's close).

| | |
|---|---|
| Bolts | 1 (2 from L3, 3 at L5), + up to 2 amount, homing |
| Damage | 14 + 5L |
| Cooldown | 1.25 - 0.12L s |
| Range | 240 px |
| **Evolution** | **Deep Research** (partner: **Docs Day**): 3 bolts every 0.45 s, 36 damage, pierce 2, each **jumps** to a new bug on a kill |

### Data Warehouse: Warehouse Vault
Heavy data drums orbit you at a wide radius and slam bugs away.

| | |
|---|---|
| Drums | min(4, 1 + floor(L/2) + amount) |
| Radius | 56 + 4L px |
| Damage | 20 + 8L, each drum hits a bug at most every 0.7 s, huge knockback |
| **Evolution** | **Managed Warehouse** (partner: **Snack Break**): 70 damage, and every hit **shatters** into 3 shards (18 damage each) that fly on |

### Workflows: Automation
A zap that hops from bug to bug.

| | |
|---|---|
| Hops | 2 + L, + amount |
| Damage | 12 + 5L per hop |
| Cooldown | 1.7 - 0.15L s |
| Reach | starts within 150 px, each hop reaches 90 px |
| **Evolution** | **Multi-Channel Blast** (partner: **Why Not Now?**): 8 hops + amount, 40 damage, and **every hop forks** a side zap (70% damage) |

### Data Pipelines: Pipeline
A once-a-minute screen event, and the rarest tool to be offered (30% of a normal tool's chance).

- The first run is 6 s after you pick it up, then **every 60 s**. Cooldown boosts don't change this.
- **Suck (1.4 s):** a cone in front of you (the way you face) vacuums in every small bug on screen, faster and faster.
  They die at the mouth. The cone's half-width is 0.6 + 0.12L radians (about 41° at L1, 69° at L5).
- **Blow (0.9 s):** the eaten bugs fire out the back as shots (up to 24, 40 damage each, pierce everything), and a blast
  ring sweeps the screen: **small bugs die, elites lose half their HP, bosses take 8%.**
- **You can't be hurt** for the whole run.
- **v2.0:** it sucks in elites too.
- **Evolution: Hog Transformations** (partner: **Optimistic by Default**): it sucks from **every side**, not only the cone.

### Batch Exports
Every hit from any weapon "tags" the bug with that damage. Every batch, the export deals a share of each bug's tagged
damage again, all at once.

| | |
|---|---|
| Batch every | max(5, 10.5 - 0.9L) s (cooldown helps, down to x0.6) |
| Export | 20% + 5% per level of the tagged damage (bosses take 35% of that) |
| **Evolution** | **Backfill** (partner: **Docs Day**): exports 45%, and every export **replays at half strength** 1 s later |

The pop-up shows how many "rows" (bugs) were exported. One export hitting 100 bugs earns the Batch Exports crest.

### Scouts: Scout Troop
Little drones wander around you and **flag** bugs. Flagged bugs take **+40% damage from everything** for 4 s.

| | |
|---|---|
| Scouts | 1 + L, + amount, max 8 |
| Each scout flags | the nearest unflagged bug within 90 px, every max(0.4, 1.3 - 0.12L) s |
| Flag hit | 6 + 2L damage |
| **v2.0** | flags last 8 s |
| **Evolution** | **Troop of 90** (partner: **Do More Weird**): +2 scouts, and **every 12 flags fire a PR laser**: a 340 px beam toward the farthest flagged bug, 90 damage to everything on the line |

*Tip:* Scouts makes every other weapon better. It's a multiplier, not a damage dealer.

### HogQL: `DELETE FROM bugs`
Every few seconds a query runs over every bug on screen and deletes the weak ones.

| | |
|---|---|
| Threshold | bugs below (5 + L)% HP die (6% at L1, 10% at L5) |
| Runs every | max(3.5, 6.5 - 0.5L) s |
| Bosses | take 0.8% of max HP per run |
| **v2.0** | each query runs twice (0.6 s apart) |
| **Evolution** | **Materialized View** (partner: **Make It Public**): threshold **15%**, every 3 s |

*Tip:* HogQL finishes off tanks and elites that other weapons have worn down, and it's great with Default to
Transparency.

### Logs: tail -f
Every so often **Hogzilla** tears across the screen through the thickest part of the swarm, running bugs over and
dropping log bombs along the road.

| | |
|---|---|
| Drive every | 15 - L s (14 to 10). Cooldown boosts don't change it |
| Bombs | one every 20 px of road, zig-zagging, each blows 0.35 s later |
| Bomb | radius 22 + 2L px, damage 24 + 9L |
| The car | runs over bugs for 1.5x the bomb damage |
| **v2.0** | bombs 50% bigger |
| **Evolution** | **Firehose** (partner: **Hot Reload**): **two** cars on crossing lanes every 10 s, 70 damage |

These Hogzillas are yours: they never hurt you (unlike the drive-by event).

### Replay Vision: Vision Scanner
Scanner eyes drop where you stand, sweep a cone, and zap what they see. They also **reveal Heisenbugs**.

| | |
|---|---|
| Max scanners | 1 + floor(L/2), + up to 1 amount |
| New scanner every | 3.2 - 0.25L s; each lasts 6 s |
| Cone | range 85 + 5L px, width grows with level |
| Zap | 12 + 5L damage every 0.4 s (0.2 s at v2.0) |
| **Evolution** | **Sees Everything** (partner: **Big Monitor**): 4 scanners, 120 px range, 30 damage, 8 s, in four kinds: **Monitor** zaps the nearest, **Scorer** zaps the toughest for double, **Classifier** slows the whole cone, **Summarizer** pulls the gems in its cone to you |

### AI Observability: Trace
A hit on the nearest bug spreads along a span tree to the bugs around it.

| | |
|---|---|
| Root hit | 18 + 6L, on the nearest bug within 200 px |
| Spread | each hit bug passes it to its 2 nearest neighbours within 70 px (+1 at v2.0, +1 with amount) |
| Depth | 2 levels (3 from L4); each level deals 75% of the one before |
| Cooldown | 1.7 - 0.15L s |
| **Evolution** | **Evaluations** (partner: **Rubber Duck**): one level deeper, 40 root damage, every 0.9 s, and a span that lands on a bug traced in the last 3 s is an **automatic crit** |

### Revenue Analytics: MRR Cannon
Gold cannonballs at the nearest bug. They **hit harder the more gold you've grabbed** this run.

| | |
|---|---|
| Cannonballs | 1 + up to 2 amount |
| Damage | (20 + 6L) x min(6, 1 + gold grabbed / 150) |
| Cooldown | 1.6 - 0.12L s, pierce 3 |
| **v2.0** | cannonballs explode (30 px, half damage) |
| **Evolution** | **Net Revenue Retention** (partner: **Lucky Commit**): damage also compounds **x1.25 per wave** past wave 1 |

"Gold grabbed" counts every coin you touch, even with Burning Money. So MRR Cannon and Burning Money work together.

### Endpoints: Endpoint Turret
Drops a turret at your feet that shoots the nearest bug.

| | |
|---|---|
| New turret every | 7 - 0.6L s (the oldest goes when you're at the max) |
| Max turrets | 1 (2 at v2.0) |
| Turret lasts | 9 s |
| Shots | 14 + 6L damage, range 200, every max(0.3, 0.9 - 0.08L) s |
| **Evolution** | **Edge Cache** (partner: **You're the Driver**): **3 turrets that never expire** (a new one every 4 s replaces the oldest), 34 damage, 30% faster |

### PostHog Desktop: Command Center
A ring of agent orbs around you. They take turns firing homing bolts.

| | |
|---|---|
| Agents | 2 + L, + amount, max 9 |
| Firing | one agent at a time round the ring; the whole ring fires once per 1.8 s (x cooldown) |
| Damage | 8 + 3L per bolt, homing |
| **v2.0** | fires twice as fast |
| **Evolution** | **Dopamine Mode** (partner: **Pair Programming**): all 9 agents, 22 damage, and **every 5 s all 9 fire a 3-bolt volley** |

Running 9 agents earns the PostHog Desktop crest.

---

## Evolutions, patches, v2.0 and fusion

### How to evolve
Three things:
1. The weapon at **level 5**.
2. Its **partner passive** at any level.
3. **Open a chest** (elites, the boss's big chest, Legacy Nests, Generous Free Tier...).

When 1 and 2 are true you get an **EVOLUTION READY!** banner: go find a chest. If several weapons are ready, one chest
evolves one of them, picked at random.

| Weapon | Partner passive | Evolution |
|---|---|---|
| Experiments | Pair Programming | Multivariate Barrage |
| Error Tracking | Rubber Duck | Stack Trace Storm |
| Session Replay | Autocapture | Rage Click Vortex |
| Feature Flags | Hot Reload | Kill Switch Grid |
| Product Analytics | Big Monitor | Funnel Quake |
| Surveys | Code Review | NPS Blizzard |
| Web Analytics | Autocapture | Realtime Dashboard |
| Heatmaps | Hedgehog Sprint | Heat Wave |
| PostHog AI | Docs Day | Deep Research |
| Data Warehouse | Snack Break | Managed Warehouse |
| Workflows | Why Not Now? | Multi-Channel Blast |
| Data Pipelines | Optimistic by Default | Hog Transformations |
| Batch Exports | Docs Day | Backfill |
| Scouts | Do More Weird | Troop of 90 |
| HogQL | Make It Public | Materialized View |
| Logs | Hot Reload | Firehose |
| Replay Vision | Big Monitor | Sees Everything |
| AI Observability | Rubber Duck | Evaluations |
| Revenue Analytics | Lucky Commit | Net Revenue Retention |
| Endpoints | You're the Driver | Edge Cache |
| PostHog Desktop | Pair Programming | Dopamine Mode |

Some passives are partners for several weapons: Autocapture, Hot Reload, Big Monitor, Docs Day, Rubber Duck and Pair
Programming each evolve two. Those are good picks.

### Versions
Each weapon shows a version number on its card, in the HUD and in the pause menu:
- **v0.1 - v0.5:** levels 1-5.
- **v0.5.1, v0.5.2...:** an L5 weapon still waiting on its evolution, patched.
- **v1.0:** evolved. **v1.1, v1.2...:** evolved and patched.
- **v2.0, v2.1...:** a major release, then patched.

### Patches (v1.1, v1.2...)
A maxed weapon's card doesn't disappear. Picking it again adds a **patch: x1.12 damage, compounding** (v1.5 = x1.76,
v1.10 = x3.1). Evolved weapons get offered as patches more often than ones still waiting for a chest. Patching a weapon to
v1.10 earns a crest.

### v2.0 major releases
After a boss, the Release screen can offer a **v2.0** for any evolved weapon. A v2.0 weapon gets:
- **x1.6 damage**
- **+1 amount** (one more projectile / orb / flag...)
- **15% faster**

Patches reset to 0 and start counting again (v2.1, v2.2...). On top of that, these tools get a real extra on v2.0:
Data Pipelines (sucks in elites), Scouts (8 s flags), HogQL (runs twice), Logs (bigger bombs), Replay Vision (zaps twice
as fast), AI Observability (wider tree), Revenue Analytics (exploding cannonballs), Endpoints (+1 turret) and PostHog
Desktop (fires twice as fast). For the other weapons the v2.0 card's line is flavour, and the general boost above is
what you get.

### Full Stack Nova (the secret fusion)
Evolve **both** Session Replay (Rage Click Vortex) and Error Tracking (Stack Trace Storm), then open **one more
chest**. Instead of a normal reward you get **FUSION!**: your replay orbs start firing homing stack traces too (one
per orb every 1.1 s, 40 damage, pierce 2). It earns a hidden crest that unlocks Dr. Manhattan.

---

## Passives

You hold up to **6 passives** (8 from wave 3). Most go to level 5. A maxed passive can keep coming back as a
**patch**: each patch counts as half a level.

| Passive | Per level | Max | Evolves |
|---|---|---|---|
| **Hedgehog Sprint** | +10% move speed | 5 | Heatmaps |
| **Autocapture** | +20% pickup range | 5 | Session Replay, Web Analytics |
| **Snack Break** | +20 max HP (and heals the 20) | 5 | Data Warehouse |
| **Hot Reload** | Weapons fire 8% faster (floor x0.45) | 5 | Feature Flags, Logs |
| **Code Review** | Take 8% less damage (armour) | 5 | Surveys |
| **Big Monitor** | +10% weapon area | 5 | Product Analytics, Replay Vision |
| **Pair Programming** | +1 projectile / orb / flag | 3 (no patches) | Experiments, PostHog Desktop |
| **Rubber Duck** | +6% crit chance | 5 | Error Tracking, AI Observability |
| **Docs Day** | +12% XP | 5 | PostHog AI, Batch Exports |
| **Lucky Commit** | +15% luck (more drops, better chests) | 5 | Revenue Analytics |
| **Rollback** | Revive once at half HP | 1 | - |
| **Data Moat** | A moat that blocks bugs and shots (below) | 5 | - |
| **Self-Healing** | Regen 0.8% of max HP per second | 5 | - |
| **You're the Driver** | +8% damage while moving | 5 | Endpoints |
| **Make It Public** | Bugs take +8% damage, armour or not | 5 | HogQL |
| **Do More Weird** | 3% chance per hit to make a random weapon fire right away | 5 | Scouts |
| **Why Not Now?** | Powerups last 20% longer | 5 | Workflows |
| **Optimistic by Default** | +6% damage while above half HP, and +0.3 HP/s regen | 5 | Data Pipelines |

The last five (the PostHog handbook values) only show up from wave 2.

### Rollback (revive)
When you'd die and have a revive, you come back at **half HP** (full HP for Angel), get 2 s of invulnerability, and a
shockwave knocks back and hits everything within 90 px for 60. Revives stack from several sources (Rollback, Terminator,
Angel, the max.hedgehog plushie).

### Data Moat
A ring of water around you, radius 30 + 3 per level.
- Small bugs that reach it are **shoved back out** and nicked (6 + 3 per level damage), at most once every 0.6 s per bug.
- It also **blocks enemy shots**.
- Each block costs water: 1 (2 for an elite). It holds 4 + 3 per level.
- After 1 s without blocking it refills (0.8 + 0.4 per level per second). A dry moat (dashed ring) lets everything
  through until it refills. Leveling it up fills it to the brim.
- Bosses, their forks and Nohog wade straight across.

---

## Chests

Chests drop from **elites** (always), **Legacy Nests** (35%), the boss (a big gold chest waiting for you at the start of
the next wave), **Generous Free Tier**, and every 1,000 kills with Free Tier. When you open one:

1. **If a weapon is ready to evolve,** it evolves (EVOLUTION!).
2. **Else, if Full Stack Nova is ready,** it fuses (FUSION!).
3. **Else** it levels up (or patches) **1-3 things you own:** 1 always, a 2nd with a 25% x luck chance, a 3rd with an
   8% x luck chance (always for a big chest). If nothing can level, it heals you to full.

Every chest also gives **gold:** 10-22 (40 for a big chest) x luck x heat bonus x (1 + 30% per wave past the first).

---

## Bugs (enemies)

The theme gives three bug names, pains and sprites. Each one drives several behaviours. Variants are **tinted** and get
a one-time **NEW TRICK** banner that tells you what to do. Bug stats below are wave 1, normal difficulty, heat 0.

| Bug | Based on | HP | Speed | Contact damage | XP | Behaviour |
|---|---|---|---|---|---|---|
| **Swarmer** | Bug 1 (Flaky Test) | 6 | 54 | 6 | 1 | Walks at you. The bulk of every swarm |
| **Splitter** | Bug 2 (Silent Error) | 16 | 38 | 10 | 2 | Splits into 2 minis when it dies |
| **Mini** | Bug 2, small | 5 | 60 | 5 | 1 | Splitter and nest spawn |
| **Tank** | Bug 3 (Scope Creep) | 55 | 25 | 14 | 5 | 25% bigger, takes only 60% damage, barely knocked back |
| **Exploder** (yellow) | Bug 1 | 9 | 60 | - | 2 | Within 30 px it lights a 0.8 s fuse, then blows up (36 px, 16 damage to you, 20 to nearby bugs). Pop them from range |
| **Charger** (red) | Bug 2 | 22 | 34 | 12 | 3 | Within 160 px it stops, flashes and draws a line (0.65 s), then dashes at 240 px/s for 0.5 s. Sidestep the line |
| **Spitter** (green) | Bug 3 | 26 | 30 | 9 | 4 | Keeps 100-150 px away and spits slow shots (9 damage) every 2.4-3.2 s within 230 px. It blinks white just before it fires. Close in |
| **Runner** | Bug 2 | 14 | 125 | 9 | 1 | Stampede herds. Run straight across the screen |
| **Crate** | (fixed art) | 10 | 0 | 0 | 0 | Breakable. Drops food, coins and pickups |

### Wave 3+ tricks
Each later wave introduces one new trick. After that it stays in the mix for good.

| Trick | From wave | Based on | HP | Speed | Damage | What it does |
|---|---|---|---|---|---|---|
| **Regression** (lilac) | 3 | Bug 2 | 20 | 40 | 11 | 30% chance it **comes back once**, 0.9 s after dying, at 60% HP ("IT'S BACK") |
| **Legacy Nest** (brown, big) | 4 | Bug 3 | 260 | 0 | 10 | A **stationary factory**: while you're within 420 px it spawns 2 minis every 2.6 s. Takes 80% damage, can't be pushed. Max 3 at once. 35% chance to drop a chest. **Break them** |
| **Flaky** (cyan) | 5 | Bug 1 | 10 | 58 | 7 | Half see-through, flickers, and **blinks a short hop** every 1.1-2 s |
| **Scope Creep** (orange) | 6 | Bug 2 | 26 | 36 | 10 | **Grows** the longer it lives: size, HP and damage up to x2.2 (about 15 s). Squash it early |
| **Heisenbug** (white) | 7 | Bug 3 | 30 | 34 | 12 | **Nearly invisible** unless it's within 75 px, scanned by Replay Vision, or you're a Noir / X-ray hoggie. An unseen Heisenbug **can't hurt you** |
| **Race Condition** (pink) | 8 | Bug 1 | 18 | 50 | 9 | Spawns as a **linked pair**. Kill one and the other has 2 s to die too, or it enrages: 2x speed, 1.5x damage ("RACE LOST") |

In waves 3+ the base six make up most spawns. Every trick met so far has a small share, and the current wave's own trick
has a big share.

---

## Elites

Elites are big versions of splitters, tanks or chargers with a **modifier**.
- **1.6x size, 9x HP, 1.4x damage, 5x XP.** Barely knocked back.
- A flashing gold pip over their head.
- On death: **a chest**, 4 coins, a chance at a powerup (15% in wave 1, 50% later, x luck) and, from wave 3, a 3% x luck
  chance of a merch relic.

| Modifier | Effect | From |
|---|---|---|
| **Fast** | 1.5x speed | wave 1 |
| **Shielded** | Takes only 45% damage (blue ring) | wave 1 |
| **Regenerating** | Heals 3% of max HP per second | wave 1 |
| **Memory Leak** | Drips a tech-debt puddle every 3 s | wave 3 |
| **Flaky** | Teleports 50 px every 3 s | wave 3 |
| **Swarming** | Spawns 3 minis every 3 s | wave 3 |
| **Dead Letter Queue** | Bursts into 5 swarmers when it dies | wave 3 |

From **wave 4** every elite has **two** modifiers (e.g. "Shielded + Swarming").

---

## Events

Each event opens with a banner.

| Event | What happens | How to play it |
|---|---|---|
| **SURROUNDED!** | A ring of 24 swarmers closes in from all sides | Pick a side and punch through early, before the ring tightens |
| **STAMPEDE!** | Flashing chevrons on one edge, then 3 herds of 10 runners cross the screen 0.9 s apart. **Each herd has a 2-runner gap** | Look for the gap, or get out of the lane |
| **ELITE PACK!** | 3 elites (splitter, tank, charger) around you + 8 swarmers | 3 chests: great for evolutions |
| **TRAFFIC SPIKE!** | A burst of 16 bugs, then **double spawns for 10 s** | Keep moving, collect the XP flood |
| **INCIDENT!** | 44 bugs pour in along a spiral round the screen edge over ~3 s | Keep moving: they come from every side |
| **HOGZILLA DRIVE-BY!** | A horn, a flashing yellow lane through your position, then a car flattens everything in it (and you, for 25% HP) | Get out of the lane. Seriously. See [set pieces](#the-unhinged-set-pieces) |

**Schedule**
- **Wave 1:** ring 1:00, stampede 2:00, elite pack 3:00. Elites at 1:30 and 2:30.
- **Wave 2:** spike 0:20, stampede 1:00, incident 1:40, elite pack 2:30. Elites at 0:15, 0:50, 1:25, 2:05.
- **Wave 3+:** spike ~0:17, stampede ~0:46, Hogzilla drive-by ~1:15, incident ~1:32, elite pack ~2:05. Elites at ~0:12,
  0:37, 1:07, 1:32, 1:57. (Times are into the wave.)

---

## The boss

The theme's boss (default: **Legacy Monolith**, "I have been in production since 2009!").

### Wave 1 boss
- **HP:** 900 x difficulty x (1 + your level/25, capped at x2) x (1 + 12% per heat). So about 1,800 if you're level 25.
- **Contact damage:** 20. It walks at you slowly.
- **Attacks** (a new one every ~2.5 s, never the same twice in a row):
  - **Ring:** 12 slow shots in a circle (18 when angry). Find a gap.
  - **Charge:** it flashes red and draws a line, then dashes along it. Step aside.
  - **Spiral:** two streams of shots spinning out for 1.6 s. Only at heat 2+, after your first boss kill, or when angry.
  - **Summon:** 6 swarmers and splitters. Only when angry.
- **Angry** at 50% HP, or after 50 s. Angry = faster attacks, 1.5x walking speed, summons, and normal spawns resume.
- **Crumbling:** a long fight wears it down. From 50 s it takes **+5% damage per second** (up to x8) and walks faster and
  faster so you can't just kite it forever.
- **Heat 5:** at 25% HP it **rages**: even faster attacks.

### Later bosses ("Legacy Monolith 2.0", "3.0"...)
- Its **HP is sized from your build's real damage per second** over the last 20 s, so the fight lasts about a minute
  on wave 2 and about 45 s after that, whatever your build. (There's a floor based on the wave.)
- From 2.0 it can also do **Rollout**: four lines blink out from it for 0.9 s, then go live for 0.45 s. Step off them.
- It **crumbles** from 40 s in, much faster (up to **x16** damage taken).
- Each version learns a **trick** (its affix), and keeps every earlier attack.

| Version | Affix | What it does |
|---|---|---|
| 2.0 | **Rollout** | Rollout lines are its signature move (twice as likely) |
| 3.0 | **Race Condition** | When angry it **forks**: a second boss with the same HP. Kill both to clear the wave |
| 4.0 | **Memory Leak** | Grows up to 1.7x over a minute and drips puddles every 4 s |
| 5.0 | **Heisenbug** | Every 6 s it blinks out (takes only 30% damage while hidden), then reappears right next to you |
| 6.0 | **Monolith** | Four armour plates: it takes only 35% damage until they break. Each plate breaks after 6% of its max HP in hits |
| 7.0 | **Infinite Loop** | Circles you and fires a spiral of shots every 0.35 s |
| 8.0+ | **Two random** affixes | The pool adds **Backpressure**: every live bug slows you (down to 60% speed) |
| Heat 5 | **One extra** affix | On every boss from 2.0 |

Beating a boss in under 20 s earns a crest.

---

## The wave ladder

| Wave | Name | Modifier | New bug trick |
|---|---|---|---|
| 1 | MVP | none: the original run | the six classics |
| 2 | HACKER NEWS LAUNCH | the old "Act 2": more of everything, a scripted event list | - |
| 3 | PRODUCT-MARKET FIT | two extra traffic spikes | Regression |
| 4 | THE BIG MIGRATION | twice the tech-debt puddles (twice as often, twice as many) | Legacy Nest |
| 5 | HYPERGROWTH | +30% spawns, +30% XP | Flaky |
| 6 | ENTERPRISE DEAL | armoured bugs: they take 35% less damage | Scope Creep |
| 7 | OUTAGE | darkness everywhere except a circle around you | Heisenbug |
| 8 | CODE FREEZE | icy floor: you slide (momentum) | Race Condition |
| 9-12 | SCALE 1-4 | **two random** modifiers. The pool adds **ingestion lag**: gems take 2 s to appear | all mixed |
| 13 | DEPRECATION | **Nohog** arrives 20 s in | - |
| 14+ | SCALE 5, 6... | two random modifiers, and Nohog comes again every wave | - |

### Wave lengths
- Wave 1: the boss at 3:30.
- Wave 2: 3:00 of traffic, then the boss.
- Wave 3+: 2:30, then the boss.

### Scaling (how waves get harder)
- **Wave 2:** spawns x1.35, bug HP ramps from x1.3 to x2.6 across the wave, bug damage x1.3.
- **Wave 3+:** bug HP **x2.35 per wave** (x2.7 per wave from wave 9: the soft wall), growing smoothly through each wave.
  Bug damage **x1.3 per wave**. Bug speed +5% per wave (max x1.4). Spawns +10% per wave (the 320-bug cap turns the rest
  into HP).
- Difficulty and heat multiply on top. Easy's discounts fade out between waves 3 and 6.
- You scale too: **+15% damage (compounding) and +10 max HP per boss** (funding rounds), and each wave starts at full HP.

### Wave modifiers
| Modifier | Effect |
|---|---|
| **Traffic spikes** | Two extra spikes per wave |
| **Tech debt** | Puddles come twice as often, up to 8 at once |
| **Hypergrowth** | +30% spawns and +30% XP |
| **Armoured bugs** | Every bug takes 35% less damage. Make It Public cuts through |
| **Outage** | Everything beyond about 105 px of you is dark |
| **Icy floor** | You keep sliding: steer early. Superhero ignores it |
| **Ingestion lag** | Gems are faint for 2 s before you can collect them |

---

## Releases

After each boss (on CONTINUE) you **SHIP A RELEASE**: pick 1 of 3 cards, free. The cards mix **releases**, **new
tools** (through wave 5 at least one is always offered) and **v2.0 majors** for your evolved weapons. Each release can
be taken once, except Hedgehog Mode (up to 3).

| Release | Effect |
|---|---|
| **Self-Driving Product** | Every 20 s a scout opens a PR: a 70 px blast on the densest crowd on screen. Bugs lose 40% of max HP + 30 (scaled by wave); bosses take 3% |
| **Hedgehog Mode** | Two hoggie pals (from your unlocked roster) follow you and shoot (18 damage every 0.8 s, scaled by wave). Stacks to 3 (6 pals) |
| **Generous Free Tier** | A free chest at the start of every wave, and one every 1,000 kills |
| **97% Pay $0** | +1% damage per 10 gold grabbed this run (max +60%) |
| **Burning Money** | Every coin becomes a homing fireball (40 + 15 per wave damage). **You bank no gold** from coins or chests. Unlocks the Burning Money hoggie |
| **Dangerously Skip Permissions** | +50% damage, -30% max HP |
| **Token Burning Cap** | Damage ramps +2% per second you go unhit, up to +60%. Getting hit resets it |
| **Rollout 100%** | +1 projectile / orb / flag on every weapon |
| **Source Maps** | Crits deal x3 instead of x2, and +10% crit |
| **Default to Transparency** | Any non-boss bug under 12% HP dies on the next hit |
| **Small Teams** | +15% damage for every weapon slot below 6 you leave empty |
| **Maker Days** | +40% fire rate every other 30 s ("no meetings Tue/Thu") |
| **ClickHouse** | +30% XP, and every level-up heals 5 |
| **Ingestion Pipeline** | Every gem flies to you 3 s after it drops, wherever you are |
| **Dopamine Mode** | Every level-up spawns an agent orb that circles you for 20 s and bumps bugs (max 9) |
| **Offsite Hackathon** | A free level-up 1:30 into every wave |
| **DeskHog** | A tiny desk console follows you and shoots (16 damage every 0.45 s, scaled by wave) |
| **Kill Switch Protocol** | Once per wave, dropping under 25% HP sets off a hotfix: everything on screen dies |

Companions (pals, DeskHog, Dopamine agents, Self-Driving PRs) scale with the wave: +45% damage per wave past the first.

---

## Powerups

Powerups glow on the floor with a pulsing ring (at most 2 lie around at once). They come from crates, elites and,
rarely, normal kills. Wave 1 sees few; they get common later. Durations get longer with Why Not Now?, the Copy/Pasta
Hoodie and the Self-driving hoggie.

| Powerup | From wave | Duration | Effect |
|---|---|---|---|
| **SELF-DRIVING MODE** | 1 | 5 s | Hands off: autopilot steers you toward gems and away from crowds, 25% faster, and **nothing can hurt you**. Earns a crest when it ends |
| **FEATURE FREEZE** | 1 | 4 s | Every bug freezes in place and **can't hurt you**. Enemy shots hang in the air. The boss moves at half speed |
| **SHIP IT!** | 1 | 8 s | Every weapon fires **twice as fast** |
| **REWIND!** | 1 | instant | HP goes back to what it was 5 s ago (at least +15), with 1.5 s of invulnerability and a ghost replay of your path |
| **KILL SWITCH** | 2 | instant | The **most common kind of bug** on screen is switched off: all of them die |
| **WEBHOOK** | 2 | 6 s | Every kill fires a homing bolt at the next bug (chain reactions) |
| **PARTY MODE** | 2 | 6 s | A damage aura (60 px, hits 4x a second for 20 + 10 per wave), all gems and coins fly to you, and **bugs can't touch you** |
| **SCOUT TROOP** | 2 | 10 s | 8 scout drones join you: each zaps and flags a bug (+40% damage taken) every 0.5 s |
| **HOGZILLA!** | 3 | 6 s | **You become Driving Hogzilla**: 30% faster, can't be touched, and run bugs over (80 damage, scaled by wave) |
| **SAMPLING** | 3 | 5 s | 90% of bugs go ghostly: they **can't hurt you** and take **double damage** |
| **CMD+K** | 3 | - | The command palette: pick any of 3 powerups |

At the start of wave 2 a Self-Driving Mode powerup drops next to you, so you can try one.

---

## Pickups and the arena

| Pickup | What it does |
|---|---|
| **Gem** (XP) | Every kill drops one. Colour shows worth: blue (1), green (2+), pink (5+), big gold (20+). When more than 80 gems lie around, ones close together **merge** into one worth the lot. With 350 on the floor, a new drop takes in the gem farthest from you |
| **Coin** | Gold. Worth 1 x (1 + 10% per heat) x your gold bonus. Coins inside your pickup range fly to you |
| **Food** (snack) | Heals 20% of max HP (at least 25) |
| **Vacuum magnet** | Every gem and coin on the map flies to you |
| **Hotfix bomb** | Everything on screen dies. Bosses lose 6%. Nohog doesn't care |
| **Chest** | See [Chests](#chests). The boss's big chest is gold and worth more |
| **Powerup** | See [Powerups](#powerups) |
| **Merch relic** | A small permanent-for-this-run buff (see [relics](#merch-relics-and-handbook-pages)) |
| **Handbook page** | Lore, collected for good |

**Normal kill drops** (x luck): food about 0.6% from small bugs and 2.5% from others (halved at heat 4+), a coin 1.5-3.5%,
a vacuum ~0.3% (after 0:30, one at a time), a hotfix ~0.25% (after 0:45, one at a time), and a tiny powerup chance
(after 1:00).

**Crates:** one every 22 s from 0:20, 110-180 px from you, max 3. Break one (10 HP) for: food (40%, halved at heat
4+), a vacuum (12%), a hotfix (6%), a powerup (4% in wave 1, 12% later), or else 3 coins. From wave 6 a crate has a 3%
chance of a handbook page instead. **Crates are your steady source of healing.**

**Tech-debt puddles:** one every 30 s from 1:15 (max 4), placed 120-200 px from you. They grow to 34 px (+3 per heat)
over 15 s, last 45 s, and **slow you to 55%** while you're in one. Superhero flies over them.

**The arena** is at least 1280 x 800 px with walls. The camera follows you.

---

## Gold, risk and cashing out

Gold buys merch and hoggie capsules between runs.

- **Wave 1 gold is always kept,** win or lose.
- **From wave 2, gold is at risk.** The HUD shows "N AT RISK": the gold picked up since your last CONTINUE.
  - **Die:** you keep the safe gold plus **half** of the at-risk gold.
  - **CONTINUE:** all your gold becomes safe.
  - **CASH OUT:** you bank all of it **plus a bonus of 15% x the wave number** on the at-risk part (e.g. wave 4: +60%).
- **Quitting from pause** keeps what dying would keep. The run isn't recorded.
- Gold sources: coins, chests, +3 for a skip, +10 from a gold filler card. Burning Money and the Burning Money hoggie
  turn every coin into a fireball instead, and chests give no gold.

---

## Score

```
score = ( kills x 10
        + (level - 1) x 100
        + seconds survived x 5
        + 2,000 x (1 + 2 + ... + bosses beaten)     e.g. 3 bosses = 12,000
        + 3,000 x wave, if you cashed out )
        x (1 + 0.2 x heat)
```

Each boss is worth more than the last, and cashing out is worth a lot on a high wave. A 250,000 score earns a crest.

---

## Heat

Pick heat 0-5 on the title screen. **Heat n unlocks by winning on heat n-1** (a win = clearing wave 1). Heat stacks:
heat 3 has everything from heat 1, 2 and 3.

| Heat | Adds |
|---|---|
| 1 | More bugs: x1.3 spawns |
| 2 | Faster bugs: x1.18 speed. The boss can spiral from the start |
| 3 | Elites come early: lone elites at 0:45, 1:25, 2:05, 2:45 |
| 4 | Less healing: no base regen, half as much food |
| 5 | The boss **rages** at 25% HP, and every boss from 2.0 gets **an extra affix** |

On top of that, each heat level adds pressure that ramps up over the first 2:30 (and a bit beyond): **+15% bug HP and
+10% spawns per heat level** (up to 1.5x that by 3:45), and **+8% bug damage per heat level**. Puddles get bigger.

**Rewards:** gold x(1 + 0.1 x heat), chest gold the same, and **score x(1 + 0.2 x heat)**. On heat 1+ the ring and the
stampede can come in either order.

---

## Difficulty

Set by the theme (it's per prospect, not a menu option).

| | Easy | Normal | Hard |
|---|---|---|---|
| Bug HP | x0.65 | x1 | x1.35 |
| Bug damage | x0.55 | x1 | x1.3 |
| Spawns | x0.7 | x1 | x1.3 |
| Boss HP | x0.6 | x1 | x1.4 |
| Base regen | 0.6 HP/s | 0.25 HP/s | 0 |

Easy's discounts fade to normal between waves 3 and 6, so an easy run still ends.

---

## YOLO mode

`--dangerously-skip-permissions`. On the title screen, unlocked by **reaching wave 6**.

- **x3 spawns, x3 XP, x3 gold.**
- **x2 damage both ways:** you deal double, and from wave 2 bugs hit twice as hard.
- **90 s waves:** a boss every 1:30.
- **No pauses:** level-ups apply instantly. **PostHog AI picks your cards** (usually the best one, sometimes not),
  with commentary ("Max merged Surveys straight to main.").
- After each boss Max ships a release for you and the next wave starts right away. No SHIPPED screen, no cashing out:
  YOLO runs end when you die.
- **A powerup rains down every 6 s.**
- **ALL HANDS** at every boss.
- YOLO has its own leaderboard.

---

## Hoggies (characters)

All **171** PostHog hedgehogs are playable. About 40 are **signature** hoggies with a start weapon and a real trait.
The rest are the **cast**: default stats plus one small perk that matches the art.

### Signature hoggies
| Hoggie | Starts with | Trait | How to unlock (besides capsules) |
|---|---|---|---|
| **I'm The Driver** | the theme's main product | None: the default | Start |
| **Wizard 1-3** | Product Analytics | +20% area (Wizard 3: +10% XP too) | Wizard 1 at start |
| **Wizard 4-5** | Feature Flags | +20% area | |
| **Self-driving** | - | Self-driving for 5 s at the start of every wave. Powerups last 2x | Crest: ride out Self-Driving Mode |
| **Driving Hogzilla** | Heatmaps | Runs bugs over while moving (20 damage, scaled by wave). +30 max HP | Crest: get run over by Hogzilla |
| **Terminator** | Experiments ("minigun tests") | One free revive ("I'll be back") | Reach wave 5 |
| **Reaper** | Error Tracking | 1% of kills reap every bug on screen under 20% HP. -30% max HP | Reach wave 13 |
| **Burning Money** | Revenue Analytics | Every coin becomes a fireball. No gold | Pick the Burning Money release |
| **Dadd AI 1-2** | PostHog AI | Max AI starts at level 3 | Dadd AI 2: crest (1,000 AI kills) |
| **Noir 1-5** | Replay Vision | Sees Heisenbugs. +10% crit | Noir 1: crest (50 elites) |
| **X-ray** | Session Replay | Sees Heisenbugs | Crest: evolve Rage Click Vortex |
| **Data Thief** | Data Warehouse | Pickup range x2 | Crest: hold Warehouse, Pipelines and Batch Exports |
| **Desk Wizard** | - | Brings a DeskHog turret | Crest: run 9 Command Center agents |
| **Doc Brown / Back to the Future** | Session Replay | A free Rewind powerup at the start of every wave from wave 2 | |
| **Caveman** | - | **Evolves** at waves 3 and 6: Business Evolution, then Final Evolution. Each form +25% damage and +25 max HP | Reach wave 3 |
| **Robot** | - | +1 projectile, -15% speed | |
| **Superhero** | - | Flies over tech debt and icy floors. +15% speed | |
| **Stamp Approved** | Surveys | +20% armour | |
| **Stamp Denied** | - | Thorns: bugs that touch you take 30 damage (scaled by wave) | |
| **996** | - | +40% XP, but you slowly burn out (-0.5 HP/s) | Survive 9:36 in one run |
| **Panic** | - | Faster the lower your HP: up to +50% speed and 30% faster weapons near 0 HP | |
| **Asleep / Sleepy** | - | -15% speed, but heals 2 HP/s | |
| **Dynamite** | - | A hotfix bomb goes off every 60 s | |
| **Angel** | - | Revives at full HP, once per wave | **Kill Nohog** (never in capsules) |
| **Error** | Error Tracking | +8% crit | Crest: evolve Stack Trace Storm |
| **Experiment / Scientist** | Experiments | +1 projectile | Experiment: crest (evolve Multivariate Barrage) |
| **Survey** | Surveys | +20% area | Crest: evolve NPS Blizzard |
| **Chart** | Product Analytics | +20% area | Crest: hold 3 analytics weapons |
| **Workflows** | Workflows | - | Crest: evolve Multi-Channel Blast |

A signature start weapon that's a theme product is only used if the theme has that product. Tools always work.

### Cast perks
Every other hoggie gets one perk, matched to its art (a coffee or rocket hog is fast, a chef is tough...):

| Perk | Effect | Perk | Effect |
|---|---|---|---|
| Speed | +6% speed | Area | +6% area |
| Might | +6% damage | Crit | +4% crit |
| HP | +15 max HP | Fire rate | +5% fire rate |
| XP | +8% XP | Gold | +15% gold |
| Luck | +10% luck | Regen | +0.4 HP/s |
| Pickup | +20% pickup range | Armour | +5% armour |

### Unlocking hoggies
- **Start:** I'm The Driver, Wizard 1, and one random cast hoggie.
- **Crests:** every crest unlocks a hoggie (see [Crests](#crests-achievements)).
- **Milestones:** Caveman (wave 3), Terminator (wave 5), 996 (9:36 in one run), Reaper (wave 13), Burning Money (take
  that release), Angel (kill Nohog).
- **Capsules:** one free per wave cleared after the first (max 5 per run), each a random new hoggie. You can also buy
  them in the MERCH store: **110 + 15 gold per hoggie you own.**
- Angel, Reaper, Business Evolution and Final Evolution never come from capsules.
- New hoggies get a reveal screen after the run.

---

## Crests (achievements)

All 55 PostHog team crests. Each one pops a badge in the game and **unlocks a hoggie**.

| Crest | How to earn it | Unlocks |
|---|---|---|
| A Default Crest | Clear wave 1 | Success |
| AI Gateway | Squash 1,000 bugs with AI tools (in total) | Dadd AI 2 |
| AI Observability | Evolve Trace into Evaluations | Magnifying Glass |
| AI Research | Evolve Max AI into Deep Research | Research |
| Analytics Platform | Hold 3 analytics weapons at once (Product Analytics, Web Analytics, Heatmaps, Revenue) | Chart |
| APM | Beat a boss in under 20 s | Rocket |
| Batch Exports | One Batch Export hits 100 bugs | Mailbox |
| Billing | Earn 1,000 gold in total | Money |
| Blitzscale | Reach wave 5 before 14:00 | Roller Coaster |
| Builder Relations | Play 10 runs | Hand Clasp |
| ClickHouse | Squash 100,000 bugs in total | Construction 1 |
| Client Libraries | Clear wave 1 with 10 different hoggies | Coding Group |
| Cloud Foundations | Reach wave 8 | Construction 2 |
| Cloud Platform | Reach wave 10 | Float |
| Conversations | Find 10 handbook pages | Phone Call |
| Customer Analytics | Squash 50 elites in total | Noir 1 |
| Customer Success EU | Co-op only: not in this game | Croissant |
| Customer Success NA | Co-op only: not in this game | Burger |
| Data Modeling | Evolve Managed Warehouse | Doll House |
| Data Tools | Hold Warehouse, Pipelines and Batch Exports | Data Thief |
| Demand Gen | Pick up 25 powerups in one run | Megaphone |
| Dev Experience | Clear wave 1 without getting hit | Code Bubble |
| Editorial | Find every handbook page | Reading Is Magic |
| Error Tracking | Evolve Stack Trace Storm | Error |
| Experiments | Evolve Multivariate Barrage | Experiment |
| Feature Flags | Evolve Kill Switch Grid | Stop |
| Forward Deployed Engineering | Clear wave 3 on heat 3 or more | Explorer |
| Graphics | Unlock 25 hoggies | Art Thief |
| Growth | Reach level 100 in one run | Gardener 1 |
| GTM Engineering | Cash out at wave 3+ with 500+ gold | Haha Bizzniss |
| Ingestion | Collect 5,000 gems in one run | Hot Popcorn |
| Managed Warehouse | Hold 5 evolved weapons | Organized |
| Marketing | Score 250,000 in one run | Town Crier |
| MCP Analytics | Hold 5 PostHog tools in one run | Cursor |
| New Business Sales | Cash out for the first time | Gatsby |
| Onboarding | Finish your first run | Lifeguard |
| People Ops | Unlock 50 hoggies | Namaste |
| Platform Features | Patch a weapon to v1.10 | Transformer |
| Platform UX | Ship a v2.0 major release | iPad |
| PostHog Desktop | Run 9 Command Center agents | Desk Wizard |
| Product Analytics | Evolve Funnel Quake | Level Up |
| Product Lead Sales East | Clear wave 1 on heat 3 | Football Coach |
| Product Led Sales West | Clear wave 3 on heat 5 | Cowboy Lasso |
| Replay | Evolve Rage Click Vortex | X-ray |
| Security | Clear wave 6 without dropping under half HP | Mountie |
| Self-Driving | Ride out Self-Driving Mode | Self-driving |
| Support | Be revived 10 times in total | Doctor 1 |
| Surveys | Evolve NPS Blizzard | Survey |
| Talent | Unlock every signature hoggie | Star |
| Warehouse Sources | Collect every merch relic | Safari |
| Web Analytics | Evolve Realtime Dashboard | Traffic Controller |
| Website *(hidden)* | Fuse Full Stack Nova | Dr. Manhattan |
| Wizard Docs | Clear wave 1 as a Wizard | Wizard 3 |
| Workflows | Evolve Multi-Channel Blast | Workflows |
| YouTube | Get run over by Hogzilla | Driving Hogzilla |

---

## The merch store

**MERCH** on the title screen. Three tabs (TAB or 1-3 to switch): **MERCH** (the store), **HOGGIES** (pick who to play)
and **CRESTS** (the wall).

The store sells the **Hoggie Capsule** (a random new hoggie, 110 + 15 gold per hoggie you own) and all **57 items from
PostHog's real merch store**, each with a strange but useful effect. Owning it means wearing it: it works in every run.
**Items stack:** each copy applies the effect again and costs **1.6x the last** (rounded to 10).

Prices below are for the first copy.

| Item | Effect | Price |
|---|---|---|
| PostHog sticker | +3% damage, +3% XP | 150 |
| tote.bag | +40% pickup range, -4% speed | 250 |
| token.burning_cap | +7% damage, weapons 2% slower | 280 |
| posthog_playing.cards | +1 reroll per run, +4% luck | 300 |
| summer.socks | +5% speed, +0.3 HP/s regen | 300 |
| dangerously_skip.pad | +1 skip and +1 banish per run | 320 |
| PostHog Laptop Sleeve | +12% armour while standing still | 320 |
| PostHog meme sticker pack | +25% gold | 320 |
| retired-billboard.duffel | +15% gold, +15% pickup range | 350 |
| cycling.shirt | +10% speed, -10 max HP | 350 |
| womens.tee | +8% max HP, +3% speed | 350 |
| Thirsty for business t-shirt | +50% pickup range below half HP, +8% gold | 350 |
| PostHog New Hire Kit | +30% XP for the first 3 minutes | 350 |
| posthog_owala.waterbottle | +1 HP/s regen while moving | 380 |
| slimfit_home.jersey | +12% damage in waves 1-3 | 380 |
| womens.shorts | +6% speed, +6% XP | 380 |
| mens.shorts | +6% speed, +4% crit | 380 |
| crossbody.bag | +1 skip per run, +10% pickup range | 380 |
| posthog_track.suit | +12% speed above half HP | 380 |
| Hogzilla & friends sticker pack | +10% weapon size, +10% pickup range | 380 |
| PostHog Birthday Gift | +12% luck, +6% gold | 380 |
| 2020.cap | +10% luck, +8% XP | 400 |
| heavy_canvas.jacket | +25 max HP, -6% speed | 400 |
| Copy/Pasta Hoodie | Powerups last 40% longer | 400 |
| camo.cap | +18% armour below half HP | 420 |
| How's it growing? t-shirt | +20% XP, -8% damage | 420 |
| Runtime error t-shirt | +40% crit damage, -4% crit | 420 |
| Dark mode long sleeve shirt | +10% armour after 5 minutes | 420 |
| Hedgehog t-shirt | +5% armour, +0.4 HP/s regen | 420 |
| PostHog Carhartt cap | +15 max HP, +4% armour | 420 |
| slimfit_away.jersey | +12% damage from wave 4 on | 450 |
| womens_quilted.jacket | +0.6 HP/s regen, +10 max HP | 450 |
| Theo mode t-shirt | +18% XP while moving | 450 |
| Tactical black t-shirt | +5% speed, +5% armour | 450 |
| Danger t-shirt | +25% damage below 30% HP | 450 |
| PostHog for Startups Kit | +15% gold and XP in waves 1-2 | 450 |
| windbreaker.jacket | +8% armour, +6% speed while moving | 480 |
| quick.call | Weapons 10% faster in boss fights | 480 |
| Scrabble t-shirt | +25% damage every 3rd minute (minutes 3, 6, 9...) | 480 |
| Hogzilla t-shirt | +18% weapon size, -4% speed | 480 |
| Hedgehog hoodie | +1.5 HP/s regen while standing still | 480 |
| organizer_2026.cal | Weapons 1% faster per minute (max 12%) | 500 |
| supabase_posthog.shirt | +8% damage and XP with 3+ weapons | 500 |
| Popular name brand watch t-shirt | Weapons 2% faster per wave (max 10%) | 500 |
| posthog_ceramic_art.mug | Weapons 8% faster, -12 max HP (jitters) | 520 |
| PostHog Timbuk2 Backpack | +1 reroll, +1 skip, -5% speed | 520 |
| Data warehouse t-shirt | +3% damage per weapon you own | 520 |
| PostHog Dark Mode Hoodie | +10% damage, +8% armour after 10 minutes | 520 |
| PostHog YC kit | +15% damage in boss fights | 520 |
| light_mode.shirt | Bugs take 5% more damage, +8% weapon size | 550 |
| posthog_caps.key | +6% crit, +25% crit damage | 550 |
| Candle by PostHog | +16% damage, -15% max HP | 550 |
| College t-shirt | +1% damage per level (max 20%) | 580 |
| The different sticker pack | +1 projectile below half HP | 780 |
| Copy/pasta t-shirt | +1 projectile, weapons 12% slower | 850 |
| max.hedgehog | +1 revive per run, -10% damage | 880 |
| DeskHog Kit | +1 projectile, -15% weapon size | 1,000 |

"Minutes" here means time since the run started.

---

## Merch relics and handbook pages

### Merch relics (in-run)
Relics drop from **every boss from 2.0 on** (one per boss) and, from wave 3, from about **3% of elites** (x luck). You
can hold one of each per run. Their buff lasts the run, and they're collected for good (all 9 earns a crest).

| Relic | Buff this run |
|---|---|
| token.burning_cap | +8% damage |
| dangerously_skip.pad | +6% crit |
| posthog_playing.cards | +1 reroll |
| posthog_owala.waterbottle | +1 HP/s regen |
| tech_anorak.jacket | +8% armour |
| summer.socks | +8% move speed |
| retired-billboard.duffel | +30% pickup range |
| home.jersey | +12% XP |
| top.hat | +15% luck (hedgehog mode approved) |

### Handbook pages
22 pages of PostHog history and values. **Page N drops the first time you beat boss version N** (wave 1's boss gives
page 1, Legacy Monolith 2.0 gives page 2...). From wave 6, crates have a 3% chance of dropping your next missing page.
10 pages and all 22 each earn a crest.

1. **Idea number 6:** the sixth idea, after five pivots in six months.
2. **YC W20:** Tim and James joined Y Combinator, winter 2020.
3. **The MVP:** built in four weeks, then launched on Hacker News.
4. **300 deployments:** over 300 deployments in a couple of days.
5. **ClickHouse:** Oct 2020: moved to ClickHouse for billions of events.
6. **PostHog 3000:** going from 1 to 3000, not 0 to 1.
7. **Max's rule:** Max is never drawn in profile. Self-conscious.
8. **The name:** the hedgehog is still called Max.
9. **You're the driver:** no deadlines, very minimal coordination.
10. **Make it public:** we default to transparency with everything.
11. **Do more weird:** we aren't weird for the sake of it.
12. **Why not now?:** doing the thing is the answer by default here.
13. **Optimistic by default:** you cannot change the world without believing you can.
14. **Culture:** if given a choice, go live. Write everything down.
15. **Free tier:** your free allowance renews every month. Yes, all of it.
16. **97%:** 97% of companies use PostHog for free.
17. **Offsites:** a 24-hour hackathon at every offsite.
18. **DeskHog:** a palm-sized console with three buttons. A friend.
19. **Hedgehog mode:** tiny hedgehogs on your website, sometimes in top hats.
20. **Self-driving:** a troop of more than 90 scouts watches PostHog.
21. **Mission:** equip every developer to build successful products.
22. **Owners:** zero intention of selling our business.

---

## The unhinged set pieces

### The Hogzilla drive-by
An event from wave 3 (about 1:15 into each wave). A horn sounds and a **44 px yellow lane** flashes across the screen
**through where you're standing**, with chevrons showing which way it's coming. 1.8 s later, Driving Hogzilla barrels
through at 560 px/s with a long screen shake.
- Every bug in the lane dies. Bosses lose 4%.
- **If you're still in the lane it hits you for 25% of your max HP** (armour doesn't help, and the 35% hit cap doesn't
  apply). It earns the YouTube crest, which unlocks Driving Hogzilla. Self-Driving Mode, the Hogzilla powerup and
  invulnerability save you.

### ALL HANDS
Every hoggie you've unlocked stampedes across the screen (up to 24), flattening bugs on the way (60 damage, scaled by
wave; bosses take 1%). It happens when you reach a **new personal best wave** (wave 3+) and at **every YOLO boss**.

### Nohog (the Reaper)
**Wave 13: DEPRECATION.** 20 s into the wave, a hog-shaped hole in the world arrives: **Nohog**, a black void with a
violet event horizon.
- It **never stops and never slows**: it starts at 60 px/s and speeds up by 4 px/s every second, up to 210 (faster than
  you, unless you're fast).
- Its touch deals 50% of your max HP (capped at 35% per hit like any other).
- It takes **only 20% damage**, has at least **1,000,000 HP** (or 240 s of your current DPS, whichever is more), and
  ignores knockback, slows, hotfixes, HogQL, pipelines, Hogzilla and ALL HANDS.
- It comes back every wave from 13 on.
- **Kill it** (a broken enough build can) and "NOHOG IS DOWN?!": 20 coins (5 of them big) and **Angel** unlocks.
- Just reaching wave 13 unlocks **Reaper**.

---

## Leaderboards

**SCORES** on the title. A top 20 per game, with two boards: **RUN** (all normal runs, any heat, since heat already
scales the score) and **YOLO**. Make the board and you enter 3-letter initials on the end screen. Each prospect game has
its own boards. Leaderboards are on wherever the game is hosted and in the Android app, but off when it runs locally.

---

## How damage works

When a weapon hits a bug:

```
damage = base
       x might              (passives, merch, relics, releases, funding rounds: x1.15 per boss, YOLO x2)
       x patch bonus        (x1.12 per patch, x1.6 for a v2.0)
       x bug armour         (tanks 0.6, shielded elites 0.45, nests 0.8, Enterprise Deal 0.65...)
       x (1 + vulnerability)  (Make It Public, light_mode.shirt: ignores armour)
       x crit               (x2, or x3 with Source Maps)
       x 1.4 if flagged      (Scouts, the Scout Troop powerup)
       x 2 if sampled        (the Sampling powerup)
       x boss crumble        (up to x8 on wave 1, x16 later)
       x 0.35 behind Monolith plates
       x 0.2 against Nohog
```

- **Exact-damage effects** skip all of that: Batch Exports, HogQL deletes, hotfixes, pipelines, Self-Driving PRs,
  Kill Switch.
- Some hits can't crit: Surveys, Heatmaps, Scouts' flag hit, Logs (car and bombs), the moat, ramming (Driving Hogzilla, the Hogzilla powerup) and Party Mode's aura.
- Damage numbers are merged per bug every quarter second. In a big crowd only crits, big hits, elites and bosses show
  numbers. N toggles them.

Incoming damage: `contact damage x (1 - armour)`, armour capped at 70% (so you always take at least 30%), then capped at
35% of max HP per hit. Then 0.55 s of invulnerability.

---

## Tips and builds

### The first run
- **Keep moving.** Your weapons aim themselves. Your only job is to not be where the bugs are.
- **Grab gems early:** levels compound. Autocapture makes this much easier.
- **Break crates:** they're your main food source.
- **Aim for one evolution by the boss.** Get a weapon to L5, take its partner passive, and kill an elite. The 3:00
  elite pack drops three chests.
- **Exploders:** kill them at range or step away from the fuse. **Chargers:** sidestep the red line.
  **Spitters:** close the distance.
- **The boss:** circle it, dodge the charge line, and find the gap in the ring. It crumbles after 50 s even if your build
  is weak.

### On the ladder
- **Continue or cash out?** Each CONTINUE makes your gold safe and gives a funding round. Dying from wave 2 on costs half
  the gold picked up since. Cash out when the next wave looks like a wall, especially on a high wave where the bonus is
  big (15% x wave).
- **Take tools.** They're strong, and through wave 5 the Release screen always offers one.
- **Multipliers beat raw damage.** Scouts (+40% to flagged bugs), Make It Public (ignores armour, and wave 6's armoured
  bugs make it shine), Source Maps (x3 crits), Rollout 100% (+1 amount on everything).
- **Double-duty passives:** Autocapture, Hot Reload, Big Monitor, Docs Day, Rubber Duck and Pair Programming each
  evolve two weapons.
- **Survival:** Data Moat, Self-Healing, Code Review and Snack Break. Kill Switch Protocol is a free panic button.
- **Wave 7 (Outage):** stay close to your weapons' reach; Replay Vision and Noir hoggies see the Heisenbugs.
- **Wave 8 (Code Freeze):** start turning early. Superhero ignores the ice.
- **The Hogzilla drive-by:** the lane is drawn through where you are when it starts. Step out sideways, not along it.

### Build ideas
- **Crit storm:** Error Tracking + Rubber Duck, AI Observability (Evaluations auto-crit), Source Maps, posthog_caps.key.
- **The minefield:** Feature Flags + Hot Reload, Endpoints (Edge Cache) + You're the Driver, Heatmaps. Walk loops.
- **Money printer:** Revenue Analytics + Lucky Commit, 97% Pay $0, the meme sticker pack. Or go Burning Money:
  coins become fireballs and still power the MRR Cannon (but bank nothing).
- **Screen wiper:** Data Pipelines + Optimistic by Default, HogQL (Materialized View), Default to Transparency, Logs.
- **Multiplier stack:** Scouts (Troop of 90), Make It Public, Batch Exports (Backfill) on top of anything that hits a lot.
- **Full Stack Nova:** Session Replay + Autocapture and Error Tracking + Rubber Duck, then one more chest.

---

## Quick reference

**Numbers worth remembering**
- Boss at **3:30**. Later waves: 3:00 (wave 2), then **2:30**.
- Evolution = **L5 + partner passive + chest**.
- Patch = **x1.12** damage. v2.0 = **x1.6, +1 amount, 15% faster**.
- Funding round = **+15% damage (compounding), +10 max HP** per boss.
- One hit takes at most **35%** of max HP. Armour caps at **70%**.
- Passive slots: **6**, then **8** from wave 3.
- Rerolls, skips, banishes: **1 each** per run (+ merch).
- Gold at risk from **wave 2**: die = keep half, cash out = +15% x wave bonus.
- YOLO unlocks at **wave 6**. Heat n unlocks by winning heat n-1.
- Nohog arrives at **wave 13**, 20 s in.

**What the colours mean**
| Colour | Meaning |
|---|---|
| Yellow bug | Exploder (fuse) |
| Red bug | Charger (dash) |
| Green bug | Spitter (shots) |
| Lilac bug | Regression (comes back) |
| Brown, big | Legacy Nest (factory) |
| Cyan, flickering | Flaky (blinks) |
| Orange, growing | Scope Creep |
| Faint white | Heisenbug |
| Pink pair | Race Condition |
| Gold pip overhead | Elite (chest) |
| Blue ring around a bug | Shielded elite |
| Blue flag over a bug | Flagged by a scout (+40% damage) |
| Red halo shot | Enemy shot |
| Yellow lane | Hogzilla drive-by incoming |
| Glowing ring on the floor | Powerup |
| Green sludge | Tech debt (slows you) |
