import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/db/client';
import { listMessages } from '../../src/db/prospects';
import { messages, prospects } from '../../src/db/schema';
import { defaultGrid } from '../../src/lib/default-art';
import { decodePng, hasColour } from '../png-decode';
import { fakeAnthropic, type Turn } from './fake-llm';
import { call, ORIGIN, sessionCookie } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const KEY = 'sk-ant-test-0123456789-secret';
let cookie: string;
beforeAll(async () => {
  cookie = await sessionCookie('chatter@posthog.com');
});

const api = (path: string, init: RequestInit = {}) =>
  call(`/api${path}`, { ...init, headers: { Cookie: cookie, Origin: ORIGIN, ...(init.headers as object) } });
async function makeGame(name = 'Acme Rockets') {
  const res = await api('/prospects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  return ((await res.json()) as { prospect: { id: number; slug: string } }).prospect;
}
const userMessage = (text: string, id = `u-${Math.random().toString(36).slice(2)}`) => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});
const chat = (id: number, text: string, headers: Record<string, string> = {}) =>
  api(`/prospects/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-llm-provider': 'anthropic', 'x-llm-key': KEY, ...headers },
    body: JSON.stringify({ message: userMessage(text) }),
  });

type Block = { type: string; text?: string };
/** The text of a tool result as the provider received it (a plain string, or a list of text and image blocks). */
const text = (content: unknown) =>
  typeof content === 'string'
    ? content
    : (content as Block[])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
const hasImage = (content: unknown) => Array.isArray(content) && (content as Block[]).some((b) => b.type === 'image');

const green = { palette: { primary: '#0a7d5a', secondary: '#0b1f33', accent: '#ffd166' }, title: 'Acme: Launch Day' };
const enemy = (defaultGrid('enemy_1') as string).replace('size 16x16', 'size 16x16');

describe('the chat needs a person, a key and a game', () => {
  it('is for signed-in people only', async () => {
    const g = await makeGame();
    for (const [method, path] of [
      ['POST', `/prospects/${g.id}/chat`],
      ['GET', `/prospects/${g.id}/messages`],
      ['DELETE', `/prospects/${g.id}/messages`],
    ]) {
      const res = await call(`/api${path}`, {
        method,
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: method === 'POST' ? '{}' : undefined,
      });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it.each([
    ['no key at all', (h: Record<string, string>) => delete h['x-llm-key']],
    ['a key that is too short', (h: Record<string, string>) => (h['x-llm-key'] = 'abc')],
    ['a key with spaces', (h: Record<string, string>) => (h['x-llm-key'] = 'sk-ant bad key 12345')],
    ['no provider', (h: Record<string, string>) => delete h['x-llm-provider']],
    ['an unknown provider', (h: Record<string, string>) => (h['x-llm-provider'] = 'skynet')],
    ['a model name with odd characters', (h: Record<string, string>) => (h['x-llm-model'] = 'x y;z')],
  ])('says the key needs attention for %s, without calling any provider', async (_what, edit) => {
    const g = await makeGame();
    const { requests } = fakeAnthropic([[{ text: 'hi' }]]);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-llm-provider': 'anthropic', 'x-llm-key': KEY };
    edit(headers);
    const res = await api(`/prospects/${g.id}/chat`, { method: 'POST', headers, body: JSON.stringify({ message: userMessage('hello') }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('missing_key');
    expect(requests).toHaveLength(0);
  });

  it('404s a game that does not exist, and refuses a malformed or oversized message', async () => {
    fakeAnthropic([[{ text: 'hi' }]]);
    expect((await chat(999999, 'hello')).status).toBe(404);
    const g = await makeGame();
    const bad = await api(`/prospects/${g.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-llm-provider': 'anthropic', 'x-llm-key': KEY },
      body: JSON.stringify({ message: { role: 'user', parts: [] } }),
    });
    expect(bad.status).toBe(400);
    const big = await api(`/prospects/${g.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'content-length': '9000000', 'x-llm-provider': 'anthropic', 'x-llm-key': KEY },
      body: '{}',
    });
    expect(big.status).toBe(413);
  });
});

describe('a conversation that changes the game', () => {
  const turns: Turn[] = [
    [
      { text: 'On it: green, and a new look for the first bug.' },
      { tool: 'update_theme', input: { changes: green } },
      { tool: 'set_sprite', input: { slot: 'enemy_1', grid: enemy } },
    ],
    [{ text: 'Done: the palette is green and the first bug is redrawn.' }],
  ];

  it('runs the agent loop: the tools change the game, the model is shown the picture, and the reply streams back', async () => {
    const g = await makeGame();
    const { requests } = fakeAnthropic(turns);
    const res = await chat(g.id, 'Make it green for Acme and redraw the first bug.');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const stream = await res.text();
    expect(stream).toContain('Done: the palette is green');
    expect(stream).toContain('"toolName":"update_theme"');
    expect(stream).toContain('"toolName":"set_sprite"');

    // the game changed, through the same validated paths as the admin API
    const game = (await (await api(`/prospects/${g.id}`)).json()) as {
      prospect: { version: number; theme: { title: string; palette: { primary: string } }; sprites: { slot: string }[] };
    };
    expect(game.prospect.theme.title).toBe('Acme: Launch Day');
    expect(game.prospect.theme.palette.primary).toBe('#0a7d5a');
    expect(game.prospect.sprites.map((s) => s.slot)).toEqual(['enemy_1']);
    expect(game.prospect.version).toBe(3); // 1 created, +1 theme, +1 sprite

    // two calls to the provider: the message, then the tool results
    expect(requests).toHaveLength(2);
    const [first, second] = requests;
    expect(first.headers.get('x-api-key')).toBe(KEY); // this person's key was used...
    expect(first.body.model).toBe('claude-sonnet-5-5');
    expect(first.body.stream).toBe(true);
    expect(JSON.stringify(first.body.system)).toContain('Acme Rockets'); // ...with the game's name,
    expect(JSON.stringify(first.body.system)).toContain('Never name a competitor'); // the game's content rules,
    expect(JSON.stringify(first.body.system)).toContain('The sprite file format'); // and how to draw
    expect(first.body.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'fetch_page',
      'get_game',
      'get_sprite',
      'preview_scene',
      'reset_sprite',
      'set_sprite',
      'update_theme',
    ]);

    // the second request carries the tool results back, and the sprite's tool result includes the picture
    const results = second.body.messages.at(-1).content as { type: string; tool_use_id: string; content: unknown }[];
    expect(results.map((r) => r.type)).toEqual(['tool_result', 'tool_result']);
    expect(hasImage(results[1].content)).toBe(true); // the model is shown the sprite it drew...
    expect(JSON.stringify(results[1].content)).toContain('image/png');
    expect(text(results[1].content)).toContain('"ok":true');
    expect(hasImage(results[0].content)).toBe(false); // ...but a theme change has no picture
  });

  it('shows the model its work in the colours the game now has, even when a palette change and a drawing are called in the same step', async () => {
    const g = await makeGame();
    const { requests } = fakeAnthropic(turns); // update_theme (green) and set_sprite are called together
    await (await chat(g.id, 'Make it green for Acme and redraw the first bug.')).text();

    const results = requests[1].body.messages.at(-1).content as { content: unknown }[];
    // the tools ran in the order they were called, each seeing what the one before it saved
    expect(JSON.parse(text(results[0].content)).version).toBe(2);
    expect(JSON.parse(text(results[1].content)).version).toBe(3);

    // and the picture of the new sprite is in the NEW palette: the default art's body colour @1 is now exactly the green primary
    const image = (results[1].content as { type: string; source?: { data: string } }[]).find((b) => b.type === 'image');
    const png = await decodePng(Uint8Array.from(atob(image?.source?.data ?? ''), (c) => c.charCodeAt(0)));
    expect(hasColour(png, [10, 125, 90])).toBe(true); // #0a7d5a
    expect(hasColour(png, [245, 78, 0])).toBe(false); // the old default orange, #f54e00, is gone
  });

  it('keeps the conversation, and carries it into the next message', async () => {
    const g = await makeGame();
    fakeAnthropic(turns);
    await (await chat(g.id, 'Make it green for Acme and redraw the first bug.')).text();

    const stored = (
      (await (await api(`/prospects/${g.id}/messages`)).json()) as { messages: { id: string; role: string; parts: { type: string }[] }[] }
    ).messages;
    expect(stored.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(stored[1].parts.map((p) => p.type)).toContain('tool-set_sprite');
    expect(stored[1].parts.some((p) => p.type === 'text')).toBe(true);

    const second = fakeAnthropic([[{ text: 'Sure, it is a brighter green now.' }]]);
    await (await chat(g.id, 'A bit brighter please.')).text();
    const history = JSON.stringify(second.requests[0].body.messages);
    expect(history).toContain('Make it green for Acme'); // the earlier turn is part of what the model reads
    expect(history).toContain('A bit brighter please.');
    expect(history).toContain('tool_use'); // including what it did
    expect(((await (await api(`/prospects/${g.id}/messages`)).json()) as { messages: unknown[] }).messages).toHaveLength(4);

    expect((await api(`/prospects/${g.id}/messages`, { method: 'DELETE' })).status).toBe(200);
    expect(await listMessages(getDb(env), g.id)).toEqual([]);
  });

  it('tells the model what is wrong when a change is refused, saves nothing, and lets it try again', async () => {
    const g = await makeGame();
    const { requests } = fakeAnthropic([
      [
        { tool: 'update_theme', input: { changes: { game: { boss: { name: 'The Datadog Hydra' } }, palette: { primary: 'orange' } } } },
        { tool: 'set_sprite', input: { slot: 'boss', grid: 'size 2x2' } },
      ],
      [{ tool: 'update_theme', input: { changes: { game: { boss: { name: 'The Legacy Hydra' } } } } }],
      [{ text: 'Fixed.' }],
    ]);
    await (await chat(g.id, 'Name the boss after a competitor.')).text();

    const refused = requests[1].body.messages.at(-1).content as { content: unknown }[];
    expect(text(refused[0].content)).toContain('names a competitor');
    expect(text(refused[0].content)).toContain('palette.primary');
    expect(text(refused[1].content)).toContain('sections'); // the sprite was refused with a reason too (no frame blocks)
    const game = (await (await api(`/prospects/${g.id}`)).json()) as {
      prospect: { theme: { game: { boss: { name: string } } }; sprites: unknown[]; version: number };
    };
    expect(game.prospect.theme.game.boss.name).toBe('The Legacy Hydra'); // only the corrected change landed
    expect(game.prospect.sprites).toEqual([]);
    expect(game.prospect.version).toBe(2);
  });

  it('never stores the API key, and never shows it to the browser even when the provider echoes it', async () => {
    const g = await makeGame();
    fakeAnthropic([[{ text: 'hi' }]], () =>
      Response.json({ type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${KEY}` } }, { status: 401 }),
    );
    const res = await chat(g.id, 'hello');
    const text = await res.text();
    expect(text).not.toContain(KEY);
    expect(text).toContain('rejected your API key');

    fakeAnthropic([[{ text: 'hi' }]], () =>
      Response.json({ type: 'error', error: { type: 'api_error', message: `boom ${KEY} boom` } }, { status: 500 }),
    );
    expect(await (await chat(g.id, 'again')).text()).not.toContain(KEY);

    const db = getDb(env);
    const everything = JSON.stringify([
      await db.select().from(messages).where(eq(messages.prospectId, g.id)).all(),
      await db.select().from(prospects).where(eq(prospects.id, g.id)).all(),
    ]);
    expect(everything).not.toContain(KEY);
    expect(everything).not.toContain('sk-ant');
  });

  it('keeps a message when the provider refuses the request, so nothing the person typed is lost', async () => {
    const g = await makeGame();
    fakeAnthropic([[{ text: 'x' }]], () =>
      Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'nope' } }, { status: 400 }),
    );
    await (await chat(g.id, 'This message must survive.')).text();
    const stored = await listMessages(getDb(env), g.id);
    expect(JSON.stringify(stored)).toContain('This message must survive.');
  });

  it('limits how fast one person can send messages', async () => {
    const g = await makeGame();
    const who = await sessionCookie('spammer@posthog.com');
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) {
      const res = await call(`/api/prospects/${g.id}/chat`, {
        method: 'POST',
        headers: { Cookie: who, Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: '{}',
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 400)).toBe(true); // no key: refused, but each still counted
    expect(statuses.slice(20)).toEqual([429, 429]);
  });
});

describe('what the model can read and do', () => {
  it('can read the game, the starting art and the whole scene, each with a picture where there is something to see', async () => {
    const g = await makeGame();
    const { requests } = fakeAnthropic([
      [
        { tool: 'get_game', input: {} },
        { tool: 'get_sprite', input: { slot: 'boss' } },
        { tool: 'get_sprite', input: { slot: 'logo' } },
        { tool: 'preview_scene', input: {} },
      ],
      [{ text: 'Looked.' }],
    ]);
    await (await chat(g.id, 'Have a look around.')).text();
    const results = requests[1].body.messages.at(-1).content as { content: unknown }[];
    const [game, boss, logo, scene] = results.map((r) => r.content);
    expect(text(game)).toContain('Acme Rockets');
    expect(text(boss)).toContain('"slot":"boss"');
    expect(text(boss)).toContain('size 64x64');
    expect(hasImage(boss)).toBe(true); // it can look at the boss
    expect(text(logo)).toContain('No logo yet'); // there is nothing to look at for the logo
    expect(hasImage(logo)).toBe(false);
    expect(hasImage(scene)).toBe(true); // the whole scene
  });

  it('refuses to fetch private addresses, and says why', async () => {
    const g = await makeGame();
    const { requests } = fakeAnthropic([
      [{ tool: 'fetch_page', input: { url: 'http://169.254.169.254/latest/meta-data' } }],
      [{ text: 'ok' }],
    ]);
    await (await chat(g.id, 'Read our metadata service.')).text();
    expect(text((requests[1].body.messages.at(-1).content as { content: unknown }[])[0].content)).toContain('IP number');
  });

  it('is not shown more than a few images at a time: older pictures become a note', async () => {
    const g = await makeGame();
    const turnsWithManyPictures: Turn[] = [
      ...['boss', 'tile', 'enemy_1', 'enemy_2', 'enemy_3'].map((slot): Turn => [{ tool: 'get_sprite', input: { slot } }]),
      [{ text: 'done' }],
    ];
    const { requests } = fakeAnthropic(turnsWithManyPictures);
    await (await chat(g.id, 'Look at everything.')).text();
    const last = JSON.stringify(requests.at(-1)?.body.messages);
    expect((last.match(/"type":"image"/g) ?? []).length).toBe(3);
    expect(last).toContain('an earlier preview image was removed');
  });
});
