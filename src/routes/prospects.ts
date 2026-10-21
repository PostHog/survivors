// /api/prospects: making a game for a company, editing its theme and sprites, its password, its leaderboards, deleting it.
// Everyone on the PostHog team can see and change every game: this is a shared tool, and each game records who made it.
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import {
  createProspect,
  deleteProspect,
  getProspect,
  listProspects,
  removeSprite,
  saveSprite,
  setPassword,
  setTheme,
  slugTaken,
} from '../db/prospects';
import { deleteScore, topScores } from '../db/scores';
import type { AuthedEnv } from '../env';
import { generatePassword, hashPassword } from '../lib/gate';
import { validate } from '../lib/http';
import { isEditable } from '../lib/kit';
import { newSlug } from '../lib/slug';
import { checkSprite } from '../lib/sprite-check';
import { newTheme, validateTheme } from '../lib/theme';
import { chat } from './chat';

const id = z.coerce.number().int().positive();

/** "https://www.Acme.com/pricing" -> "www.acme.com". A company's domain as people paste it. */
const domain = z
  .string()
  .trim()
  .transform((s) =>
    s
      .replace(/^[a-z]+:\/\//i, '')
      .replace(/[/?#].*$/, '')
      .toLowerCase(),
  )
  .pipe(
    z
      .string()
      .max(60, 'at most 60 characters')
      .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/, 'a domain like acme.com'),
  );

const name = z.string().trim().min(1, 'a company name is required').max(40, 'at most 40 characters');
const password = z.string().trim().min(6, 'at least 6 characters').max(60, 'at most 60 characters');

const slotParam = z.object({ id, slot: z.string().regex(/^[a-z0-9_]+$/) });

export const prospects = new Hono<AuthedEnv>();
prospects.route('/', chat); // /:id/chat and /:id/messages

const urlOf = (c: { req: { url: string } }, slug: string) => `${new URL(c.req.url).origin}/g/${slug}/`;
const notFound = (c: { json: (b: unknown, s: 404) => Response }) => c.json({ error: 'no such game' }, 404);

prospects.get('/', async (c) => c.json({ prospects: await listProspects(getDb(c.env)) }));

prospects.post('/', validate('json', z.object({ name, domain: domain.nullish(), password: password.optional() })), async (c) => {
  const db = getDb(c.env);
  const input = c.req.valid('json');
  const theme = newTheme(input.name, input.domain);
  const pw = input.password ?? generatePassword();

  // The random part of the slug makes a link unguessable; a clash is astronomically unlikely but costs one retry to rule out.
  let slug = newSlug(input.name);
  for (let i = 0; i < 3 && (await slugTaken(db, slug)); i++) slug = newSlug(input.name);

  const newId = await createProspect(db, {
    slug,
    name: input.name,
    domain: input.domain ?? null,
    ownerEmail: c.var.user.email,
    theme,
    passwordHash: await hashPassword(pw),
  });
  // The password is shown once, here: only its hash is kept.
  return c.json({ prospect: await getProspect(db, newId), password: pw, url: urlOf(c, slug) }, 201);
});

prospects.get('/:id', validate('param', z.object({ id })), async (c) => {
  const p = await getProspect(getDb(c.env), c.req.valid('param').id);
  return p ? c.json({ prospect: p, url: urlOf(c, p.slug) }) : notFound(c);
});

// Renaming changes the fixed fields of the theme too (the theme may not contradict its prospect).
prospects.patch(
  '/:id',
  validate('param', z.object({ id })),
  validate('json', z.object({ name: name.optional(), domain: domain.nullable().optional() })),
  async (c) => {
    const db = getDb(c.env);
    const p = await getProspect(db, c.req.valid('param').id);
    if (!p) return notFound(c);
    const patch = c.req.valid('json');
    const next = { name: patch.name ?? p.name, domain: patch.domain === undefined ? p.domain : patch.domain };
    const checked = validateTheme(p.theme, next);
    if (!checked.ok) return c.json({ error: 'the theme has problems with that name', problems: checked.problems }, 422);
    await setTheme(db, p.id, { theme: checked.theme, name: next.name, domain: next.domain });
    return c.json({ prospect: await getProspect(db, p.id) });
  },
);

prospects.put('/:id/theme', validate('param', z.object({ id })), validate('json', z.object({ theme: z.unknown() })), async (c) => {
  const db = getDb(c.env);
  const p = await getProspect(db, c.req.valid('param').id);
  if (!p) return notFound(c);
  const checked = validateTheme(c.req.valid('json').theme, { name: p.name, domain: p.domain });
  if (!checked.ok) return c.json({ error: 'the theme has problems', problems: checked.problems }, 422);
  await setTheme(db, p.id, { theme: checked.theme });
  return c.json({ prospect: await getProspect(db, p.id) });
});

prospects.put('/:id/sprites/:slot', validate('param', slotParam), validate('json', z.object({ grid: z.string() })), async (c) => {
  const db = getDb(c.env);
  const { id: pid, slot } = c.req.valid('param');
  if (!(await getProspect(db, pid))) return notFound(c);
  const checked = checkSprite(slot, c.req.valid('json').grid);
  if (!checked.ok) return c.json({ error: 'the sprite has problems', problems: checked.problems }, 422);
  await saveSprite(db, pid, slot, checked.grid);
  return c.json({ prospect: await getProspect(db, pid) });
});

// Back to the kit's default art for that slot.
prospects.delete('/:id/sprites/:slot', validate('param', slotParam), async (c) => {
  const db = getDb(c.env);
  const { id: pid, slot } = c.req.valid('param');
  if (!(await getProspect(db, pid))) return notFound(c);
  if (!isEditable(slot)) return c.json({ error: `slot "${slot}" cannot be redrawn` }, 400);
  await removeSprite(db, pid, slot);
  return c.json({ prospect: await getProspect(db, pid) });
});

// Resets the password (a new one is generated unless one is given) and signs everyone out of the old one. Shown once.
prospects.post(
  '/:id/password',
  validate('param', z.object({ id })),
  validate('json', z.object({ password: password.optional() })),
  async (c) => {
    const db = getDb(c.env);
    const p = await getProspect(db, c.req.valid('param').id);
    if (!p) return notFound(c);
    const pw = c.req.valid('json').password ?? generatePassword();
    await setPassword(db, p.id, await hashPassword(pw));
    return c.json({ password: pw, url: urlOf(c, p.slug) });
  },
);

prospects.delete('/:id', validate('param', z.object({ id })), async (c) => {
  const db = getDb(c.env);
  const p = await getProspect(db, c.req.valid('param').id);
  if (!p) return notFound(c);
  await deleteProspect(db, p.id, p.slug);
  return c.json({ deleted: p.slug });
});

const mode = z.string().regex(/^[a-z0-9-]{1,24}$/);

prospects.get('/:id/leaderboard/:mode', validate('param', z.object({ id, mode })), async (c) => {
  const db = getDb(c.env);
  const { id: pid, mode: m } = c.req.valid('param');
  const p = await getProspect(db, pid);
  return p ? c.json({ top: await topScores(db, `${p.slug}:${m}`) }) : notFound(c);
});

prospects.delete('/:id/leaderboard/:mode/:entry', validate('param', z.object({ id, mode, entry: id })), async (c) => {
  const db = getDb(c.env);
  const { id: pid, mode: m, entry } = c.req.valid('param');
  const p = await getProspect(db, pid);
  if (!p) return notFound(c);
  await deleteScore(db, `${p.slug}:${m}`, entry);
  return c.json({ top: await topScores(db, `${p.slug}:${m}`) });
});
