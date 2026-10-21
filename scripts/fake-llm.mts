// A scripted stand-in for Anthropic's API, for the browser test (npm run e2e): `npx tsx scripts/fake-llm.mts <port>`.
// The real Worker talks to it through ANTHROPIC_BASE_URL, so the real provider code runs end to end with no network and no key.
//   POST /v1/messages   a scripted "designer" reply: a fresh message gets text plus three tool calls, a message that follows tool
//                       results gets a closing sentence
//   GET  /__requests    what the Worker sent (headers and bodies), for the test to check
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { anthropicStream, type Turn } from '../test/fake-anthropic.ts';

const port = Number(process.argv[2] ?? 8801);
const enemy = fs.readFileSync(path.resolve(import.meta.dirname, '../game/bug-survivors/sprites/enemy_1.sprite'), 'utf8');
const seen: { headers: http.IncomingHttpHeaders; body: unknown }[] = [];

const design: Turn = [
  { text: 'On it: a green palette, a new title, and a redrawn first bug.' },
  {
    tool: 'update_theme',
    input: { changes: { title: 'Acme: Launch Day', palette: { primary: '#0a7d5a', secondary: '#0b1f33', accent: '#ffd166' } } },
  },
  { tool: 'set_sprite', input: { slot: 'enemy_1', grid: enemy } },
  { tool: 'preview_scene', input: {} },
];
const closing: Turn = [{ text: 'Done: the game is green, titled "Acme: Launch Day", and the first bug is redrawn.' }];

http
  .createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString();
    if (req.url === '/__requests') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(seen));
    } else if (req.url?.endsWith('/messages') && req.method === 'POST') {
      const body = JSON.parse(raw) as { messages: { role: string; content: unknown }[] };
      seen.push({ headers: req.headers, body });
      const last = body.messages.at(-1);
      const afterTools =
        last?.role === 'user' && Array.isArray(last.content) && last.content.some((b: { type: string }) => b.type === 'tool_result');
      res
        .writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
        .end(anthropicStream(afterTools ? closing : design, seen.length));
    } else {
      res.writeHead(404).end('not found');
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`fake LLM on ${port}`));
