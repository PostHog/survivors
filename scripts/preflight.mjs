// Runs before a deploy (npm run deploy:ci). Stops with a plain message when the one-off setup was not done, instead of a Cloudflare error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const config = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../wrangler.jsonc'), 'utf8');
if (/REPLACE_WITH_ID/.test(config)) {
  console.error(`
wrangler.jsonc still has the placeholder database_id.
Create the database once (npx wrangler d1 create survivors), put the id it prints in wrangler.jsonc, and commit that.
`);
  process.exit(1);
}
