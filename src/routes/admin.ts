// The admin app's page. The app itself (public/_admin/, built from admin/) is just files; this route only decides who is shown it:
// a signed-in PostHog person gets the app shell for any /admin/... path (the app routes client-side), anyone else is sent to sign in.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import csp from '../generated/csp.json';
import { readSession } from '../lib/session';

export const admin = new Hono<AppEnv>();

admin.get('/*', async (c) => {
  const url = new URL(c.req.url);
  if (!(await readSession(c.env.SESSION_SECRET, c.req.raw))) {
    return c.redirect(`/oauth/login?next=${encodeURIComponent(url.pathname + url.search)}`, 303);
  }
  const shell = await c.env.ASSETS.fetch(new URL('/_admin/index.html', url.origin));
  if (!shell.ok) return c.text('The admin app has not been built: run npm run build.', 503);
  const res = new Response(shell.body, shell);
  res.headers.set('Content-Security-Policy', csp.admin);
  res.headers.set('Cache-Control', 'no-store');
  return res;
});
