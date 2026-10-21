// Leaderboards: top 20 per game and mode, 3-letter initials, no accounts. The server is this repo's Worker, at
// <site.json relay>/lb (src/board.ts). A board is "<game slug>:<mode>", so a game built from a template
// gets its own boards (nerdy-bug-survivors:run...) with nothing to set up.
//
// Kits opt in with KitDef.leaderboard. It's on wherever the game is hosted (the server allows any origin) and in the
// Android app, but off on localhost / file pages (local dev, tests, game checks) unless the page has ?lb=<endpoint>
// (e.g. ?lb=http://127.0.0.1:8787/mp/lb for `wrangler dev`), so test runs never post to the real boards. ?lb=off turns
// it off anywhere.
import { K } from './kit';
import { meta } from './meta';
import { SITE } from './site';

export interface LbEntry { id: number; name: string; score: number; stats: Record<string, number | string>; at: number }
export interface LbMode { id: string; label: string }
export interface LbSubmit { rank: number | null; id: number; top: LbEntry[] }

export const LB_SIZE = 20;
const PROD = `${SITE.relay.replace(/\/$/, '')}/lb`;
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0|)$/;

function override(): string | null {
  try { return new URLSearchParams(location.search).get('lb'); } catch { return null; }
}

export const lb = {
  /** The kit wants boards and this page may talk to them. */
  enabled(): boolean {
    if (!K.kit?.leaderboard) return false;
    const o = override();
    if (o !== null) return o !== '' && o !== 'off';
    try { return location.protocol.startsWith('http') && !LOCAL.test(location.hostname); } catch { return false; }
  },
  endpoint(): string { return (override() || PROD).replace(/\/$/, ''); },
  modes(): LbMode[] { return K.kit?.leaderboard?.modes ?? [{ id: 'run', label: 'TOP 20' }]; },
  /** The mode the current run counts for. */
  runMode(): string {
    try { return K.kit?.leaderboard?.mode?.() ?? 'run'; } catch { return 'run'; }
  },
  board(mode: string): string {
    const clean = (s: string, n: number) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n) || 'game';
    return `${clean(meta.slug, 48)}:${clean(mode, 24)}`;
  },
  cache: new Map<string, LbEntry[]>(),

  /** The board's top 20, best first; null when it can't be reached (offline: the game just shows no board). */
  async top(mode: string): Promise<LbEntry[] | null> {
    const b = lb.board(mode);
    try {
      const r = await fetchT(`${lb.endpoint()}/${encodeURIComponent(b)}`, { method: 'GET' });
      if (!r.ok) return lb.cache.get(b) ?? null;
      const top = ((await r.json()) as { top: LbEntry[] }).top ?? [];
      lb.cache.set(b, top);
      return top;
    } catch { return lb.cache.get(b) ?? null; }
  },

  /** Post a score. Returns the new top 20 and the entry's rank, or { error } in words a player can read. */
  async submit(mode: string, name: string, score: number, stats: Record<string, number | string>): Promise<LbSubmit | { error: string }> {
    const b = lb.board(mode);
    try {
      const r = await fetchT(`${lb.endpoint()}/${encodeURIComponent(b)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, score, stats }) });
      const body = await r.json().catch(() => ({})) as Partial<LbSubmit> & { error?: string };
      if (!r.ok) return { error: body.error ?? `error ${r.status}` };
      lb.cache.set(b, body.top ?? []);
      return body as LbSubmit;
    } catch { return { error: 'offline: try again' }; }
  },

  /** Would this score make the board? (Fewer than 20 entries: any score does.) */
  qualifies(top: LbEntry[], score: number): boolean {
    return score > 0 && (top.length < LB_SIZE || score > top[LB_SIZE - 1].score);
  },
  /** The rank a score would get (1-based). */
  rankOf(top: LbEntry[], score: number): number { return top.filter((e) => e.score >= score).length + 1; },

  /** The initials this browser used last. */
  get initials(): string {
    try { const s = localStorage.getItem('phkit-initials') ?? ''; return /^[A-Z]{3}$/.test(s) ? s : 'AAA'; } catch { return 'AAA'; }
  },
  set initials(v: string) { try { localStorage.setItem('phkit-initials', v); } catch { /* no storage */ } },
};

function fetchT(url: string, init: RequestInit, ms = 6000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...init, signal: c.signal }).finally(() => clearTimeout(t));
}

/** "4:05" */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
