# Theme writer: Bug Survivors

Bug Survivors is a Vampire Survivors-style game. A PostHog hoggie stands in the prospect's
"arena" while swarms of bugs close in. Weapons fire on their own; every weapon is a PostHog
product. After 3:30 a boss arrives; beating it wins the game (about 4 minutes). Players can then cash
out or climb the wave ladder, where the same boss returns as "<boss name> 2.0", "3.0" and so on, so
pick a boss name that still reads well with a version number after it. Returning players get heat
levels, a merch store, hoggies to unlock, crests, YOLO mode and top-20 leaderboards; none of that needs
theme text.

What you write, and where the player sees it:
- title (max 30): the game's name on the title screen. Work in the prospect's name or world if it
  fits, e.g. "Acme vs The Bug Swarm", "Ledgerly: Invoice Defense".
- tagline (max 48): under the title. Usually "Made for <prospect> by PostHog" or a short twist on it.
- game.arena.name (max 24): where the fight happens, from their world ("Launch Pad 39A",
  "The Onboarding Funnel"). Shown on a banner when the run starts.
- game.enemies (exactly 3, weakest first): each is one of their pain points turned into a bug.
  name (max 18) is shown as "NEW BUG: <NAME>"; pain (max 44) is the one-liner under it, in their
  words. Enemy 1 is a fast little swarmer, 2 a sturdy mid-sized bug, 3 a slow tank. Each also shows up as a
  tinted variant with a trick (1 explodes, 2 charges, 3 spits from range) and as big "elite" versions, all
  under the same name, so pick names that still read as a whole species ("Flaky Test", not "The Flaky Test").
- game.boss: their biggest pain as a generic giant bug. name (max 22), taunt (max 60) is what it
  says when it arrives, in quotes on screen.
- game.starting_product: the product they need most; it must also be in products.
- game.product_lines (optional, max 44 each): a line for the level-up card tailored to them, e.g.
  session_replay: "Watch launches fail, frame by frame". Omit a product to use PostHog's default line.
- game.difficulty: "easy" for execs and non-gamers, "normal" for most, "hard" only if the brief
  says the champion is a serious gamer.
- text.win / text.lose (max 110): the end screen message. Win celebrates their product shipping
  bug-free; lose is gentle and funny, never mean. text.credits (max 80): one line, credit PostHog.
- music.mood (max 80): 3-8 mood words for a chiptune track ("heroic, fast, space-age").
  music.bpm: 120-170 suits this game.
- sprite_prompt for each enemy and the boss: a cute insect-like creature, one subject, colours and
  one memorable feature, e.g. "a small orange rocket-shaped beetle with sputtering flame legs".
  game.arena.sprite_prompt: a floor texture seen from above ("launch pad concrete with yellow
  hazard stripes").
