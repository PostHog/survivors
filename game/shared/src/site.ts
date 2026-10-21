// Where this build lives, from site.json at the repo root (build-kits.mjs bakes it in as __SITE__):
//   site     the games site's base URL
//   relay    where the leaderboards live, at <relay>/lb (the Worker's /mp/lb routes); a path like "/mp" means "this origin"
//   posthog  {key, host} for game analytics, or null; build-game copies it into each game's theme/manifest.json
// Moving hosts = edit site.json, rebuild.
export interface SiteConfig { site: string; relay: string; posthog: { key: string; host?: string } | null }
declare const __SITE__: SiteConfig;

export const SITE: SiteConfig = __SITE__;
