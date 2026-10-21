// Signed, expiring JSON tokens for cookies. Each carries a purpose that is part of what is signed, so a token minted for one thing
// (an admin session) can never be replayed as another (the OAuth state cookie).
import { fromB64Url, hmac, safeEqual, toB64Url } from './crypto';

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function signToken(secret: string, purpose: string, payload: object, ttlSeconds: number): Promise<string> {
  const body = toB64Url(enc.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })));
  return `${body}.${await hmac(secret, `${purpose}.${body}`)}`;
}

export async function verifyToken<T extends object>(
  secret: string,
  purpose: string,
  token: string | undefined,
): Promise<(T & { exp: number }) | null> {
  const [body, sig] = (token ?? '').split('.');
  if (!body || !sig) return null;
  if (!safeEqual(enc.encode(sig), enc.encode(await hmac(secret, `${purpose}.${body}`)))) return null;
  try {
    const payload = JSON.parse(dec.decode(fromB64Url(body))) as T & { exp: number };
    return typeof payload.exp === 'number' && payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}
