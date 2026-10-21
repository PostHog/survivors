import { and, asc, desc, eq, notInArray } from 'drizzle-orm';
import type { Db } from './client';
import { scores } from './schema';

export const KEEP = 20;

export interface Entry {
  id: number;
  name: string;
  score: number;
  stats: Record<string, number | string>;
  at: number;
}

const ranking = [desc(scores.score), asc(scores.at), asc(scores.id)]; // earlier entries win ties

export async function topScores(db: Db, board: string): Promise<Entry[]> {
  const rows = await db
    .select()
    .from(scores)
    .where(eq(scores.board, board))
    .orderBy(...ranking)
    .limit(KEEP)
    .all();
  return rows.map((r) => ({ id: r.id, name: r.name, score: r.score, stats: JSON.parse(r.stats), at: r.at }));
}

/** Adds a score and prunes the board back to its top KEEP, in one transaction. Returns the new entry's id. */
export async function addScore(db: Db, board: string, e: Omit<Entry, 'id'>): Promise<number> {
  const keep = db
    .select({ id: scores.id })
    .from(scores)
    .where(eq(scores.board, board))
    .orderBy(...ranking)
    .limit(KEEP);
  const [inserted] = await db.batch([
    db
      .insert(scores)
      .values({ board, name: e.name, score: e.score, stats: JSON.stringify(e.stats), at: e.at })
      .returning({ id: scores.id }),
    db.delete(scores).where(and(eq(scores.board, board), notInArray(scores.id, keep))),
  ]);
  return inserted[0].id;
}

export async function deleteScore(db: Db, board: string, id: number): Promise<void> {
  await db.delete(scores).where(and(eq(scores.board, board), eq(scores.id, id)));
}
