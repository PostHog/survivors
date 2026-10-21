import { describe, expect, it } from 'vitest';
import { brandColours, FetchRefused, fetchPage, publicUrl } from '../../src/agent/fetch-page';

const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } });

/** A fetcher serving fixed pages, recording what it was asked for. */
function site(pages: Record<string, Response | (() => Response)>) {
  const asked: { url: string; redirect?: RequestInit['redirect'] }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    asked.push({ url, redirect: init?.redirect });
    const page = pages[url];
    if (!page) return new Response('nope', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    return typeof page === 'function' ? page() : page.clone();
  }) as typeof fetch;
  return { fetcher, asked };
}

describe('which addresses may be fetched', () => {
  it.each([
    'https://acme.com',
    'http://acme.com/pricing?x=1',
    'https://www.acme.co.uk/',
    'https://acme.com:443/',
    'http://acme.com:80/',
    'https://sub.domain.example.org/a/b',
  ])('allows %s', (u) => expect(() => publicUrl(u)).not.toThrow());

  it.each([
    ['file:///etc/passwd', 'only http and https'],
    ['ftp://acme.com', 'only http and https'],
    ['javascript:alert(1)', 'only http and https'],
    ['not a url', 'not a valid URL'],
    ['http://localhost/', 'not a public website'],
    ['http://localhost:8787/admin', 'standard web ports'],
    ['http://127.0.0.1/', 'IP number'],
    ['http://169.254.169.254/latest/meta-data', 'IP number'],
    ['http://10.0.0.1/', 'IP number'],
    ['http://[::1]/', 'IP number'],
    ['http://2130706433/', 'IP number'], // decimal-encoded 127.0.0.1: the URL parser turns it into 127.0.0.1 first
    ['http://0x7f.1/', 'IP number'],
    ['http://intranet/', 'not a public website'],
    ['http://printer.local/', 'not a public website'],
    ['http://service.internal/', 'not a public website'],
    ['https://acme.com:8443/', 'standard web ports'],
    ['https://user:pass@acme.com/', 'login'],
  ])('refuses %s', (u, why) => {
    expect(() => publicUrl(u)).toThrow(FetchRefused);
    expect(() => publicUrl(u)).toThrow(why);
  });
});

describe('reading a page', () => {
  const page = `<!doctype html><html><head>
    <title>Acme Rockets &amp; Co | Launch faster</title>
    <meta name="description" content="We build rockets for everyone.">
    <meta property="og:site_name" content="Acme Rockets">
    <meta name="theme-color" content="#E4572E">
    <link rel="stylesheet" href="/site.css">
    <style>.hero { color: #ffffff; background: #eee } .cta { background: #3A86FF }</style>
    <script>var secret = "do not show this"; const brand = '#00ff00';</script>
  </head><body style="background:#111">
    <nav><a href="/">Home</a></nav>
    <h1>Rockets   that <b>ship</b></h1>
    <p>Launch pads &amp; countdowns, handled.</p>
    <noscript>enable javascript</noscript>
    <svg><text>vector words</text></svg>
  </body></html>`;
  const css = ':root{--brand-primary:#E4572E;--grey:#999999} a{color:#3a86ff} .x{color:rgb(255, 190, 11)}';

  it('returns the title, description, theme colour and the visible words, without scripts, styles or tags', async () => {
    const { fetcher } = site({
      'https://acme.com/': html(page),
      'https://acme.com/site.css': new Response(css, { headers: { 'Content-Type': 'text/css' } }),
    });
    const r = await fetchPage('https://acme.com/', { fetcher });
    expect(r).toMatchObject({
      url: 'https://acme.com/',
      status: 200,
      title: 'Acme Rockets & Co | Launch faster',
      description: 'We build rockets for everyone.',
      siteName: 'Acme Rockets',
      themeColor: '#E4572E',
    });
    expect(r.text).toBe('Home Rockets that ship Launch pads & countdowns, handled.');
    for (const hidden of ['do not show this', 'enable javascript', 'vector words', '.hero', '<h1>']) expect(r.text).not.toContain(hidden);
  });

  it('finds the brand colours: the strong ones first, never greys or whites, from the page and its stylesheet', async () => {
    const { fetcher } = site({
      'https://acme.com/': html(page),
      'https://acme.com/site.css': new Response(css, { headers: { 'Content-Type': 'text/css' } }),
    });
    const r = await fetchPage('https://acme.com/', { fetcher });
    expect(r.colours[0]).toBe('#e4572e'); // theme-color + --brand-primary + the page itself
    expect(r.colours).toContain('#3a86ff');
    expect(r.colours).toContain('#ffbe0b'); // from rgb()
    expect(r.colours).not.toContain('#ffffff');
    expect(r.colours).not.toContain('#999999');
    expect(r.colours).not.toContain('#111111');
  });

  it('works without a stylesheet, and when a stylesheet cannot be fetched', async () => {
    const { fetcher } = site({ 'https://acme.com/': html(page) }); // /site.css is a 404
    const r = await fetchPage('https://acme.com/', { fetcher });
    expect(r.colours).toContain('#3a86ff');
  });

  it('checks every redirect against the same rules', async () => {
    const redirect = (to: string) => () => new Response(null, { status: 302, headers: { Location: to } });
    const ok = site({ 'https://acme.com/': redirect('/home'), 'https://acme.com/home': html('<title>Home</title><p>hello</p>') });
    expect((await fetchPage('https://acme.com/', { fetcher: ok.fetcher })).title).toBe('Home');
    expect(ok.asked.every((a) => a.redirect === 'manual')).toBe(true); // never followed automatically

    for (const evil of ['http://127.0.0.1/admin', 'http://169.254.169.254/', 'file:///etc/passwd', 'http://localhost:8787/']) {
      const bad = site({ 'https://acme.com/': redirect(evil) });
      await expect(fetchPage('https://acme.com/', { fetcher: bad.fetcher })).rejects.toBeInstanceOf(FetchRefused);
      expect(bad.asked.map((a) => a.url)).toEqual(['https://acme.com/']); // the evil address was never requested
    }

    const loop = site({ 'https://acme.com/': redirect('/') });
    await expect(fetchPage('https://acme.com/', { fetcher: loop.fetcher })).rejects.toThrow('too many redirects');
  });

  it('refuses things that are not web pages', async () => {
    const { fetcher } = site({ 'https://acme.com/logo.png': new Response('x', { headers: { 'Content-Type': 'image/png' } }) });
    await expect(fetchPage('https://acme.com/logo.png', { fetcher })).rejects.toThrow('not a web page');
  });

  it('reads at most a few hundred KB of an enormous page, and cuts the text to a length a model can read', async () => {
    const big = `<title>Big</title><p>${'word '.repeat(500_000)}</p>`;
    const { fetcher } = site({ 'https://acme.com/': html(big) });
    const r = await fetchPage('https://acme.com/', { fetcher, textLimit: 500 });
    expect(r.title).toBe('Big');
    expect(r.text.length).toBe(500);
  });
});

describe('brand colour extraction', () => {
  it('weights colours named as brand, primary, accent or theme, and expands short hex', () => {
    expect(brandColours('.a{color:#f00} .b{color:#f00} .c{--brand-color:#00f}')).toEqual(['#0000ff', '#ff0000']);
  });
  it('ignores greys, whites and blacks', () => {
    expect(brandColours('#000 #fff #cccccc #808080 #7f7f80 #123456')).toEqual(['#123456']);
  });
  it('returns nothing for a page with no colours', () => {
    expect(brandColours('hello world')).toEqual([]);
  });
});
