// Reading a company's website for the agent: what they do, and their brand colours. The URL comes from an AI model reading user
// text, so it is treated as hostile: public http(s) hosts on the default ports only, redirects re-checked, hard size and time limits.

export class FetchRefused extends Error {}

const UA = 'Mozilla/5.0 (compatible; PostHogSurvivorsBot/1.0; +https://survivors.posthog.com)';
const MAX_BYTES = 400_000;
const MAX_CSS_BYTES = 300_000;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 4;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const BAD_SUFFIX = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet'];

/** Throws unless `raw` is a public website address we are willing to fetch. */
export function publicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchRefused('that is not a valid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new FetchRefused('only http and https addresses can be fetched');
  if (u.username || u.password) throw new FetchRefused('addresses with a login in them are not fetched');
  if (u.port && u.port !== '80' && u.port !== '443') throw new FetchRefused('only the standard web ports are fetched');
  const host = u.hostname.toLowerCase();
  if (IPV4.test(host) || host.includes(':') || host.startsWith('['))
    throw new FetchRefused('addresses given as an IP number are not fetched');
  if (!host.includes('.') || host === 'localhost' || BAD_SUFFIX.some((s) => host.endsWith(s)))
    throw new FetchRefused('that is not a public website');
  return u;
}

async function readLimited(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(size, max));
  let o = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.max(0, all.length - o));
    all.set(part, o);
    o += part.length;
  }
  return new TextDecoder().decode(all);
}

/** GET with manual redirects, so every hop is checked against publicUrl(). */
async function get(
  raw: string,
  maxBytes: number,
  fetcher: typeof fetch,
): Promise<{ url: URL; status: number; type: string; body: string }> {
  let url = publicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetcher(url.toString(), {
      redirect: 'manual',
      headers: { 'User-Agent': UA, Accept: 'text/html,text/css,text/plain;q=0.9,*/*;q=0.5' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get('Location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {});
      url = publicUrl(new URL(location, url).toString());
      continue;
    }
    const type = (res.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
    if (!/^(text\/|application\/(xhtml\+xml|json|xml))/.test(type)) {
      await res.body?.cancel().catch(() => {});
      throw new FetchRefused(`that address is not a web page (it is ${type || 'unknown'})`);
    }
    return { url, status: res.status, type, body: await readLimited(res, maxBytes) };
  }
  throw new FetchRefused('too many redirects');
}

// ---- brand colours ----

const hex6 = (h: string) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toLowerCase();

/** The saturated colours a stylesheet or page uses most, most frequent first; greys, whites and blacks are not brand colours. */
export function brandColours(source: string, limit = 8): string[] {
  const count = new Map<string, number>();
  const add = (c: string, weight: number) => count.set(c, (count.get(c) ?? 0) + weight);
  for (const line of source.split(/[\n;}]/)) {
    const boost = /primary|brand|accent|theme|highlight|cta|button/i.test(line) ? 4 : 1; // a variable named --brand-... is a strong hint
    for (const m of line.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) add(hex6(m[0]), boost);
    for (const m of line.matchAll(/rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/gi)) {
      const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)));
      add(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`, boost);
    }
  }
  const saturated = (c: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
    return Math.max(r, g, b) - Math.min(r, g, b) >= 40;
  };
  return [...count.entries()]
    .filter(([c]) => saturated(c))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([c]) => c);
}

// ---- the page ----

export interface PageSummary {
  url: string;
  status: number;
  title: string;
  description: string;
  siteName: string;
  themeColor: string;
  /** Saturated colours the page and its first stylesheets use, most used first: candidates for the brand palette. */
  colours: string[];
  /** The visible text, tags and scripts removed, cut to a length a model can read. */
  text: string;
}

const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (m) => entities[m] ?? m);

export async function fetchPage(raw: string, opts: { fetcher?: typeof fetch; textLimit?: number } = {}): Promise<PageSummary> {
  const fetcher = opts.fetcher ?? fetch;
  const page = await get(raw, MAX_BYTES, fetcher);
  const meta: Record<string, string> = {};
  const sheets: string[] = [];
  let title = '';

  const readMeta = (e: Element) => {
    const key = (e.getAttribute('name') ?? e.getAttribute('property') ?? '').toLowerCase();
    const content = e.getAttribute('content');
    if (key && content && !(key in meta)) meta[key] = content;
  };
  // HTMLRewriter needs a Response; it also lets us drop scripts and styles before turning the rest into text.
  const stripped = await new HTMLRewriter()
    .on('title', {
      text: (t) => {
        title += t.text;
      },
    })
    .on('meta', { element: readMeta })
    .on('link[rel~="stylesheet"]', {
      element: (e) => {
        const href = e.getAttribute('href');
        if (href && sheets.length < 3) sheets.push(href);
      },
    })
    .on('script, style, noscript, svg, template, head', { element: (e) => void e.remove() })
    .transform(new Response(page.body, { headers: { 'Content-Type': 'text/html' } }))
    .text();

  const text = decode(
    stripped
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, opts.textLimit ?? 6000);

  // Brand colours: from the page's own markup and inline styles, and from its first few stylesheets.
  let css = page.body;
  for (const href of sheets) {
    try {
      css += `\n${(await get(new URL(href, page.url).toString(), MAX_CSS_BYTES, fetcher)).body}`;
    } catch {
      /* a stylesheet we may not or cannot fetch is just not used */
    }
  }

  return {
    url: page.url.toString(),
    status: page.status,
    title: decode(title.replace(/\s+/g, ' ').trim()),
    description: decode(meta.description ?? meta['og:description'] ?? ''),
    siteName: decode(meta['og:site_name'] ?? ''),
    themeColor: meta['theme-color'] ?? '',
    colours: brandColours(`${meta['theme-color'] ? `theme ${meta['theme-color']};` : ''}\n${css}`),
    text,
  };
}
