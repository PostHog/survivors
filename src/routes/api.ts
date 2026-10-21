// The JSON API behind the admin app. Everything here needs a signed-in PostHog person.
import { Hono } from 'hono';
import site from '../../game/site.json';
import type { AuthedEnv } from '../env';
import { EDITABLE_SLOTS, PRODUCTS, startingGrid, THEME_SCHEMA } from '../lib/kit';
import { requireUser, sameOrigin } from '../middleware/auth';
import { prospects } from './prospects';

export const api = new Hono<AuthedEnv>();

api.use('*', sameOrigin, requireUser);
const isLocalhost = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1';

// Who is signed in, and where the admin app reports how it is used (the same PostHog project as the games, see game/site.json).
api.get('/me', (c) => {
  const on = site.posthog && (!isLocalhost(new URL(c.req.url)) || c.env.ANALYTICS_LOCAL);
  const analytics = on && site.posthog ? { key: site.posthog.key, host: site.posthog.host ?? 'https://us.i.posthog.com' } : null;
  return c.json({ ...c.var.user, analytics });
});

// What the admin app needs to know about the kit: the theme schema (to build a form), the products, and the slots people may redraw.
api.get('/kit', (c) =>
  c.json({
    schema: THEME_SCHEMA,
    products: PRODUCTS,
    slots: EDITABLE_SLOTS.map((s) => ({ ...s, defaultGrid: startingGrid(s.id) ?? null })),
  }),
);

api.route('/prospects', prospects);
