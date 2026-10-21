import { describe, expect, it } from 'vitest';
import { DEFAULT_SLUG } from '../../src/db/schema';
import { call, seedProspect, unlock, withCookie } from './helpers';

const post = (path: string, body: unknown, cookie: string | null = null) =>
  call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
const score = (name: string, score: number, stats: Record<string, unknown> = { time: 200 }) => ({ name, score, stats });

describe('leaderboards', () => {
  it('are public for the default game', async () => {
    const board = `/mp/lb/${DEFAULT_SLUG}:run`;
    expect((await call(board)).status).toBe(200);
    const res = await post(board, score('abc', 1200, { wave: 1, time: 200 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rank: number | null; top: { name: string; score: number }[] };
    expect(body.top.find((e) => e.name === 'ABC')?.score).toBe(1200);
    expect(body.rank).toBeGreaterThan(0);
  });

  it("need the password for a prospect's game, and say nothing about games that do not exist", async () => {
    const { slug } = await seedProspect();
    expect((await call(`/mp/lb/${slug}:run`)).status).toBe(401);
    expect((await post(`/mp/lb/${slug}:run`, score('abc', 100))).status).toBe(401);
    expect((await call('/mp/lb/no-such-game-x1:run')).status).toBe(404);
    expect((await call('/mp/lb/NOT_A_BOARD')).status).toBe(400);

    const { cookie } = await unlock(slug);
    expect((await call(`/mp/lb/${slug}:run`, withCookie(cookie))).status).toBe(200);
    expect((await post(`/mp/lb/${slug}:run`, score('abc', 100), cookie)).status).toBe(200);
  });

  it('keep each game and each mode on its own board', async () => {
    const a = await seedProspect();
    const { cookie } = await unlock(a.slug);
    await post(`/mp/lb/${a.slug}:run`, score('aaa', 500), cookie);
    const other = (await (await call(`/mp/lb/${a.slug}:yolo`, withCookie(cookie))).json()) as { top: unknown[] };
    expect(other.top).toEqual([]);
  });

  it('list entries best first', async () => {
    const { slug } = await seedProspect();
    const { cookie } = await unlock(slug);
    const board = `/mp/lb/${slug}:run`;
    for (const s of [300, 100, 600, 200]) await post(board, score('abc', s), cookie);
    const top = ((await (await call(board, withCookie(cookie))).json()) as { top: { score: number }[] }).top;
    expect(top.map((e) => e.score)).toEqual([600, 300, 200, 100]);
  });

  it('prune a board to its best 20, earlier entries winning ties', async () => {
    const { slug } = await seedProspect();
    const board = `${slug}:run`;
    const { getDb } = await import('../../src/db/client');
    const { addScore, topScores } = await import('../../src/db/scores');
    const { env } = await import('cloudflare:workers');
    const db = getDb(env);
    for (let i = 1; i <= 25; i++) await addScore(db, board, { name: 'ABC', score: i * 10, stats: {}, at: i });
    await addScore(db, board, { name: 'TIE', score: 250, stats: {}, at: 99 }); // ties the best score, but came later
    const top = await topScores(db, board);
    expect(top).toHaveLength(20);
    expect(top[0].score).toBe(250);
    expect(top[0].name).toBe('ABC'); // earlier tie wins
    expect(top[1].name).toBe('TIE');
    expect(top.at(-1)?.score).toBe(70); // 25 + 1 entries kept to 20: the six lowest are gone
  });

  it('refuse bad names, blocked names, impossible scores and bad stats, in words the game shows players', async () => {
    const { slug } = await seedProspect();
    const { cookie } = await unlock(slug);
    const board = `/mp/lb/${slug}:run`;
    const err = async (body: unknown) => {
      const res = await post(board, body, cookie);
      return [res.status, ((await res.json()) as { error: string }).error];
    };
    expect(await err(score('ab', 100))).toEqual([400, 'name: 3 letters A-Z']);
    expect(await err(score('a1c', 100))).toEqual([400, 'name: 3 letters A-Z']);
    expect(await err(score('xxx', 100))).toEqual([400, 'try other letters']);
    expect(await err(score('abc', 0))).toEqual([400, 'bad score or stats']);
    expect(await err(score('abc', 99999999, { time: 20 }))).toEqual([400, 'score does not fit the run']);
    expect(await err(score('abc', 100, { wave: 500 }))).toEqual([400, 'bad score or stats']);
  });

  it('accept the keys the game sends, drop the ones it does not know, and ignore a hostile hog name', async () => {
    const { slug } = await seedProspect();
    const { cookie } = await unlock(slug);
    const res = await post(
      `/mp/lb/${slug}:run`,
      score('abc', 900, { wave: 2, time: 120, kills: 40, level: 3, hog: 'Sprout', extra: 'x' }),
      cookie,
    );
    const top = ((await res.json()) as { top: { stats: Record<string, unknown> }[] }).top;
    expect(top[0].stats).toEqual({ wave: 2, time: 120, kills: 40, level: 3, hog: 'Sprout' });

    const evil = await post(`/mp/lb/${slug}:run`, score('abc', 800, { time: 100, hog: '<script>' }), cookie);
    const stats = ((await evil.json()) as { top: { score: number; stats: Record<string, unknown> }[] }).top.find(
      (e) => e.score === 800,
    )?.stats;
    expect(stats).toEqual({ time: 100 });
  });

  it('limit posting to six a minute per board', async () => {
    const { slug } = await seedProspect();
    const { cookie } = await unlock(slug);
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await post(`/mp/lb/${slug}:run`, score('abc', 100 + i), cookie)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429, 429]);
  });

  it('let only an admin delete an entry', async () => {
    const { slug } = await seedProspect();
    const { cookie } = await unlock(slug);
    const created = (await (await post(`/mp/lb/${slug}:run`, score('abc', 100), cookie)).json()) as { id: number };
    const del = (key?: string, c: string | null = cookie) =>
      call(`/mp/lb/${slug}:run/${created.id}`, {
        method: 'DELETE',
        headers: { ...(key ? { 'x-admin-key': key } : {}), ...(c ? { Cookie: c } : {}) },
      });

    expect((await del()).status).toBe(403);
    expect((await del('wrong')).status).toBe(403);
    expect((await del('test-admin', null)).status).toBe(200); // the key alone is enough: no password needed
    const top = ((await (await call(`/mp/lb/${slug}:run`, withCookie(cookie))).json()) as { top: unknown[] }).top;
    expect(top).toEqual([]);
  });
});
