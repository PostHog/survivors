import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index';
import { fromB64Url } from '../../src/lib/crypto';
import { call, ORIGIN, sessionCookie } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const jar = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
const cookieNamed = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`)) ?? '';
const payload = (cookie: string) => JSON.parse(new TextDecoder().decode(fromB64Url(cookie.split('=')[1].split('.')[0])));

/** Stands in for PostHog's token and userinfo endpoints. */
function mockPostHog(userinfo: Record<string, unknown> | 'refuse-token' | 'refuse-userinfo') {
  const calls: { url: string; body?: URLSearchParams; auth?: string | null }[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'https://oauth.posthog.com/oauth/token/') {
      calls.push({ url, body: new URLSearchParams(init?.body as URLSearchParams) });
      return userinfo === 'refuse-token'
        ? new Response('{"error":"invalid_grant"}', { status: 400 })
        : Response.json({ access_token: 'pha_test', token_type: 'Bearer' });
    }
    if (url === 'https://oauth.posthog.com/oauth/userinfo/') {
      calls.push({ url, auth: new Headers(init?.headers).get('Authorization') });
      return userinfo === 'refuse-userinfo' ? new Response('no', { status: 401 }) : Response.json(userinfo);
    }
    return real(input, init);
  });
  return calls;
}

/** Starts a sign-in and returns what the browser would hold: the transaction cookie, state and where PostHog was asked to go. */
async function startLogin(next?: string) {
  const res = await call(`/oauth/login${next ? `?next=${encodeURIComponent(next)}` : ''}`, { redirect: 'manual' });
  const tx = cookieNamed(res, 'oauth_tx').split(';')[0];
  return { res, tx, authorize: new URL(res.headers.get('Location') as string) };
}
const callback = (tx: string, params: Record<string, string>) =>
  call(`/oauth/callback?${new URLSearchParams(params)}`, { headers: { Cookie: tx }, redirect: 'manual' });

describe('our PostHog client identity', () => {
  it('serves the metadata document PostHog fetches at client_id, which names itself and its one redirect URI', async () => {
    const res = await call('/oauth/client.json');
    const doc = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(doc).toMatchObject({
      client_id: `${ORIGIN}/oauth/client.json`,
      redirect_uris: [`${ORIGIN}/oauth/callback`],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    });
    expect(doc.client_name).toBeTruthy();
    expect(doc.scope).toBe('openid email');
    // PostHog rejects a document whose com.posthog.scopes holds no PostHog API scope (openid and email aren't any).
    expect(doc).not.toHaveProperty(['com.posthog']);
  });
});

describe('starting a sign-in', () => {
  it('sends the browser to PostHog with PKCE (S256) and a state that only this browser can complete', async () => {
    const { res, tx, authorize } = await startLogin();
    expect(res.status).toBe(303);
    expect(`${authorize.origin}${authorize.pathname}`).toBe('https://oauth.posthog.com/oauth/authorize/');
    const q = authorize.searchParams;
    expect(Object.fromEntries(q)).toMatchObject({
      response_type: 'code',
      client_id: `${ORIGIN}/oauth/client.json`,
      redirect_uri: `${ORIGIN}/oauth/callback`,
      scope: 'openid email',
      code_challenge_method: 'S256',
    });
    const { state, verifier } = payload(tx);
    expect(q.get('state')).toBe(state);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    expect(q.get('code_challenge')).toBe(
      btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, ''),
    );
    expect(verifier.length).toBeGreaterThanOrEqual(43); // RFC 7636's minimum
    const set = cookieNamed(res, 'oauth_tx');
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Path=\/oauth/);
    expect(set).toMatch(/Max-Age=600/);
  });

  it('uses a fresh state and verifier every time', async () => {
    const a = payload((await startLogin()).tx);
    const b = payload((await startLogin()).tx);
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
  });

  it.each([
    ['/admin/prospects/3', '/admin/prospects/3'],
    ['/admin?tab=x', '/admin?tab=x'],
    ['https://evil.example/', '/admin'],
    ['//evil.example/', '/admin'],
    ['/\\evil.example', '/admin'],
    ['javascript:alert(1)', '/admin'],
  ])('only returns to a path on this site: %s -> %s', async (asked, wanted) => {
    expect(payload((await startLogin(asked)).tx).next).toBe(wanted);
  });
});

describe('finishing a sign-in', () => {
  const ok = { sub: 'u1', email: 'jane@posthog.com', email_verified: true, given_name: 'Jane', family_name: 'Doe' };

  it('signs in a verified @posthog.com address: exchanges the code with the verifier, reads userinfo, sets a session', async () => {
    const calls = mockPostHog(ok);
    const { tx } = await startLogin('/admin/prospects/3');
    const { verifier, state } = payload(tx);
    const res = await callback(tx, { code: 'the-code', state });

    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/admin/prospects/3');
    expect(calls[0].body && Object.fromEntries(calls[0].body)).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: `${ORIGIN}/oauth/callback`,
      client_id: `${ORIGIN}/oauth/client.json`,
      code_verifier: verifier,
    });
    expect(calls[1].auth).toBe('Bearer pha_test');
    const session = cookieNamed(res, 'session');
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(session).toMatch(/Max-Age=43200/);
    expect(cookieNamed(res, 'oauth_tx')).toMatch(/Max-Age=0/); // a transaction is single use
    expect(JSON.stringify(payload(session.split(';')[0]))).not.toContain('pha_'); // the PostHog token is not kept

    const me = await call('/api/me', { headers: { Cookie: jar(res) } });
    expect(await me.json()).toMatchObject({ email: 'jane@posthog.com', name: 'Jane Doe' });
  });

  it('accepts any capitalisation of the address', async () => {
    mockPostHog({ ...ok, email: ' Jane@PostHog.COM ' });
    const { tx } = await startLogin();
    const res = await callback(tx, { code: 'c', state: payload(tx).state });
    expect(res.status).toBe(303);
    const me = await call('/api/me', { headers: { Cookie: jar(res) } });
    expect(((await me.json()) as { email: string }).email).toBe('jane@posthog.com');
  });

  it.each([
    ['an address that is not verified', { ...ok, email_verified: false }],
    ['an address with no verification claim', { sub: 'u', email: 'jane@posthog.com' }],
    ['another domain', { ...ok, email: 'jane@gmail.com' }],
    ['a lookalike domain', { ...ok, email: 'jane@notposthog.com' }],
    ['a domain that merely contains posthog.com', { ...ok, email: 'jane@posthog.com.evil.example' }],
    ['a subdomain of posthog.com', { ...ok, email: 'jane@eu.posthog.com' }],
    ['a posthog.com local part at another domain', { ...ok, email: 'jane@posthog.com@evil.example' }],
    ['no email at all', { sub: 'u', email_verified: true }],
    ['an email that is not a string', { ...ok, email: ['jane@posthog.com'] }],
  ])('refuses %s', async (_what, info) => {
    mockPostHog(info);
    const { tx } = await startLogin();
    const res = await callback(tx, { code: 'c', state: payload(tx).state });
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie().some((c) => c.startsWith('session=') && !/Max-Age=0/.test(c))).toBe(false);
    expect(await res.text()).toContain('PostHog accounts only');
  });

  it('refuses a callback whose state is not the one this browser started', async () => {
    mockPostHog(ok);
    const { tx } = await startLogin();
    expect((await callback(tx, { code: 'c', state: 'someone-elses-state' })).status).toBe(403);
    expect((await callback(tx, { code: 'c' })).status).toBe(403);
  });

  it('refuses a callback with no transaction cookie, a forged one, or one signed for another purpose', async () => {
    mockPostHog(ok);
    const { tx } = await startLogin();
    const { state } = payload(tx);
    expect((await call(`/oauth/callback?code=c&state=${state}`, { redirect: 'manual' })).status).toBe(403);
    expect((await callback('oauth_tx=eyJzdGF0ZSI6IngifQ.forged', { code: 'c', state })).status).toBe(403);
    // an admin session cookie, presented as the transaction, must not verify (tokens are bound to their purpose)
    const asTx = (await sessionCookie()).replace('session=', 'oauth_tx=');
    expect((await callback(asTx, { code: 'c', state })).status).toBe(403);
  });

  it('refuses a stale transaction', async () => {
    mockPostHog(ok);
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() - 11 * 60 * 1000 });
    const { tx } = await startLogin();
    vi.useRealTimers();
    expect((await callback(tx, { code: 'c', state: payload(tx).state })).status).toBe(403);
  });

  it('says so when PostHog refuses the code, or the person cancels, and signs nobody in', async () => {
    const { tx } = await startLogin();
    const { state } = payload(tx);
    mockPostHog('refuse-token');
    const refused = await callback(tx, { code: 'bad', state });
    expect(refused.status).toBe(403);
    expect(await refused.text()).toContain('Sign-in failed');

    mockPostHog('refuse-userinfo');
    expect((await callback(tx, { code: 'c', state })).status).toBe(403);

    const cancelled = await callback(tx, { error: 'access_denied', state });
    expect(cancelled.status).toBe(403);
    expect(await cancelled.text()).toContain('Sign-in cancelled');
  });
});

describe('the session', () => {
  it('is required by the API, and by /admin, which sends people to sign in and back', async () => {
    const api = await call('/api/me');
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: 'sign in required' });
    const adminPage = await call('/admin/prospects/3?tab=chat', { redirect: 'manual' });
    expect(adminPage.status).toBe(303);
    expect(adminPage.headers.get('Location')).toBe('/oauth/login?next=%2Fadmin%2Fprospects%2F3%3Ftab%3Dchat');
  });

  it('is not accepted when altered, forged, expired, or minted for another purpose', async () => {
    const good = await sessionCookie();
    const [name, value] = [good.split('=')[0], good.split('=')[1]];
    const [body, sig] = value.split('.');
    const forgedBody = btoa(JSON.stringify({ email: 'boss@posthog.com', name: 'x', exp: 9999999999 })).replace(/=+$/, '');
    for (const cookie of [`${name}=${forgedBody}.${sig}`, `${name}=${body}.${sig.slice(0, -2)}xx`, `${name}=garbage`, `${name}=`]) {
      expect((await call('/api/me', { headers: { Cookie: cookie } })).status, cookie).toBe(401);
    }
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() - 13 * 3600 * 1000 });
    const old = await sessionCookie();
    vi.useRealTimers();
    expect((await call('/api/me', { headers: { Cookie: old } })).status).toBe(401);
  });

  it('refuses changes that come from another site', async () => {
    const cookie = await sessionCookie();
    const cross = await call('/api/me', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example' } });
    expect(cross.status).toBe(403);
    const sec = await call('/api/me', { method: 'POST', headers: { Cookie: cookie, 'Sec-Fetch-Site': 'cross-site' } });
    expect(sec.status).toBe(403);
  });

  it('ends on logout, which only accepts a POST', async () => {
    expect((await call('/oauth/logout')).status).toBe(404);
    const res = await call('/oauth/logout', { method: 'POST', redirect: 'manual' });
    expect(res.status).toBe(303);
    expect(cookieNamed(res, 'session')).toMatch(/Max-Age=0/);
  });
});

describe('local development sign-in', () => {
  const dev = (url: string) =>
    app.fetch(new Request(url, { redirect: 'manual' }), { ...env, DEV_LOGIN_EMAIL: 'Dev@PostHog.com' } as typeof env);

  it('signs the configured person straight in on localhost', async () => {
    const res = await dev('http://localhost:8787/oauth/login?next=/admin/x');
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/admin/x');
    expect(cookieNamed(res, 'session')).not.toMatch(/Secure/); // plain http on localhost
    const me = await app.fetch(new Request('http://localhost:8787/api/me', { headers: { Cookie: jar(res) } }), env);
    expect(await me.json()).toEqual({ email: 'dev@posthog.com', name: 'dev@posthog.com', analytics: null }); // a developer's own use is not analytics
  });

  it('does nothing anywhere else, even if it is configured by mistake: it goes to PostHog as usual', async () => {
    const res = await dev(`${ORIGIN}/oauth/login`);
    expect(res.headers.get('Location')).toMatch(/^https:\/\/oauth\.posthog\.com\/oauth\/authorize\//);
    expect(cookieNamed(res, 'session')).toBe('');
  });
});
