# Where this game came from

Copied on 2026-10-20 from https://github.com/CEMcNEill/games at commit `551915f09ac3b5e736b673ba833527e2b4341d04`
(the `bug-survivors` kit and the `shared/` engine). From then on this folder is the source of truth: nothing here
reads from, builds against, or syncs with that repository.

**Left behind:** the other five kits (data-inspector, hog-quest, hog-saga, hogtopia, hogshop), the `mp-server` co-op/leaderboard
relay (replaced by `src/board.ts` in the Worker), the Claude-driven `pipeline/` that made games from the command line
(replaced by the admin chat), the Android app, upstream acceptance tests, screenshots and overnight reports.

**Changed after copying:**
- Co-op multiplayer removed: `bug-survivors/src/coop/` deleted, its scenes and imports removed from `main.ts`, `relayWs` removed from `shared/src/site.ts`.
  The in-game guide's Co-op chapter is gone (`GUIDE.md`, `public/guide.html` regenerated).
- Two crests (Customer Success EU / NA) were only earned by finishing co-op games, so they cannot be earned any more. Their
  descriptions say "Co-op only: not in this game", and so do the two hoggies they unlock (croissant, burger). Re-attach them to
  something else if that bothers anyone.
- `game/site.json` (new, replaces upstream's root `site.json`): `site` is survivors.posthog.com and `relay` is `/mp`, a path on the same origin.
- `game/build.mjs` (new, replaces `build-kits.mjs`): one kit, Node only, outputs to `../public/kit`.
- `game/tsconfig.json`: dropped `baseUrl` (removed in current TypeScript).
- The player's guide (`GUIDE.md`, `tools/guide_template.html`, `public/guide.html`): the Co-op chapter removed, and the Google Fonts
  `<link>` replaced by self-hosted latin-subset woff2 files in `public/fonts/` (see its README). The guide now makes no third-party
  request, which the site's Content-Security-Policy relies on.
