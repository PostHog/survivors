import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
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
