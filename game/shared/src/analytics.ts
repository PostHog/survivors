// Optional PostHog capture. Enabled only when the build writes a posthog key into
// theme/manifest.json; otherwise events only go to window.__game.events (for playtests).
// No cookies or network until the player first presses a key.
import { hooks } from './hooks';

let ph: any = null;
let queue: [string, Record<string, unknown>][] = [];
let cfg: { key: string; host: string; slug: string; kit: string } | null = null;

export function initAnalytics(c: { key?: string; host?: string } | undefined, slug: string, kit: string) {
  if (!c?.key) return;
  cfg = { key: c.key, host: c.host || 'https://us.i.posthog.com', slug, kit };
  const start = () => {
    window.removeEventListener('keydown', start);
    const s = document.createElement('script');
    s.async = true;
    s.src = cfg!.host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
    s.onload = () => {
      const w = window as any;
      if (!w.posthog?.init) return;
      w.posthog.init(cfg!.key, { api_host: cfg!.host, persistence: 'memory', autocapture: false,
        capture_pageview: false, disable_session_recording: false });
      w.posthog.register({ game_slug: cfg!.slug, game_kit: cfg!.kit });
      ph = w.posthog;
      queue.forEach(([e, p]) => ph.capture(e, p));
      queue = [];
    };
    document.head.appendChild(s);
  };
  window.addEventListener('keydown', start);
}

export function capture(event: string, props: Record<string, unknown> = {}) {
  hooks.events.push({ event, props, t: Math.round(performance.now()) });
  if (!cfg) return;
  const p = { ...props, slug: cfg.slug, kit: cfg.kit };
  if (ph) ph.capture(event, p);
  else queue.push([event, p]);
}
