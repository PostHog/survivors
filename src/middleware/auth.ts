import { createMiddleware } from 'hono/factory';
import type { AuthedEnv } from '../env';
import { readSession } from '../lib/session';

/** The API is for signed-in PostHog people only. */
export const requireUser = createMiddleware<AuthedEnv>(async (c, next) => {
  const user = await readSession(c.env.SESSION_SECRET, c.req.raw);
  if (!user) return c.json({ error: 'sign in required' }, 401);
  c.set('user', user);
  await next();
});

/** Refuses requests that change things when they come from another site. SameSite=Lax cookies already make this hard; this is the second lock. */
export const sameOrigin = createMiddleware(async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    const crossSite = origin ? origin !== new URL(c.req.url).origin : c.req.header('Sec-Fetch-Site') === 'cross-site';
    if (crossSite) return c.json({ error: 'cross-site request refused' }, 403);
  }
  await next();
});
