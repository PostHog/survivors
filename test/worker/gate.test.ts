import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/db/client';
import { prospects } from '../../src/db/schema';
import { call, seedProspect, uniqueSlug, unlock, withCookie } from './helpers';

afterEach(() => vi.useRealTimers());

describe('the password gate', () => {
  it('shows an anonymous visitor only a generic password page', async () => {
    const { slug } = await seedProspect();
    const res = await call(`/g/${slug}/`);
    const html = await res.text();
    expect(res.status).toBe(401);
    expect(html).toContain('name="password"');
    expect(html).not.toMatch(/ledgerly|phaser|bug survivors|<canvas|assets\//i); // nothing of the game, nothing naming the company
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  });

  it.each([
    'theme/theme.json',
    'theme/manifest.json',
    'theme/sprites/enemy_1.png',
    'assets/default/enemy_2.png',
    'guide.html',
    'index.html',
  ])('refuses %s without the password', async (file) => {
    const { slug } = await seedProspect({ withSprite: true });
    const res = await call(`/g/${slug}/${file}`);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('password required');
  });

  it('answers 404 the same way for a game that does not exist and for a malformed slug', async () => {
    const missing = await call(`/g/${uniqueSlug('nope')}/theme/theme.json`);
    const malformed = await call('/g/X/theme/theme.json');
    expect([missing.status, malformed.status]).toEqual([404, 404]);
    expect(await missing.text()).toBe(await malformed.text());
  });

  it('sends a bare /g/<slug> to the slash, because the game loads ./assets relative to it', async () => {
    const { slug } = await seedProspect();
    const res = await call(`/g/${slug}`, { redirect: 'manual' });
    expect(res.status).toBe(308);
    expect(res.headers.get('Location')).toBe(`/g/${slug}/`);
  });

  it('refuses a wrong password and says so', async () => {
    const { slug } = await seedProspect();
    const { res, cookie } = await unlock(slug, 'wrong-password');
    expect(res.status).toBe(401);
    expect(cookie).toBeNull();
    expect(await res.text()).toContain('Wrong password.');
  });

  it('accepts the right password however it is typed, and unlocks every file', async () => {
    const { slug } = await seedProspect({ withSprite: true });
    const { res, cookie } = await unlock(slug, '  Otter-MAPLE-42 ');
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe(`/g/${slug}/`);
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).toMatch(/Max-Age=604800/);
    expect(cookie).not.toBeNull();

    for (const file of ['', 'theme/theme.json', 'theme/manifest.json', 'theme/sprites/enemy_1.png']) {
      expect((await call(`/g/${slug}/${file}`, withCookie(cookie))).status, file).toBe(200);
    }
  });

  it('does not accept a forged, altered or foreign cookie', async () => {
    const a = await seedProspect();
    const b = await seedProspect();
    const { cookie } = await unlock(a.slug);
    const value = (cookie as string).split('=')[1];
    const [exp, sig] = value.split('.');

    expect((await call(`/g/${a.slug}/theme/theme.json`, withCookie(`pg_${a.slug}=${Number(exp) + 999}.${sig}`))).status).toBe(401); // longer expiry
    expect((await call(`/g/${a.slug}/theme/theme.json`, withCookie(`pg_${a.slug}=${exp}.${sig.slice(0, -2)}xx`))).status).toBe(401); // bad signature
    expect((await call(`/g/${a.slug}/theme/theme.json`, withCookie(`pg_${a.slug}=garbage`))).status).toBe(401);
    expect((await call(`/g/${b.slug}/theme/theme.json`, withCookie(`pg_${b.slug}=${value}`))).status).toBe(401); // game A's cookie on game B
  });

  it('stops honouring a cookie when the password is reset, or after a week', async () => {
    const { slug } = await seedProspect();
    const { cookie } = await unlock(slug);
    expect((await call(`/g/${slug}/theme/theme.json`, withCookie(cookie))).status).toBe(200);

    await getDb(env).update(prospects).set({ gateVersion: 2 }).where(eq(prospects.slug, slug)); // what a password reset does
    expect((await call(`/g/${slug}/theme/theme.json`, withCookie(cookie))).status).toBe(401);

    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() - 8 * 24 * 3600 * 1000 });
    const old = await seedProspect();
    const { cookie: aged } = await unlock(old.slug);
    vi.useRealTimers();
    expect((await call(`/g/${old.slug}/theme/theme.json`, withCookie(aged))).status).toBe(401);
  });

  it('allows five tries a minute, then makes the visitor wait', async () => {
    const { slug } = await seedProspect();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await unlock(slug, 'nope')).res.status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429]);
    expect((await unlock(slug)).res.status).toBe(429); // even the right password waits
  });

  it('keeps everything out of search engines and shared caches', async () => {
    const { slug } = await seedProspect({ withSprite: true });
    const { cookie } = await unlock(slug);
    for (const [file, init] of [
      ['', undefined],
      ['', withCookie(cookie)],
      ['theme/theme.json', withCookie(cookie)],
    ] as const) {
      const res = await call(`/g/${slug}/${file}`, init);
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
      expect(res.headers.get('Cache-Control')).toMatch(/private/);
    }
  });
});
