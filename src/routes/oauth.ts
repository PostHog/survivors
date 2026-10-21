// Signing in. /oauth/client.json is our PostHog client identity, /oauth/login starts the flow, /oauth/callback finishes it.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { safeEqual } from '../lib/crypto';
import { cookies } from '../lib/gate';
import { allowedEmail, clientMetadata, displayName, fetchUser, SignInError, startAuthorization } from '../lib/posthog-oauth';
import { cookie, SESSION_COOKIE, SESSION_TTL_S, signSession } from '../lib/session';
import { signToken, verifyToken } from '../lib/token';

const TX_COOKIE = 'oauth_tx';
const TX_TTL_S = 600;
const TX_PURPOSE = 'oauth-state';
const enc = new TextEncoder();

/** Where to go after signing in: a path on this site, never another site. */
export function safeNext(next: string | undefined): string {
  return next && /^\/(?![/\\])/.test(next) && !next.includes('\n') ? next : '/admin';
}

const isLocalhost = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1';

const page = (title: string, body: string, status: 200 | 403 = 403) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>html,body{height:100%;margin:0;font:16px/1.5 system-ui,sans-serif;background:#15141f;color:#eee}body{display:grid;place-items:center}main{max-width:420px;padding:24px}a{color:#f9bd2b}</style></head>
<body><main><h1>${title}</h1>${body}</main></body></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      },
    },
  );

export const oauth = new Hono<AppEnv>();

// The document PostHog fetches to learn who we are. Short cache: PostHog caches it by max-age, and a changed redirect URI must not linger.
oauth.get('/client.json', (c) =>
  c.json(clientMetadata(new URL(c.req.url).origin), 200, { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' }),
);

oauth.get('/login', async (c) => {
  const url = new URL(c.req.url);
  const next = safeNext(c.req.query('next'));
  const secure = url.protocol === 'https:';

  // Local development can't be reached by PostHog (it must fetch our client.json), so a developer sets DEV_LOGIN_EMAIL in .dev.vars.
  // It only ever works on localhost, so setting it by accident in production does nothing.
  if (c.env.DEV_LOGIN_EMAIL && isLocalhost(url)) {
    const email = c.env.DEV_LOGIN_EMAIL.toLowerCase();
    const session = await signSession(c.env.SESSION_SECRET, { email, name: email });
    c.header('Set-Cookie', cookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL_S, secure }));
    return c.redirect(next, 303);
  }

  const { state, verifier, url: authorize } = await startAuthorization(url.origin);
  const tx = await signToken(c.env.SESSION_SECRET, TX_PURPOSE, { state, verifier, next }, TX_TTL_S);
  c.header('Set-Cookie', cookie(TX_COOKIE, tx, { maxAge: TX_TTL_S, path: '/oauth', secure }));
  return c.redirect(authorize, 303);
});

oauth.get('/callback', async (c) => {
  const url = new URL(c.req.url);
  const secure = url.protocol === 'https:';
  const clearTx = cookie(TX_COOKIE, '', { maxAge: 0, path: '/oauth', secure });
  const fail = (title: string, message: string) => {
    const res = page(title, `<p>${message}</p><p><a href="/oauth/login">Try again</a></p>`);
    res.headers.append('Set-Cookie', clearTx);
    return res;
  };

  const tx = await verifyToken<{ state: string; verifier: string; next: string }>(
    c.env.SESSION_SECRET,
    TX_PURPOSE,
    cookies(c.req.header('Cookie') ?? null)[TX_COOKIE],
  );
  const state = c.req.query('state') ?? '';
  if (!tx || !safeEqual(enc.encode(state), enc.encode(tx.state)))
    return fail('Sign-in expired', 'That sign-in did not start here, or took too long.');
  const code = c.req.query('code');
  if (c.req.query('error') || !code) return fail('Sign-in cancelled', 'PostHog did not complete the sign-in.');

  try {
    const info = await fetchUser(url.origin, code, tx.verifier);
    const email = allowedEmail(info);
    if (!email) {
      return fail('PostHog accounts only', 'Sign in with a verified @posthog.com account. This game maker is for the PostHog team.');
    }
    const session = await signSession(c.env.SESSION_SECRET, { email, name: displayName(info, email) });
    const res = c.redirect(safeNext(tx.next), 303);
    res.headers.append('Set-Cookie', cookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL_S, secure }));
    res.headers.append('Set-Cookie', clearTx);
    return res;
  } catch (e) {
    if (e instanceof SignInError) return fail('Sign-in failed', e.message);
    throw e;
  }
});

// A form POST, not a link, so another site can't sign you out by embedding an image.
oauth.post('/logout', (c) => {
  c.header('Set-Cookie', cookie(SESSION_COOKIE, '', { maxAge: 0, secure: new URL(c.req.url).protocol === 'https:' }));
  return c.redirect('/', 303);
});
