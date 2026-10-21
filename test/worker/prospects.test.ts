import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ThemeJson } from '../../src/api-types';
import { getDb } from '../../src/db/client';
import { messages, prospects, scores, sprites } from '../../src/db/schema';
import { addScore } from '../../src/db/scores';
import { defaultGrid } from '../../src/lib/default-art';
import { newTheme } from '../../src/lib/theme';
import { call, json, ORIGIN, sessionCookie, unlock } from './helpers';

let cookie: string;
beforeAll(async () => {
  cookie = await sessionCookie('jane@posthog.com');
});

type Detail = {
  id: number;
  slug: string;
  name: string;
  domain: string | null;
  ownerEmail: string;
  version: number;
  theme: ThemeJson;
  sprites: { slot: string; grid: string }[];
};
const api = (path: string, init: RequestInit = {}) =>
  call(`/api${path}`, { ...init, headers: { Cookie: cookie, Origin: ORIGIN, ...(init.headers as object) } });
const send = (method: string, path: string, body?: unknown) => call(`/api${path}`, json(method, body ?? {}, cookie));

async function make(name = 'Acme Rockets', extra: Record<string, unknown> = {}) {
  const res = await send('POST', '/prospects', { name, ...extra });
  const body = (await res.json()) as { prospect: Detail; password: string; url: string };
  return { res, ...body };
}
const get = async (id: number) => ((await (await api(`/prospects/${id}`)).json()) as { prospect: Detail }).prospect;

describe('the prospects API needs a signed-in PostHog person', () => {
  it.each([
    ['GET', '/prospects'],
    ['POST', '/prospects'],
    ['GET', '/prospects/1'],
    ['PATCH', '/prospects/1'],
    ['PUT', '/prospects/1/theme'],
    ['PUT', '/prospects/1/sprites/boss'],
    ['DELETE', '/prospects/1/sprites/boss'],
    ['POST', '/prospects/1/password'],
    ['DELETE', '/prospects/1'],
    ['GET', '/prospects/1/leaderboard/run'],
    ['GET', '/kit'],
  ])('%s %s', async (method, path) => {
    const res = await call(`/api${path}`, {
      method,
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : '{}',
    });
    expect(res.status).toBe(401);
  });
});

describe('making a game', () => {
  it('creates one from a company name, with a password shown once and a link that is hard to guess', async () => {
    const { res, prospect, password, url } = await make('Acme Rockets', { domain: 'https://www.Acme.com/pricing' });
    expect(res.status).toBe(201);
    expect(prospect).toMatchObject({
      name: 'Acme Rockets',
      domain: 'www.acme.com',
      ownerEmail: 'jane@posthog.com',
      version: 1,
      sprites: [],
    });
    expect(prospect.slug).toMatch(/^acme-rockets-[a-z0-9]{8}$/);
    expect(url).toBe(`${ORIGIN}/g/${prospect.slug}/`);
    expect(password).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d\d$/);
    expect(prospect.theme).toEqual({ ...newTheme('Acme Rockets', 'www.acme.com') });

    // Only the hash is kept: the password cannot be read back from anywhere.
    const stored = await getDb(env).select().from(prospects).where(eq(prospects.id, prospect.id)).get();
    expect(stored?.passwordHash.startsWith('pbkdf2$')).toBe(true);
    expect(JSON.stringify(await (await api(`/prospects/${prospect.id}`)).json())).not.toContain('pbkdf2');
    expect(JSON.stringify(await (await api('/prospects')).json())).not.toContain('pbkdf2');
    expect(JSON.stringify(await (await api(`/prospects/${prospect.id}`)).json())).not.toContain(password);
  });

  it('protects the new game with exactly that password', async () => {
    const { prospect, password } = await make();
    expect((await unlock(prospect.slug, 'not-the-password')).res.status).toBe(401);
    expect((await unlock(prospect.slug, password)).res.status).toBe(303);
  });

  it('takes a password someone chose', async () => {
    const { prospect, password } = await make('Chosen', { password: 'Tiny Sandwich 7' });
    expect(password).toBe('Tiny Sandwich 7');
    expect((await unlock(prospect.slug, 'tiny sandwich 7')).res.status).toBe(303);
  });

  it('gives two games for the same company different links', async () => {
    const a = await make('Same Co');
    const b = await make('Same Co');
    expect(a.prospect.slug).not.toBe(b.prospect.slug);
  });

  it('makes a usable slug from awkward names', async () => {
    const { prospect } = await make('Zoë & Søn — “Ünïcode” Ltd.');
    expect(prospect.slug).toMatch(/^[a-z0-9][a-z0-9-]{2,47}$/);
    const { prospect: odd } = await make('日本語');
    expect(odd.slug).toMatch(/^game-[a-z0-9]{8}$/);
    const { prospect: long } = await make('A'.repeat(40));
    expect(long.slug.length).toBeLessThanOrEqual(48);
  });

  it.each([
    [{}, 'name'],
    [{ name: '   ' }, 'name'],
    [{ name: 'x'.repeat(41) }, 'name'],
    [{ name: 'Fine', domain: 'not a domain' }, 'domain'],
    [{ name: 'Fine', password: 'abc' }, 'password'],
  ])('refuses %j and says which field is wrong', async (body, field) => {
    const res = await send('POST', '/prospects', body);
    expect(res.status).toBe(400);
    const out = (await res.json()) as { problems: { path: string }[] };
    expect(out.problems.map((p) => p.path)).toContain(field);
  });

  it('lets a signed-in person see the game without its password, so it can be previewed', async () => {
    const { prospect } = await make();
    expect((await call(`/g/${prospect.slug}/theme/theme.json`)).status).toBe(401);
    expect((await call(`/g/${prospect.slug}/theme/theme.json`, { headers: { Cookie: cookie } })).status).toBe(200);
    expect((await call(`/mp/lb/${prospect.slug}:run`, { headers: { Cookie: cookie } })).status).toBe(200);
  });
});

describe('listing and reading games', () => {
  it('lists the newest change first, as summaries', async () => {
    const a = await make('List A');
    const b = await make('List B');
    await send('PATCH', `/prospects/${a.prospect.id}`, { name: 'List A2' }); // touches A: it moves to the top
    const { prospects: list } = (await (await api('/prospects')).json()) as {
      prospects: (Detail & { spriteCount: number; hasLogo: number })[];
    };
    const ids = list.map((p) => p.id);
    expect(ids.indexOf(a.prospect.id)).toBeLessThan(ids.indexOf(b.prospect.id));
    expect(list[0]).not.toHaveProperty('theme');
    expect(list.find((p) => p.id === b.prospect.id)).toMatchObject({
      name: 'List B',
      spriteCount: 0,
      hasLogo: 0,
      ownerEmail: 'jane@posthog.com',
    });
  });

  it('reads one game in full, and says so when there is none', async () => {
    const { prospect } = await make();
    const res = await api(`/prospects/${prospect.id}`);
    expect(((await res.json()) as { url: string }).url).toBe(`${ORIGIN}/g/${prospect.slug}/`);
    expect((await api('/prospects/999999')).status).toBe(404);
    expect((await api('/prospects/abc')).status).toBe(400);
  });
});

describe('editing the theme', () => {
  it('saves a valid theme, bumps the version, and the game serves it', async () => {
    const { prospect } = await make();
    const theme = structuredClone(prospect.theme);
    theme.title = 'Acme: Launch Day';
    theme.palette.primary = '#123456';
    const res = await send('PUT', `/prospects/${prospect.id}/theme`, { theme });
    expect(res.status).toBe(200);
    const saved = ((await res.json()) as { prospect: Detail }).prospect;
    expect(saved.version).toBe(2);
    expect(saved.theme.title).toBe('Acme: Launch Day');
    const served = (await (await call(`/g/${prospect.slug}/theme/theme.json`, { headers: { Cookie: cookie } })).json()) as {
      title: string;
      palette: { primary: string };
    };
    expect([served.title, served.palette.primary]).toEqual(['Acme: Launch Day', '#123456']);
  });

  it('refuses a theme with problems, says exactly what they are, and keeps the old one', async () => {
    const { prospect } = await make();
    const theme = structuredClone(prospect.theme);
    theme.game.boss.name = 'The Datadog Hydra';
    theme.game.enemies[0].name = 'n'.repeat(40);
    theme.palette.accent = 'gold';
    const res = await send('PUT', `/prospects/${prospect.id}/theme`, { theme });
    expect(res.status).toBe(422);
    const out = (await res.json()) as { problems: { path: string; message: string }[] };
    expect(out.problems.map((p) => p.path).sort()).toEqual(['game.boss.name', 'game.enemies.0.name', 'palette.accent']);
    expect(out.problems.find((p) => p.path === 'game.boss.name')?.message).toContain('datadog');
    expect((await get(prospect.id)).version).toBe(1);
    expect((await get(prospect.id)).theme).toEqual(prospect.theme);
  });

  it("keeps the company's name and domain whatever the theme claims", async () => {
    const { prospect } = await make('Acme Rockets', { domain: 'acme.com' });
    const theme = structuredClone(prospect.theme);
    theme.prospect = { name: 'Totally Different', short: 'Other', domain: 'other.example' };
    const saved = ((await (await send('PUT', `/prospects/${prospect.id}/theme`, { theme })).json()) as { prospect: Detail }).prospect;
    expect(saved.theme.prospect).toEqual({ name: 'Acme Rockets', short: 'Other', domain: 'acme.com' });
  });

  it('renames a game, keeping its link, and carries the name into the theme', async () => {
    const { prospect } = await make('Old Name');
    const res = await send('PATCH', `/prospects/${prospect.id}`, { name: 'New Name', domain: 'new.example.com' });
    const renamed = ((await res.json()) as { prospect: Detail }).prospect;
    expect(renamed).toMatchObject({ name: 'New Name', domain: 'new.example.com', slug: prospect.slug, version: 2 });
    expect(renamed.theme.prospect).toMatchObject({ name: 'New Name', domain: 'new.example.com' });
  });
});

describe('redrawing sprites', () => {
  const enemy = defaultGrid('enemy_1') as string;

  it('stores a valid grid, bumps the version, and the game renders it', async () => {
    const { prospect } = await make();
    const res = await send('PUT', `/prospects/${prospect.id}/sprites/enemy_1`, { grid: enemy.replace('#', '#') });
    expect(res.status).toBe(200);
    const saved = ((await res.json()) as { prospect: Detail }).prospect;
    expect(saved.version).toBe(2);
    expect(saved.sprites.map((s) => s.slot)).toEqual(['enemy_1']);

    const manifest = (await (await call(`/g/${prospect.slug}/theme/manifest.json`, { headers: { Cookie: cookie } })).json()) as {
      sprites: Record<string, string>;
    };
    expect(manifest.sprites.enemy_1).toBe('theme/sprites/enemy_1.png?v=2');
    const png = await call(`/g/${prospect.slug}/theme/sprites/enemy_1.png`, { headers: { Cookie: cookie } });
    expect(png.status).toBe(200);
  });

  it('replaces an existing drawing, and goes back to the default art when it is removed', async () => {
    const { prospect } = await make();
    await send('PUT', `/prospects/${prospect.id}/sprites/enemy_1`, { grid: enemy });
    await send('PUT', `/prospects/${prospect.id}/sprites/enemy_1`, { grid: enemy.replace(/\n$/, '') });
    expect((await get(prospect.id)).sprites).toHaveLength(1);

    const res = await send('DELETE', `/prospects/${prospect.id}/sprites/enemy_1`);
    const reverted = ((await res.json()) as { prospect: Detail }).prospect;
    expect(reverted.sprites).toEqual([]);
    expect(reverted.version).toBe(4);
    // the slot still has art: the kit's default, in the game's colours
    expect((await call(`/g/${prospect.slug}/theme/sprites/enemy_1.png`, { headers: { Cookie: cookie } })).status).toBe(200);
  });

  it.each([
    ['a grid of the wrong size', 'enemy_1', () => defaultGrid('boss') as string, 'but the grid says size 64x64'],
    [
      'the wrong number of frames',
      'enemy_1',
      () => (defaultGrid('enemy_1') as string).replace(/frame\n[^\n]*\n(?:[^\n]*\n){15}$/, ''),
      'needs 2 frames but the grid has 1',
    ],
    ['a grid that does not parse', 'enemy_1', () => 'this is not a sprite', 'missing "size WxH" line'],
    ['an empty sprite', 'tile', () => `size 32x32\nlegend\n  a #ff0000\nframe\n${`${'.'.repeat(32)}\n`.repeat(32)}`, 'the sprite is empty'],
    ['a slot that is not redrawable', 'player', () => 'size 24x24\n', 'cannot be redrawn'],
    ['a slot that does not exist', 'nonsense', () => 'size 2x2\n', 'there is no slot "nonsense"'],
    ['an enormous grid', 'enemy_1', () => `size 16x16\n${'x'.repeat(40_000)}`, 'at most 30000'],
  ])('refuses %s', async (_what, slot, grid, message) => {
    const { prospect } = await make();
    const res = await send('PUT', `/prospects/${prospect.id}/sprites/${slot}`, { grid: grid() });
    expect(res.status).toBe(422);
    const out = (await res.json()) as { problems: { message: string }[] };
    expect(out.problems.map((p) => p.message).join('\n')).toContain(message);
    expect((await get(prospect.id)).sprites).toEqual([]);
    expect((await get(prospect.id)).version).toBe(1);
  });

  it('refuses to reset a slot that cannot be redrawn', async () => {
    const { prospect } = await make();
    expect((await send('DELETE', `/prospects/${prospect.id}/sprites/player`)).status).toBe(400);
  });
});

describe('the password', () => {
  it('resets to a new one, shown once, and signs out whoever had the old one', async () => {
    const { prospect, password } = await make();
    const { cookie: visitor } = await unlock(prospect.slug, password);
    expect((await call(`/g/${prospect.slug}/theme/theme.json`, { headers: { Cookie: visitor as string } })).status).toBe(200);

    const res = await send('POST', `/prospects/${prospect.id}/password`, {});
    const fresh = ((await res.json()) as { password: string }).password;
    expect(fresh).not.toBe(password);
    expect((await call(`/g/${prospect.slug}/theme/theme.json`, { headers: { Cookie: visitor as string } })).status).toBe(401);
    expect((await unlock(prospect.slug, password)).res.status).toBe(401);
    expect((await unlock(prospect.slug, fresh)).res.status).toBe(303);
  });

  it('can be set to one someone chose', async () => {
    const { prospect } = await make();
    const res = await send('POST', `/prospects/${prospect.id}/password`, { password: 'sunny side up' });
    expect(((await res.json()) as { password: string }).password).toBe('sunny side up');
    expect((await unlock(prospect.slug, 'Sunny Side Up')).res.status).toBe(303);
  });
});

describe('leaderboards, from the admin side', () => {
  it("lists a game's board and removes an entry", async () => {
    const { prospect } = await make();
    const db = getDb(env);
    const board = `${prospect.slug}:run`;
    const first = await addScore(db, board, { name: 'AAA', score: 900, stats: {}, at: 1 });
    await addScore(db, board, { name: 'BBB', score: 500, stats: {}, at: 2 });
    const top = ((await (await api(`/prospects/${prospect.id}/leaderboard/run`)).json()) as { top: { name: string }[] }).top;
    expect(top.map((e) => e.name)).toEqual(['AAA', 'BBB']);

    const after = (
      (await (await send('DELETE', `/prospects/${prospect.id}/leaderboard/run/${first}`)).json()) as { top: { name: string }[] }
    ).top;
    expect(after.map((e) => e.name)).toEqual(['BBB']);
  });
});

describe('deleting a game', () => {
  it('removes it and everything that belonged to it', async () => {
    const { prospect } = await make('Doomed');
    const db = getDb(env);
    await send('PUT', `/prospects/${prospect.id}/sprites/enemy_1`, { grid: defaultGrid('enemy_1') });
    await db.insert(messages).values({ prospectId: prospect.id, seq: 0, messageId: 'm1', role: 'user', parts: '[]', createdAt: 1 });
    await addScore(db, `${prospect.slug}:run`, { name: 'AAA', score: 100, stats: {}, at: 1 });
    await addScore(db, `${prospect.slug}:yolo`, { name: 'AAA', score: 100, stats: {}, at: 1 });
    const keep = await addScore(db, 'somebody-else-12345678:run', { name: 'ZZZ', score: 100, stats: {}, at: 1 });

    expect((await send('DELETE', `/prospects/${prospect.id}`)).status).toBe(200);

    expect(await db.select().from(prospects).where(eq(prospects.id, prospect.id)).all()).toEqual([]);
    expect(await db.select().from(sprites).where(eq(sprites.prospectId, prospect.id)).all()).toEqual([]);
    expect(await db.select().from(messages).where(eq(messages.prospectId, prospect.id)).all()).toEqual([]);
    const left = await db.select().from(scores).all();
    expect(left.filter((s) => s.board.startsWith(`${prospect.slug}:`))).toEqual([]);
    expect(left.some((s) => s.id === keep)).toBe(true); // another game's scores are untouched
    expect((await call(`/g/${prospect.slug}/`)).status).toBe(404);
    expect((await api(`/prospects/${prospect.id}`)).status).toBe(404);
  });
});

describe('the kit', () => {
  it('tells the admin app the theme schema, the products and the slots that can be redrawn, each with its starting art', async () => {
    const kit = (await (await api('/kit')).json()) as {
      schema: { properties: object };
      products: string[];
      slots: { id: string; w: number; h: number; defaultGrid: string | null }[];
    };
    expect(Object.keys(kit.schema.properties)).toContain('palette');
    expect(kit.products).toContain('session_replay');
    expect(kit.slots.map((s) => s.id).sort()).toEqual(['boss', 'enemy_1', 'enemy_2', 'enemy_3', 'logo', 'tile']);
    expect(kit.slots.find((s) => s.id === 'boss')).toMatchObject({ w: 64, h: 64 });
    expect(kit.slots.find((s) => s.id === 'logo')?.defaultGrid).toBeNull();
    expect(kit.slots.find((s) => s.id === 'enemy_2')?.defaultGrid).toContain('size 16x16');
  });
});
