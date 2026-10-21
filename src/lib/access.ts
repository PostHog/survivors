// "Has this visitor entered the right password for this prospect?" Shared by the game routes and the leaderboard routes.
import type { GateRow } from '../db/prospects';
import type { Env } from '../env';
import { cookieName, cookies, verifyUnlock } from './gate';
import { readSession } from './session';

export function hasUnlocked(env: Pick<Env, 'SESSION_SECRET'>, req: Request, row: Pick<GateRow, 'slug' | 'gateVersion'>): Promise<boolean> {
  return verifyUnlock(env.SESSION_SECRET, row.slug, row.gateVersion, cookies(req.headers.get('Cookie'))[cookieName(row.slug)]);
}

/** May this request see this game? Whoever has its password, or any signed-in PostHog person (the admin preview needs no password). */
export async function canView(
  env: Pick<Env, 'SESSION_SECRET'>,
  req: Request,
  row: Pick<GateRow, 'slug' | 'gateVersion'>,
): Promise<boolean> {
  return (await hasUnlocked(env, req, row)) || (await readSession(env.SESSION_SECRET, req)) !== null;
}
