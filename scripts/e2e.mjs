// One command for the browser end-to-end tests: build, fresh local database, migrate, seed, start the Worker (and a fake AI provider),
// run test/e2e.py and test/e2e_admin.py (Playwright, through uv), stop everything. Needs node and uv; the first run needs Chromium:
//   uv run --with playwright playwright install chromium
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.env.E2E_PORT ?? '8799';
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'survivors-e2e-'));
const shots = process.env.E2E_SHOTS ?? path.join(state, 'screenshots');
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
};

run('npm', ['run', 'build', '--silent']);
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'survivors', '--local', '--persist-to', state], { stdio: 'ignore' });
const seed = path.join(state, 'seed.sql');
fs.writeFileSync(seed, spawnSync('npx', ['tsx', 'scripts/seed-dev.mts'], { encoding: 'utf8' }).stdout);
run('npx', ['wrangler', 'd1', 'execute', 'survivors', '--local', '--persist-to', state, '--file', seed], { stdio: 'ignore' });

// Its own secrets, so the test needs no .dev.vars (CI has none).
const secrets = ['--var', 'SESSION_SECRET:e2e-session-secret-0123456789'];
// A scripted fake of the AI provider, and a developer sign-in (PostHog itself cannot be reached from localhost).
const LLM_PORT = process.env.E2E_LLM_PORT ?? '8798';
const llm = spawn('npx', ['tsx', 'scripts/fake-llm.mts', LLM_PORT], { stdio: 'ignore', detached: true });
const env = [
  '--var',
  'DEV_LOGIN_EMAIL:e2e@posthog.com',
  '--var',
  'ANALYTICS_LOCAL:1',
  '--var',
  `ANTHROPIC_BASE_URL:http://127.0.0.1:${LLM_PORT}/v1`,
];
const server = spawn(
  'npx',
  [
    'wrangler',
    'dev',
    '--port',
    PORT,
    '--local-upstream',
    `localhost:${PORT}`,
    '--upstream-protocol',
    'http',
    '--persist-to',
    state,
    ...secrets,
    ...env,
  ],
  { stdio: 'ignore', detached: true },
);
const stop = () => {
  for (const p of [server, llm]) {
    try {
      process.kill(-p.pid); // the whole process group: npx, wrangler, workerd
    } catch {}
  }
};
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

let ready = false;
for (let i = 0; i < 100 && !ready; i++) {
  ready = await fetch(`http://localhost:${PORT}/mp/health`).then(
    (r) => r.ok,
    () => false,
  );
  if (!ready) await new Promise((r) => setTimeout(r, 300));
}
if (!ready) throw new Error('the Worker did not start');
await new Promise((r) => setTimeout(r, 1500)); // let the static assets finish loading

const py = (script) =>
  spawnSync(
    'uv',
    [
      'run',
      '-q',
      '--with',
      'playwright',
      '--with',
      'pillow',
      'python',
      script,
      `http://localhost:${PORT}`,
      shots,
      `http://127.0.0.1:${LLM_PORT}`,
    ],
    {
      stdio: 'inherit',
    },
  );
const games = py('test/e2e.py'); // the games: password gate, the real game under the policy
const admin = py('test/e2e_admin.py'); // the admin app: sign in, make a game, chat, edit, share, delete
fs.rmSync(path.join(state, 'v3'), { recursive: true, force: true });
process.exit(games.status || admin.status || 0);
