// The JSON API behind the admin app. Everything here needs a signed-in PostHog person.
import { Hono } from 'hono';
import type { AuthedEnv } from '../env';
import { EDITABLE_SLOTS, PRODUCTS, startingGrid, THEME_SCHEMA } from '../lib/kit';
import { requireUser, sameOrigin } from '../middleware/auth';
import { prospects } from './prospects';

export const api = new Hono<AuthedEnv>();

api.use('*', sameOrigin, requireUser);
api.get('/me', (c) => c.json(c.var.user));

// What the admin app needs to know about the kit: the theme schema (to build a form), the products, and the slots people may redraw.
api.get('/kit', (c) =>
  c.json({
    schema: THEME_SCHEMA,
    products: PRODUCTS,
    slots: EDITABLE_SLOTS.map((s) => ({ ...s, defaultGrid: startingGrid(s.id) ?? null })),
  }),
);

api.route('/prospects', prospects);
