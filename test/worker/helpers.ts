import { env, exports } from 'cloudflare:workers';
import theme from '../../game/bug-survivors/themes/examples/ledgerly.json';
import { getDb } from '../../src/db/client';
import { prospects, sprites } from '../../src/db/schema';
import { defaultGrid } from '../../src/lib/default-art';
import { hashPassword } from '../../src/lib/gate';

export const ORIGIN = 'https://survivors.test';
export const PASSWORD = 'otter-maple-42';
export const ENEMY_GRID = defaultGrid('enemy_1') as string;

/** Calls the Worker the way the internet would. */
export const call = (path: string, init?: RequestInit) => exports.default.fetch(new Request(`${ORIGIN}${path}`, init));

let counter = 0;
export const uniqueSlug = (prefix = 'game') => `${prefix}-${Date.now().toString(36)}${counter++}`;

/** Inserts a prospect (and optionally one hand-drawn sprite) straight into D1. */
export async function seedProspect(
  opts: { slug?: string; password?: string; withSprite?: boolean; gateVersion?: number; version?: number } = {},
) {
  const slug = opts.slug ?? uniqueSlug();
  const db = getDb(env);
  const now = Date.now();
  const [row] = await db
    .insert(prospects)
    .values({
      slug,
      name: 'Ledgerly',
      ownerEmail: 'test@posthog.com',
      theme: JSON.stringify(theme),
      passwordHash: await hashPassword(opts.password ?? PASSWORD),
      gateVersion: opts.gateVersion ?? 1,
      version: opts.version ?? 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: prospects.id });
  if (opts.withSprite) await db.insert(sprites).values({ prospectId: row.id, slot: 'enemy_1', grid: ENEMY_GRID });
  return { slug, id: row.id, theme };
}

/** Enters the password and returns the cookie header to send with later requests (or null if refused). */
export async function unlock(slug: string, password = PASSWORD) {
  const res = await call(`/g/${slug}/unlock`, { method: 'POST', body: new URLSearchParams({ password }), redirect: 'manual' });
  const set = res.headers.get('Set-Cookie');
  return { res, cookie: set ? set.split(';')[0] : null };
}

export const withCookie = (cookie: string | null): RequestInit => ({ headers: cookie ? { Cookie: cookie } : {} });

// ---- signing in ----

import { SESSION_COOKIE, signSession } from '../../src/lib/session';

/** A session cookie header for a signed-in PostHog person, minted directly (the sign-in flow itself is tested in oauth.test.ts). */
export async function sessionCookie(email = 'jane@posthog.com', name = 'Jane Doe') {
  return `${SESSION_COOKIE}=${await signSession(env.SESSION_SECRET, { email, name })}`;
}
/** Request options for a signed-in person. */
export async function asUser(email?: string, init: RequestInit = {}): Promise<RequestInit> {
  return { ...init, headers: { ...(init.headers as Record<string, string>), Cookie: await sessionCookie(email) } };
}
/** JSON body request options (same-origin, as the admin app sends them). */
export const json = (method: string, body: unknown, cookie?: string): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify(body),
});
