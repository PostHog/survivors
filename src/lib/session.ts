// The admin session: a signed cookie holding who signed in with PostHog. It holds identity only, never a PostHog token.
import { cookies } from './gate';
import { signToken, verifyToken } from './token';

export interface User {
  email: string;
  name: string;
}
export const SESSION_COOKIE = 'session';
export const SESSION_TTL_S = 12 * 3600;
const PURPOSE = 'admin-session';

export const signSession = (secret: string, user: User) => signToken(secret, PURPOSE, user, SESSION_TTL_S);

export async function readSession(secret: string, req: Request): Promise<User | null> {
  const s = await verifyToken<User>(secret, PURPOSE, cookies(req.headers.get('Cookie'))[SESSION_COOKIE]);
  return s ? { email: s.email, name: s.name } : null;
}

/** A Set-Cookie value. `secure` is false only for http://localhost. */
export function cookie(name: string, value: string, opts: { maxAge: number; path?: string; secure: boolean }): string {
  return `${name}=${value}; Path=${opts.path ?? '/'}; Max-Age=${opts.maxAge}; HttpOnly; SameSite=Lax${opts.secure ? '; Secure' : ''}`;
}
