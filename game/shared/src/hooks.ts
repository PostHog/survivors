// window.__game: what playtest.py and the kit bots read and drive. Every kit fills the same shape.
export interface GameHooks {
  kit: string;
  ready: boolean;
  scene: string;
  state: string;          // title | howto | playing | paused | levelup | win | lose | ...
  score: number;
  elapsed: number;        // seconds of play in the current run
  fps: number;
  fallbacks: string[];    // slots/music that fell back to kit defaults at runtime
  themeIssues: string[];  // theme fields the sanitiser fixed
  textWarnings: string[]; // text the engine had to cut to fit
  events: { event: string; props: Record<string, unknown>; t: number }[];
  stats: Record<string, unknown>; // kit-specific live numbers (enemies on screen, level, hp...)
  debug: Record<string, (...a: any[]) => unknown>; // kit-specific test controls
  meta?: unknown;         // the meta-progression blob (shared/src/meta.ts), read-only view
  run?: unknown;          // K.run: {mode, heat, seed, daily, number, choices} for the current run
}

/** Engine-wide debug controls (resetMeta, unlockAll, ...). They stay on hooks.debug even when a kit
 * replaces the whole object (`hooks.debug = {...}`), because the setter merges them back in. A kit entry with
 * the same name wins; call sharedDebug.x() from it to keep the shared behaviour. */
export const sharedDebug: Record<string, (...a: any[]) => unknown> = {};

let merged: Record<string, (...a: any[]) => unknown> = {};

export const hooks: GameHooks = {
  kit: '', ready: false, scene: '', state: 'boot', score: 0, elapsed: 0, fps: 0,
  fallbacks: [], themeIssues: [], textWarnings: [], events: [], stats: {}, debug: {},
};
Object.defineProperty(hooks, 'debug', {
  enumerable: true,
  get: () => {
    // Rebuild lazily so shared entries added after a kit set its debug still show up.
    for (const k of Object.keys(sharedDebug)) if (!(k in merged)) merged[k] = sharedDebug[k];
    return merged;
  },
  set: (v: Record<string, (...a: any[]) => unknown>) => {
    merged = Object.assign({}, sharedDebug, v && typeof v === 'object' ? v : {});
  },
});
(window as any).__game = hooks;
