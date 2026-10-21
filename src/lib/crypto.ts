// Small WebCrypto helpers shared by everything that signs or compares secrets (unlock cookies, admin sessions, OAuth state).
const enc = new TextEncoder();

export const toB64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const toB64Url = (b: ArrayBuffer | Uint8Array) => toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64Url = (s: string) => fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

/** Constant-time comparison. */
export function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/** HMAC-SHA256 of msg, base64url. */
export async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toB64Url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

export const randomToken = (bytes = 32) => toB64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256B64Url(s: string): Promise<string> {
  return toB64Url(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
