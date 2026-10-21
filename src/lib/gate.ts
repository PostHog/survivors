// The password gate in front of every prospect game. Nothing under /g/<slug>/ (the game, its theme, its sprites) and no
// leaderboard for that game is served until the visitor has the unlock cookie, which only a correct password earns.
import { fromB64, hmac, safeEqual, toB64 } from './crypto';

const enc = new TextEncoder();
const ITERATIONS = 100_000; // the most Workers' WebCrypto allows for PBKDF2
export const COOKIE_TTL_S = 7 * 24 * 3600;

/** Passwords are passed around in chat, so be forgiving about case and stray spaces. */
const normalise = (pw: string) => pw.trim().toLowerCase();

async function pbkdf2(pw: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(normalise(pw)), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

/** "pbkdf2$<iterations>$<salt>$<hash>" */
export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await pbkdf2(pw, salt, ITERATIONS))}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [kind, iter, salt, hash] = stored.split('$');
  if (kind !== 'pbkdf2' || !iter || !salt || !hash) return false;
  return safeEqual(await pbkdf2(pw, fromB64(salt), +iter), fromB64(hash));
}

const WORDS =
  'amber anchor apple arrow aspen badge beacon berry birch bison bloom bolt brook cactus candle canyon cedar cherry cliff clover cobalt comet copper coral cosmic crane crest daisy delta dune eagle ember falcon fern fiddle finch flint forest fox frost garnet ginger glacier granite harbor hazel heron honey indigo iris island ivory jade jasper juniper kayak kettle koala lagoon lantern lemon lilac lotus lunar maple marble meadow mint misty mocha moss nectar nimbus oak olive onyx orchid otter oyster panda pebble pepper pine plum pocket poppy quartz quill rabbit raven reef river robin saffron sage sand sierra silver sky sparrow spruce summit sunny tango thistle thunder tulip velvet violet walnut willow winter yarrow zephyr'.split(
    ' ',
  );

/** Three words and two digits, e.g. "otter-maple-coral-42": easy to read out, enough for a gift game behind a rate limit. */
export function generatePassword(): string {
  const r = crypto.getRandomValues(new Uint32Array(4));
  return `${WORDS[r[0] % WORDS.length]}-${WORDS[r[1] % WORDS.length]}-${WORDS[r[2] % WORDS.length]}-${String(r[3] % 100).padStart(2, '0')}`;
}

// ---- unlock cookie: "<expires>.<hmac(slug.expires.gateVersion)>", one per prospect, so a reset password signs everyone out ----

export const cookieName = (slug: string) => `pg_${slug}`;

export async function signUnlock(secret: string, slug: string, gateVersion: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + COOKIE_TTL_S;
  return `${exp}.${await hmac(secret, `unlock.${slug}.${exp}.${gateVersion}`)}`;
}

export async function verifyUnlock(secret: string, slug: string, gateVersion: number, value: string | undefined): Promise<boolean> {
  const [exp, sig] = (value ?? '').split('.');
  if (!exp || !sig || !(+exp > Date.now() / 1000)) return false;
  return safeEqual(enc.encode(sig), enc.encode(await hmac(secret, `unlock.${slug}.${exp}.${gateVersion}`)));
}

export function cookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
