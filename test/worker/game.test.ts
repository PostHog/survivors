import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import site from '../../game/site.json';
import { getDb } from '../../src/db/client';
import { sprites } from '../../src/db/schema';
import csp from '../../src/generated/csp.json';
import { DEFAULT_SLOT_IDS } from '../../src/lib/default-art';
import { asUser, call, seedProspect, sessionCookie, unlock, withCookie } from './helpers';

const unlocked = async (opts: Parameters<typeof seedProspect>[0] = {}) => {
  const p = await seedProspect(opts);
  const { cookie } = await unlock(p.slug);
  const get = (file: string, init: RequestInit = {}) => call(`/g/${p.slug}/${file}`, { ...withCookie(cookie), ...init });
  return { ...p, get };
};

type Manifest = { slug: string; sprites: Record<string, string> } & Record<string, unknown>;

describe('serving an unlocked game', () => {
  it('serves the game page with the strict policy and no shared caching', async () => {
    const { get } = await unlocked();
    const res = await get('');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<div id="game">');
    expect(res.headers.get('Content-Security-Policy')).toBe(csp.game);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it("takes the public page's search tags out of a prospect's game and guide", async () => {
    const { get } = await unlocked();
    for (const file of ['', 'guide.html']) {
      const res = await get(file);
      const html = await res.text();
      expect(res.headers.get('X-Robots-Tag'), file).toBe('noindex, nofollow, noarchive');
      expect(html, file).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
      expect(html, file).not.toContain('data-seo');
      expect(html, file).not.toContain('application/ld+json');
      expect(html, file).not.toContain('rel="canonical"');
      expect(html, file).not.toContain('og:image');
      expect(html, file).not.toContain('<h1>Bug Survivors</h1>');
      expect(html, file).not.toContain('index, follow');
    }
    expect(await (await get('')).text()).toContain('<title>Bug Survivors</title>'); // not the home page's, until the theme sets its own
  });

  it('answers HEAD', async () => {
    const { get } = await unlocked();
    expect((await get('', { method: 'HEAD' })).status).toBe(200);
  });

  it('serves the theme from D1, exactly as stored', async () => {
    const { get, theme } = await unlocked();
    const res = await get('theme/theme.json');
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.json()).toEqual(theme);
  });

  it('lists every slot in the manifest, versioned, so the whole game takes the brand colours', async () => {
    const plain = await unlocked();
    const m = (await (await plain.get('theme/manifest.json')).json()) as Manifest;
    expect({ ...m, sprites: undefined }).toEqual({
      slug: plain.slug,
      kit: 'bug-survivors',
      music: null,
      posthog: site.posthog,
      draft: false,
    });
    expect(Object.keys(m.sprites).sort()).toEqual([...DEFAULT_SLOT_IDS].sort()); // no logo: that slot is optional and has no default
    expect(m.sprites.enemy_1).toBe('theme/sprites/enemy_1.png?v=1');

    const drawn = await unlocked({ withSprite: true, version: 7 });
    const withDrawn = (await (await drawn.get('theme/manifest.json')).json()) as Manifest;
    expect(withDrawn.sprites.enemy_1).toBe('theme/sprites/enemy_1.png?v=7');
  });

  it('lists a hand-drawn logo, which has no default art, only when one exists', async () => {
    const p = await seedProspect();
    await getDb(env).insert(sprites).values({ prospectId: p.id, slot: 'logo', grid: 'size 2x2\nlegend\n  a #ff0000\nframe\naa\naa\n' });
    const { cookie } = await unlock(p.slug);
    const m = (await (await call(`/g/${p.slug}/theme/manifest.json`, withCookie(cookie))).json()) as Manifest;
    expect(m.sprites.logo).toBe('theme/sprites/logo.png?v=1');

    const plain = await unlocked();
    expect(((await (await plain.get('theme/manifest.json')).json()) as Manifest).sprites.logo).toBeUndefined();
  });

  it('renders a stored sprite grid to a PNG the size of its sheet', async () => {
    const { get } = await unlocked({ withSprite: true });
    const res = await get('theme/sprites/enemy_1.png?v=1');
    const png = new Uint8Array(await res.arrayBuffer());
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); // PNG signature
    const dv = new DataView(png.buffer);
    expect([dv.getUint32(16), dv.getUint32(20)]).toEqual([32, 16]); // 2 frames of 16x16, side by side
  });

  it("renders the default art in the prospect's colours for a slot nobody redrew, and 404s a slot that does not exist", async () => {
    const { get } = await unlocked();
    const res = await get('theme/sprites/boss.png');
    expect(res.status).toBe(200);
    const dv = new DataView(await res.arrayBuffer());
    expect([dv.getUint32(16), dv.getUint32(20)]).toEqual([128, 64]); // 2 frames of 64x64
    expect((await get('theme/sprites/nope.png')).status).toBe(404);
    expect((await get('theme/sprites/logo.png')).status).toBe(404); // the optional logo has no default
  });

  it('serves the bundle: hashed files for a year, everything else revalidated, all under the policy', async () => {
    const { get } = await unlocked();
    const html = await (await get('')).text();
    const bundle = /assets\/index-[\w-]+\.js/.exec(html)?.[0];
    expect(bundle, 'the page references the hashed bundle').toBeTruthy();

    const js = await get(bundle as string);
    expect(js.status).toBe(200);
    expect(js.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    expect(js.headers.get('Content-Security-Policy')).toBe(csp.game);

    const art = await get('assets/default/enemy_2.png');
    expect(art.status).toBe(200);
    expect(art.headers.get('Cache-Control')).toBe('private, no-cache');

    expect((await get('assets/nope.png')).status).toBe(404);
  });

  it("lets the game load PostHog's analytics script from the one host it is configured for, and nothing else", () => {
    expect(site.posthog?.key).toBeTruthy();
    const assetsHost = (site.posthog?.host ?? 'https://us.i.posthog.com').replace('.i.posthog.com', '-assets.i.posthog.com');
    expect(csp.game).toContain(`script-src 'self' ${assetsHost};`);
    expect(csp.guide).not.toContain(assetsHost); // the guide runs no analytics
    expect(csp.guide).not.toContain('posthog');
    expect(csp.game).not.toMatch(/script-src[^;]*\*/);
  });

  describe('analytics', () => {
    const posthogOf = async (res: Response) => ((await res.json()) as Manifest).posthog;

    it('go to PostHog for a visitor who has the password: the manifest names the project and the page may talk to it', async () => {
      const { get } = await unlocked();
      expect(await posthogOf(await get('theme/manifest.json'))).toEqual(site.posthog);
      expect((await get('')).headers.get('Content-Security-Policy')).toBe(csp.game);
    });

    it('never happen for a signed-in team member: no project in the manifest, and a page that could not reach PostHog anyway', async () => {
      const p = await seedProspect();
      const staff = await asUser('jane@posthog.com');
      const manifest = await call(`/g/${p.slug}/theme/manifest.json`, staff); // the admin's live preview loads the game like this
      expect(manifest.status).toBe(200);
      expect(await posthogOf(manifest)).toBeNull();
      const page = await call(`/g/${p.slug}/`, staff);
      expect(page.headers.get('Content-Security-Policy')).toBe(csp.internal);
      expect(csp.internal).not.toContain('posthog');
      expect(csp.internal).toContain("connect-src 'self';");
      expect(csp.internal).toContain("script-src 'self';");
    });

    it('count a team member who also knows the password as a team member', async () => {
      const p = await seedProspect();
      const { cookie } = await unlock(p.slug);
      const both = withCookie(`${cookie}; ${await sessionCookie()}`);
      expect(await posthogOf(await call(`/g/${p.slug}/theme/manifest.json`, both))).toBeNull();
      expect((await call(`/g/${p.slug}/`, both)).headers.get('Content-Security-Policy')).toBe(csp.internal);
    });
  });

  it('lets the guide run its one inline script, and nothing else inline', async () => {
    const { get } = await unlocked();
    const res = await get('guide.html');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Security-Policy')).toBe(csp.guide);
    expect(csp.guide).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp.game).toMatch(/script-src 'self'( https:\/\/[a-z-]+\.i\.posthog\.com)?;/); // no inline script: at most PostHog's own script host
    expect(csp.game).not.toContain('unsafe-inline;'); // styles may be inline, scripts may not
  });
});
