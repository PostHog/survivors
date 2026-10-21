// /mp/lb/<board>[/<id>]: top 20 per board. Public for the default game; for a prospect's game only visitors who have unlocked it.
// Board names are "<slug>:<mode>", so every prospect gets its own boards with nothing to set up.
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { getDb } from '../db/client';
import { findGateBySlug } from '../db/prospects';
import { DEFAULT_SLUG } from '../db/schema';
import { addScore, topScores } from '../db/scores';
import type { AppEnv } from '../env';
import { canView } from '../lib/access';
import { BOARD_RE, scoreInput } from '../lib/board';

type LbEnv = AppEnv & { Variables: { board: string } };

const board = ':board{[^/]+}';

/** Validates the board name and checks the visitor may touch it. */
const access = createMiddleware<LbEnv>(async (c, next) => {
  const name = decodeURIComponent(c.req.param('board') ?? '').toLowerCase();
  if (!BOARD_RE.test(name)) return c.json({ error: 'bad board' }, 400);
  const slug = name.split(':')[0];
  if (slug !== DEFAULT_SLUG) {
    const row = await findGateBySlug(getDb(c.env), slug);
    if (!row) return c.json({ error: 'not found' }, 404);
    if (!(await canView(c.env, c.req.raw, row))) return c.json({ error: 'password required' }, 401);
  }
  c.set('board', name);
  await next();
});

export const leaderboard = new Hono<LbEnv>();

leaderboard.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});

leaderboard.get(`/lb/${board}`, access, async (c) => c.json({ top: await topScores(getDb(c.env), c.get('board')) }));

leaderboard.post(`/lb/${board}`, access, async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  if (!(await c.env.LB_LIMIT.limit({ key: `${ip}:${c.get('board')}` })).success) return c.json({ error: 'slow down' }, 429);

  const body = await c.req.json().catch(() => null);
  const input = scoreInput.safeParse(body ?? {});
  if (!input.success) return c.json({ error: input.error.issues[0].message }, 400);

  const db = getDb(c.env);
  const id = await addScore(db, c.get('board'), {
    name: input.data.name,
    score: input.data.score,
    stats: input.data.stats,
    at: Date.now(),
  });
  const top = await topScores(db, c.get('board'));
  const i = top.findIndex((e) => e.id === id);
  return c.json({ rank: i >= 0 ? i + 1 : null, id, top });
});
