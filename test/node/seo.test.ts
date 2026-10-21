import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import site from '../../game/site.json';

// What search engines and link previews get from the built public pages (npm run build makes them; `npm test` builds first).
const pub = path.join(import.meta.dirname, '../../public');
const read = (f: string) => fs.readFileSync(path.join(pub, f), 'utf8');
const page = (html: string) => {
  const tag = (re: RegExp) => html.match(re)?.[1];
  return {
    title: tag(/<title>([^<]*)<\/title>/),
    description: tag(/<meta name="description" content="([^"]*)"/),
    canonical: tag(/<link rel="canonical" href="([^"]*)"/),
    robots: tag(/<meta name="robots" content="([^"]*)"/),
    og: (p: string) => tag(new RegExp(`<meta property="og:${p}" content="([^"]*)"`)),
    twitter: (p: string) => tag(new RegExp(`<meta name="twitter:${p}" content="([^"]*)"`)),
    ld: [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([^<]*)<\/script>/g)].map(
      (m) => JSON.parse(m[1]) as Record<string, unknown>,
    ),
  };
};
const pngSize = (f: string) => {
  const b = fs.readFileSync(path.join(pub, f));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('the home page', () => {
  const home = page(read('index.html'));

  it('has a title and description of a length search results show in full', () => {
    expect(home.title?.length).toBeGreaterThan(20);
    expect(home.title?.length).toBeLessThanOrEqual(60);
    expect(home.description?.length).toBeGreaterThan(70);
    expect(home.description?.length).toBeLessThanOrEqual(160);
  });

  it('is indexable and canonical on the site origin', () => {
    expect(home.robots).toMatch(/^index, follow/);
    expect(home.robots).not.toMatch(/noindex/);
    expect(home.canonical).toBe(`${site.site}/`);
    expect(home.og('url')).toBe(`${site.site}/`);
  });

  it('has share cards that repeat the title and description and point at a real 1200x630 image', () => {
    expect(home.og('title')).toBe(home.title);
    expect(home.twitter('title')).toBe(home.title);
    expect(home.og('description')).toBe(home.description);
    expect(home.twitter('description')).toBe(home.description);
    expect(home.twitter('card')).toBe('summary_large_image');
    expect(home.og('image')).toBe(`${site.site}/og.png`);
    expect(home.twitter('image')).toBe(`${site.site}/og.png`);
    expect(pngSize('og.png')).toEqual([1200, 630]);
    expect(home.og('image:width')).toBe('1200');
    expect(home.og('image:alt')?.length).toBeGreaterThan(20);
  });

  it('describes itself as a free VideoGame published by PostHog', () => {
    const game = home.ld.find((x) => x['@type'] === 'VideoGame');
    expect(game).toMatchObject({
      '@context': 'https://schema.org',
      name: 'Bug Survivors',
      url: `${site.site}/`,
      image: `${site.site}/og.png`,
      description: home.description,
      applicationCategory: 'Game',
      playMode: 'SinglePlayer',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@type': 'Organization', name: 'PostHog', url: 'https://posthog.com' },
    });
    expect(home.ld.map((x) => x['@type'])).toEqual(['VideoGame', 'Organization', 'WebSite']);
    expect(home.ld.every((x) => x['@context'] === 'https://schema.org')).toBe(true);
  });

  it('has text for a crawler and a screen reader, since the game itself is a canvas', () => {
    const html = read('index.html');
    expect(html).toMatch(/<h1>Bug Survivors<\/h1>/);
    expect(html).toContain('<a href="/guide">');
    expect(html).toContain('<noscript>');
  });

  it('ships the icons it links to', () => {
    for (const f of ['favicon.png', 'apple-touch-icon.png']) expect(fs.existsSync(path.join(pub, f))).toBe(true);
  });
});

describe('the guide', () => {
  const guide = page(read('guide.html'));

  it('is indexable, canonical, and has its own structured data', () => {
    expect(guide.robots).toMatch(/^index, follow/);
    expect(guide.canonical).toBe(`${site.site}/guide`);
    expect(guide.title).not.toBe(page(read('index.html')).title);
    expect(guide.og('image')).toBe(`${site.site}/og.png`);
    expect(guide.ld).toHaveLength(1);
    expect(guide.ld[0]).toMatchObject({ '@type': 'TechArticle', url: `${site.site}/guide`, headline: guide.title });
  });
});

describe('what is kept out of search', () => {
  it('lists the public pages in a sitemap that robots.txt points to, and blocks nothing a noindex header could not reach', () => {
    const sitemap = read('sitemap.xml');
    expect(sitemap).toContain(`<loc>${site.site}/</loc>`);
    expect(sitemap).toContain(`<loc>${site.site}/guide</loc>`);
    const robots = read('robots.txt');
    expect(robots).toContain(`Sitemap: ${site.site}/sitemap.xml`);
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m); // a blocked crawler never sees a prospect game's noindex
  });

  it('puts noindex on the admin app files but not on the home page', () => {
    const headers = read('_headers');
    const rule = (p: string) => headers.split(/\n\n/).find((b) => b.split('\n').some((l) => l === p)) ?? '';
    expect(rule('/_admin/*')).toContain('X-Robots-Tag: noindex');
    expect(rule('/*')).not.toContain('X-Robots-Tag');
  });
});
