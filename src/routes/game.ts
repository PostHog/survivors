// A prospect's game at /g/<slug>/. The page and its relative URLs are exactly what the game builds (so ./assets/..., ./theme/...
// resolve under /g/<slug>/): the shared bundle comes from static assets, and the three files that used to be per-prospect
// (theme/theme.json, theme/manifest.json, theme/sprites/<slot>.png) are answered from D1. All of it sits behind the password gate.
import { type Context, Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import site from '../../game/site.json';
import { getDb } from '../db/client';
import { findGateBySlug, type GateRow, getSpriteGrid, listSpriteSlots } from '../db/prospects';
import type { AppEnv } from '../env';
import csp from '../generated/csp.json';
import { canView } from '../lib/access';
import { DEFAULT_SLOT_IDS, hasDefaultArt, renderDefault } from '../lib/default-art';
import { COOKIE_TTL_S, cookieName, signUnlock, verifyPassword } from '../lib/gate';
import { parseSprite, renderSheet } from '../lib/sprite';
import { unlockPage } from '../views/unlock';

type GameEnv = AppEnv & { Variables: { prospect: GateRow } };

const PRIVATE = 'private, no-store';
const GATE_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'";
const slug = ':slug{[a-z0-9][a-z0-9-]{2,47}}';

export const game = new Hono<GameEnv>({ strict: true }); // /g/x and /g/x/ differ on purpose: the game's relative URLs need the slash

// A bare /g/<slug> would resolve ./assets against /g/, so send it to the slash.
game.get(`/${slug}`, (c) => c.redirect(`/g/${c.req.param('slug')}/`, 308));

// Unknown game: the same plain 404 for every path, so nothing can be learned about what exists.
game.use(
  `/${slug}/*`,
  createMiddleware<GameEnv>(async (c, next) => {
    const row = await findGateBySlug(getDb(c.env), c.req.param('slug') ?? '');
    if (!row) return c.text('not found', 404, { 'Cache-Control': PRIVATE });
    c.set('prospect', row);
    await next();
  }),
);

function gatePage(c: Context<GameEnv>, error: string | undefined, status: 401 | 429) {
  return c.html(unlockPage(error), status, { 'Cache-Control': PRIVATE, 'Content-Security-Policy': GATE_PAGE_CSP });
}

game.get(`/${slug}/unlock`, (c) => c.redirect(`/g/${c.var.prospect.slug}/`, 303));

game.post(`/${slug}/unlock`, async (c) => {
  const p = c.var.prospect;
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  if (!(await c.env.UNLOCK_LIMIT.limit({ key: `${ip}:${p.slug}` })).success) return gatePage(c, 'Too many tries. Wait a minute.', 429);

  const form = await c.req.formData().catch(() => null);
  const pw = form?.get('password');
  if (typeof pw !== 'string' || pw.length > 200 || !(await verifyPassword(pw, p.passwordHash))) return gatePage(c, 'Wrong password.', 401);

  const secure = new URL(c.req.url).protocol === 'https:'; // plain http only happens on localhost
  const cookie = `${cookieName(p.slug)}=${await signUnlock(c.env.SESSION_SECRET, p.slug, p.gateVersion)}; Path=/; Max-Age=${COOKIE_TTL_S}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  return c.body(null, 303, { Location: `/g/${p.slug}/`, 'Set-Cookie': cookie, 'Cache-Control': PRIVATE });
});

// Everything below needs the password.
game.use(
  `/${slug}/*`,
  createMiddleware<GameEnv>(async (c, next) => {
    if (await canView(c.env, c.req.raw, c.var.prospect)) return next();
    const isPage = new URL(c.req.url).pathname === `/g/${c.var.prospect.slug}/`;
    return isPage ? gatePage(c, undefined, 401) : c.text('password required', 401, { 'Cache-Control': PRIVATE });
  }),
);

game.get(`/${slug}/theme/theme.json`, (c) =>
  c.body(c.var.prospect.theme, 200, { 'Content-Type': 'application/json', 'Cache-Control': PRIVATE }),
);

game.get(`/${slug}/theme/manifest.json`, async (c) => {
  const p = c.var.prospect;
  // Every slot is listed, so the whole game takes the prospect's colours: hand-drawn slots come from D1, the rest are the kit's
  // default art recoloured. (A slot left out of the manifest would show the default art in its default colours.)
  const slots = new Set([...DEFAULT_SLOT_IDS, ...(await listSpriteSlots(getDb(c.env), p.id))]);
  // music: null = the kit's default track; posthog comes from game/site.json, like the root game's manifest.
  const sprites = Object.fromEntries([...slots].map((s) => [s, `theme/sprites/${s}.png?v=${p.version}`]));
  c.header('Cache-Control', PRIVATE);
  return c.json({ slug: p.slug, kit: 'bug-survivors', music: null, posthog: site.posthog, draft: false, sprites });
});

game.get(`/${slug}/theme/sprites/:file{[a-z0-9_]+\\.png}`, async (c) => {
  const p = c.var.prospect;
  const slot = c.req.param('file').slice(0, -'.png'.length);
  const grid = await getSpriteGrid(getDb(c.env), p.id, slot);
  if (!grid && !hasDefaultArt(slot)) return c.text('not found', 404, { 'Cache-Control': PRIVATE });
  const palette = (JSON.parse(p.theme) as { palette?: Record<string, string> }).palette;
  const png = grid ? await renderSheet(parseSprite(grid), palette) : await renderDefault(slot, palette ?? {});
  // The URL carries ?v=<version>, so this browser may keep a sprite for as long as that version stands.
  return c.body(png, 200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=31536000, immutable' });
});

// The pages in the bundle are the public home page and guide, written for search engines: canonical link, share cards, structured
// data, the home page's own title. A prospect's game is none of that. Take it out, name the page neutrally until the game sets its
// own title, and say noindex in the page as well as in the header.
const privatePage = (res: Response) =>
  new HTMLRewriter()
    .on('[data-seo]', { element: (el) => void el.remove() })
    .on('title', { element: (el) => void el.setInnerContent('Bug Survivors') })
    .on('head', { element: (el) => void el.append('<meta name="robots" content="noindex, nofollow, noarchive">', { html: true }) })
    .transform(res);

// The shared bundle: /g/<slug>/ is the game's index.html, /g/<slug>/assets/... its files.
game.get(`/${slug}/*`, async (c) => {
  const p = c.var.prospect;
  const rest = new URL(c.req.url).pathname.slice(`/g/${p.slug}`.length) || '/';
  let asset = await c.env.ASSETS.fetch(new URL(rest, c.req.url));
  // Static assets canonicalise some paths (/guide.html -> /guide); follow that once, inside the bundle.
  const next = asset.status === 307 || asset.status === 308 ? asset.headers.get('Location') : null;
  if (next) asset = await c.env.ASSETS.fetch(new URL(next, c.req.url));
  if (!asset.ok) return c.text('not found', 404, { 'Cache-Control': PRIVATE });

  const hashed = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(rest); // hashed bundle files never change
  const out = new Response(asset.body, asset);
  out.headers.set('Content-Security-Policy', /^\/guide(\.html)?$/.test(rest) ? csp.guide : csp.game);
  out.headers.set('Cache-Control', hashed ? 'private, max-age=31536000, immutable' : rest === '/' ? PRIVATE : 'private, no-cache');
  return asset.headers.get('Content-Type')?.startsWith('text/html') ? privatePage(out) : out;
});
