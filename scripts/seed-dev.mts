// Dev only: print SQL that creates a test prospect from the game's example theme (ledgerly) with one hand-drawn slot, so a
// local `npm run dev` has a gated game to open.
//   npx tsx scripts/seed-dev.mts [slug] [password] > /tmp/seed.sql && npx wrangler d1 execute survivors --local --file /tmp/seed.sql
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from '../src/lib/gate.ts';

const kit = path.resolve(import.meta.dirname, '../game/bug-survivors');
const [slug = 'ledgerly-test1', password = 'otter-maple-42'] = process.argv.slice(2);
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
const theme = fs.readFileSync(path.join(kit, 'themes/examples/ledgerly.json'), 'utf8');
const sprite = fs.readFileSync(path.join(kit, 'sprites/enemy_1.sprite'), 'utf8');
const now = Date.now();

console.log(`DELETE FROM prospects WHERE slug = ${q(slug)};`);
console.log(
  `INSERT INTO prospects (slug, name, domain, owner_email, theme, password_hash, created_at, updated_at) VALUES (${q(slug)}, 'Ledgerly', 'ledgerly.io', 'dev@posthog.com', ${q(theme)}, ${q(await hashPassword(password))}, ${now}, ${now});`,
);
console.log(`INSERT INTO sprites (prospect_id, slot, grid) SELECT id, 'enemy_1', ${q(sprite)} FROM prospects WHERE slug = ${q(slug)};`);
