// The AI chat for one game. The browser sends the person's newest message and their provider settings in headers; the Worker loads the
// conversation from D1, runs the agent (a tool loop that edits this game), streams the reply back, and saves the conversation.
// The API key arrives with each request, is used for that request, and is not stored or logged.
import { APICallError, createAgentUIStreamResponse, isStepCount, ToolLoopAgent, validateUIMessages } from 'ai';
import { Hono } from 'hono';
import { z } from 'zod';
import { createModel, readLlmConfig } from '../agent/models';
import { buildInstructions } from '../agent/prompt';
import { thinOldImages } from '../agent/thin-images';
import { makeTools } from '../agent/tools';
import { getDb } from '../db/client';
import { clearMessages, getProspect, listMessages, replaceMessages } from '../db/prospects';
import type { AuthedEnv } from '../env';
import { validate } from '../lib/http';

const MAX_BODY_BYTES = 8_000_000; // a message may carry a few images
const MAX_STEPS = 30;
const MAX_MS = 5 * 60_000;

const idParam = z.object({ id: z.coerce.number().int().positive() });
const body = z.object({
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal('user'),
    parts: z.array(z.record(z.string(), z.unknown())).min(1).max(20),
  }),
});

/** Something safe to show a person: never the key, never a stack trace. */
export function describeError(err: unknown, apiKey: string): string {
  if (APICallError.isInstance(err)) {
    if (err.statusCode === 401 || err.statusCode === 403) return 'The AI provider rejected your API key. Check it in Settings.';
    if (err.statusCode === 429) return 'The AI provider is rate limiting this key. Wait a moment and try again.';
  }
  const message = err instanceof Error ? err.message : 'Something went wrong.';
  return message.split(apiKey).join('[key]').slice(0, 300);
}

export const chat = new Hono<AuthedEnv>();

chat.get('/:id/messages', validate('param', idParam), async (c) => {
  const db = getDb(c.env);
  const { id } = c.req.valid('param');
  return (await getProspect(db, id)) ? c.json({ messages: await listMessages(db, id) }) : c.json({ error: 'no such game' }, 404);
});

chat.delete('/:id/messages', validate('param', idParam), async (c) => {
  const db = getDb(c.env);
  const { id } = c.req.valid('param');
  if (!(await getProspect(db, id))) return c.json({ error: 'no such game' }, 404);
  await clearMessages(db, id);
  return c.json({ cleared: true });
});

chat.post('/:id/chat', validate('param', idParam), async (c) => {
  if ((await c.env.CHAT_LIMIT.limit({ key: c.var.user.email })).success === false)
    return c.json({ error: 'You are sending messages too fast. Wait a moment.' }, 429);

  const cfg = readLlmConfig(c.req.raw.headers);
  if (!cfg.success) return c.json({ error: 'missing_key', message: cfg.error.issues[0]?.message ?? 'Add your API key in Settings.' }, 400);
  if (Number(c.req.header('content-length') ?? 0) > MAX_BODY_BYTES) return c.json({ error: 'That message is too large.' }, 413);
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json(
      { error: 'invalid request', problems: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      400,
    );

  const db = getDb(c.env);
  const { id } = c.req.valid('param');
  const p = await getProspect(db, id);
  if (!p) return c.json({ error: 'no such game' }, 404);

  const tools = makeTools({ db, prospectId: id });
  const agent = new ToolLoopAgent({
    model: createModel(cfg.data, c.env),
    instructions: buildInstructions({
      name: p.name,
      domain: p.domain,
      theme: p.theme,
      customSlots: p.sprites.map((s) => s.slot),
      version: p.version,
    }),
    tools,
    stopWhen: isStepCount(MAX_STEPS),
    prepareStep: ({ messages }) => ({ messages: thinOldImages(messages) }),
  });

  let uiMessages: Awaited<ReturnType<typeof validateUIMessages>>;
  try {
    uiMessages = await validateUIMessages({ messages: [...(await listMessages(db, id)), parsed.data.message], tools });
  } catch (e) {
    return c.json(
      {
        error: `this conversation could not be read (${e instanceof Error ? e.message.slice(0, 200) : 'invalid'}); clear the chat and try again`,
      },
      409,
    );
  }
  await replaceMessages(db, id, uiMessages as never); // the person's message is kept even if the reply never finishes

  return createAgentUIStreamResponse({
    agent,
    uiMessages,
    originalMessages: uiMessages as never,
    abortSignal: c.req.raw.signal,
    timeout: { totalMs: MAX_MS },
    onError: (err) => describeError(err, cfg.data.apiKey),
    onEnd: async ({ messages }) => replaceMessages(db, id, messages as never),
  });
});
