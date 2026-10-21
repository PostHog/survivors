import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './env';
import { admin } from './routes/admin';
import { api } from './routes/api';
import { game } from './routes/game';
import { leaderboard } from './routes/leaderboard';
import { oauth } from './routes/oauth';

// Only the dynamic paths reach this Worker (see run_worker_first in wrangler.jsonc). The public root game is static assets.
const app = new Hono<AppEnv>();

// Nothing here is for search engines: not the games, not the password page. (The static root game gets the same from public/_headers.)
app.use('*', async (c, next) => {
  await next();
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
});

// A deploy that never had its secret set would otherwise sign cookies with `undefined`, or fail somewhere deep in a request. Say what is wrong instead.
app.use('*', async (c, next) => {
  if (!c.env.SESSION_SECRET && c.req.path !== '/mp/health') {
    console.error('SESSION_SECRET is not set');
    return c.json({ error: 'Not configured: the Worker has no SESSION_SECRET (npx wrangler secret put SESSION_SECRET)' }, 503);
  }
  await next();
});

app.get('/mp/health', (c) => c.text('ok'));
app.route('/mp', leaderboard);
app.route('/g', game);
app.route('/oauth', oauth);
app.route('/admin', admin);
app.route('/api', api);

app.notFound((c) => c.text('not found', 404));
// The game shows `error` to players, so even failures are JSON with that key.
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'server error' }, 500);
});

export default app;
