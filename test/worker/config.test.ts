import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import site from '../../game/site.json';
import app from '../../src/index';

const unconfigured = { ...env, SESSION_SECRET: '' };
const ask = (path: string) => app.fetch(new Request(`https://survivors.test${path}`), unconfigured);

describe('a Worker deployed without its SESSION_SECRET', () => {
  it('says what is missing instead of failing somewhere inside a request', async () => {
    for (const path of ['/admin', '/g/any-game/', '/api/me', '/oauth/login']) {
      const res = await ask(path);
      expect(res.status, path).toBe(503);
      expect(((await res.json()) as { error: string }).error, path).toContain('SESSION_SECRET');
    }
  });

  it('still answers the health check, so a deploy can be seen to be up', async () => {
    expect((await ask('/mp/health')).status).toBe(200);
  });
});

describe("the admin app's analytics, from GET /api/me", () => {
  const me = async (origin: string, vars: Record<string, string> = {}) => {
    const { asUser } = await import('./helpers');
    const res = await app.fetch(new Request(`${origin}/api/me`, await asUser('jane@posthog.com')), { ...env, ...vars });
    return ((await res.json()) as { analytics: { key: string; host: string } | null }).analytics;
  };

  it("report to the games' PostHog project when served from the real domain", async () => {
    expect(await me('https://survivors.posthog.com')).toEqual({ key: site.posthog?.key, host: 'https://us.i.posthog.com' });
  });

  it('are off on localhost, so a developer does not add noise, unless asked for', async () => {
    expect(await me('http://localhost:8787')).toBeNull();
    expect(await me('http://127.0.0.1:8787')).toBeNull();
    expect(await me('http://localhost:8787', { ANALYTICS_LOCAL: '1' })).toEqual({
      key: site.posthog?.key,
      host: 'https://us.i.posthog.com',
    });
  });
});
