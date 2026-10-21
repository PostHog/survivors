import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Two projects: `node` (the sprite renderer against the Python reference, which needs child processes) and `worker`
// (the real Worker running in workerd with a real D1 database and the migrations applied).
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    test: {
      projects: [
        {
          // the admin app's pure logic (logo conversion) imports Worker modules through this alias, as its own build does
          resolve: { alias: { '@worker': path.join(import.meta.dirname, 'src') } },
          test: { name: 'node', include: ['test/node/**/*.test.ts'] },
        },
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: './wrangler.jsonc' },
              miniflare: {
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  SESSION_SECRET: 'test-session-secret',
                  // the chat tests answer for the AI providers at these addresses (see test/worker/fake-llm.ts)
                  ANTHROPIC_BASE_URL: 'https://llm.test/anthropic/v1',
                  OPENAI_BASE_URL: 'https://llm.test/openai/v1',
                },
              },
            }),
          ],
          test: { name: 'worker', include: ['test/worker/**/*.test.ts'], setupFiles: ['./test/worker/setup.ts'], testTimeout: 15_000 },
        },
      ],
    },
  };
});
