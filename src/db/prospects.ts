import { and, desc, eq, like, sql } from 'drizzle-orm';
import type { Db } from './client';
import { messages, prospects, scores, sprites } from './schema';

/** Everything the gate and the theme files need, in one query. */
export async function findGateBySlug(db: Db, slug: string) {
  return db
    .select({
      id: prospects.id,
      slug: prospects.slug,
      passwordHash: prospects.passwordHash,
      gateVersion: prospects.gateVersion,
      version: prospects.version,
      theme: prospects.theme,
    })
    .from(prospects)
    .where(eq(prospects.slug, slug))
    .get();
}
export type GateRow = NonNullable<Awaited<ReturnType<typeof findGateBySlug>>>;

export async function listSpriteSlots(db: Db, prospectId: number): Promise<string[]> {
  const rows = await db.select({ slot: sprites.slot }).from(sprites).where(eq(sprites.prospectId, prospectId)).all();
  return rows.map((r) => r.slot);
}

export async function getSpriteGrid(db: Db, prospectId: number, slot: string): Promise<string | undefined> {
  const row = await db
    .select({ grid: sprites.grid })
    .from(sprites)
    .where(and(eq(sprites.prospectId, prospectId), eq(sprites.slot, slot)))
    .get();
  return row?.grid;
}

// ---- the admin side ----

export const SUMMARY = {
  id: prospects.id,
  slug: prospects.slug,
  name: prospects.name,
  domain: prospects.domain,
  ownerEmail: prospects.ownerEmail,
  version: prospects.version,
  createdAt: prospects.createdAt,
  updatedAt: prospects.updatedAt,
  hasLogo: sql<number>`EXISTS (SELECT 1 FROM sprites s WHERE s.prospect_id = ${prospects.id} AND s.slot = 'logo')`,
  spriteCount: sql<number>`(SELECT count(*) FROM sprites s WHERE s.prospect_id = ${prospects.id})`,
};

export async function listProspects(db: Db) {
  return db.select(SUMMARY).from(prospects).orderBy(desc(prospects.updatedAt)).all();
}

export async function getProspect(db: Db, id: number) {
  const row = await db
    .select({ ...SUMMARY, theme: prospects.theme })
    .from(prospects)
    .where(eq(prospects.id, id))
    .get();
  if (!row) return undefined;
  const drawn = await db.select({ slot: sprites.slot, grid: sprites.grid }).from(sprites).where(eq(sprites.prospectId, id)).all();
  return { ...row, theme: JSON.parse(row.theme) as Record<string, unknown>, sprites: drawn };
}

export async function slugTaken(db: Db, slug: string) {
  return (await db.select({ id: prospects.id }).from(prospects).where(eq(prospects.slug, slug)).get()) !== undefined;
}

export async function createProspect(
  db: Db,
  p: { slug: string; name: string; domain: string | null; ownerEmail: string; theme: object; passwordHash: string },
) {
  const now = Date.now();
  const [row] = await db
    .insert(prospects)
    .values({ ...p, theme: JSON.stringify(p.theme), createdAt: now, updatedAt: now })
    .returning({ id: prospects.id });
  return row.id;
}

/** Every change a person (or the agent) makes to a game bumps its version, which cache-busts the sprite URLs. */
const touch = () => ({ version: sql`${prospects.version} + 1`, updatedAt: Date.now() });

export async function setTheme(db: Db, id: number, fields: { theme: object; name?: string; domain?: string | null }) {
  await db
    .update(prospects)
    .set({
      theme: JSON.stringify(fields.theme),
      ...(fields.name !== undefined ? { name: fields.name } : {}),
      ...(fields.domain !== undefined ? { domain: fields.domain } : {}),
      ...touch(),
    })
    .where(eq(prospects.id, id));
}

export async function saveSprite(db: Db, id: number, slot: string, grid: string) {
  await db.batch([
    db
      .insert(sprites)
      .values({ prospectId: id, slot, grid })
      .onConflictDoUpdate({ target: [sprites.prospectId, sprites.slot], set: { grid } }),
    db.update(prospects).set(touch()).where(eq(prospects.id, id)),
  ]);
}

export async function removeSprite(db: Db, id: number, slot: string) {
  await db.batch([
    db.delete(sprites).where(and(eq(sprites.prospectId, id), eq(sprites.slot, slot))),
    db.update(prospects).set(touch()).where(eq(prospects.id, id)),
  ]);
}

/** A new password signs everyone out of the old one (gate_version). */
export async function setPassword(db: Db, id: number, passwordHash: string) {
  await db
    .update(prospects)
    .set({ passwordHash, gateVersion: sql`${prospects.gateVersion} + 1`, updatedAt: Date.now() })
    .where(eq(prospects.id, id));
}

/** Deletes a game and everything that belongs to it: its sprites and chat (by cascade) and its leaderboards. */
export async function deleteProspect(db: Db, id: number, slug: string) {
  await db.batch([db.delete(scores).where(like(scores.board, `${slug}:%`)), db.delete(prospects).where(eq(prospects.id, id))]);
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: unknown[];
}

export async function listMessages(db: Db, id: number): Promise<StoredMessage[]> {
  const rows = await db.select().from(messages).where(eq(messages.prospectId, id)).orderBy(messages.seq).all();
  return rows.map((r) => ({ id: r.messageId, role: r.role as StoredMessage['role'], parts: JSON.parse(r.parts) }));
}

/** Replaces a game's whole conversation (the chat library hands back the full message list when a turn ends). */
export async function replaceMessages(db: Db, id: number, all: StoredMessage[]) {
  const now = Date.now();
  const rows = all.map((m, seq) => ({
    prospectId: id,
    seq,
    messageId: m.id,
    role: m.role,
    parts: JSON.stringify(m.parts),
    createdAt: now,
  }));
  const clear = db.delete(messages).where(eq(messages.prospectId, id));
  // D1 limits the variables in one statement, so write the rows in small groups, all in one batch (one transaction).
  const inserts = [];
  for (let i = 0; i < rows.length; i += 10) inserts.push(db.insert(messages).values(rows.slice(i, i + 10)));
  await db.batch([clear, ...inserts] as never);
}

export async function clearMessages(db: Db, id: number) {
  await db.delete(messages).where(eq(messages.prospectId, id));
}
