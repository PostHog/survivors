// Builds the Bug Survivors game from the source in this folder.
//
//   node game/build.mjs            build the game into ../public (served as static assets, and by the Worker for gated games) + regenerate src/generated/
//   node game/build.mjs --meta     only regenerate src/generated/ (the Worker's view of the kit's slots and default art)
//   node game/build.mjs --dev      Vite dev server for working on the game itself (http://localhost:5173, default theme)
//   node game/build.mjs --art      re-render default sprites into bug-survivors/public/assets/default and re-export default-art.json (needs uv)
//
// Plain `build` needs only node. The default sprite PNGs are committed; run --art after editing sprites/*.sprite or art.py.
// The player's guide (public/guide.html) is built from GUIDE.md with: npm run guide
import { createServer, build } from 'vite';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(GAME, 'bug-survivors');
const SHARED = path.join(GAME, 'shared');
const OUT = path.join(GAME, '../public'); // the game is the site root; scripts/assemble.mjs adds _headers and robots.txt
const GENERATED = path.join(GAME, '../src/generated');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); };
const flag = (f) => process.argv.includes(f);

/** shared/theme.base.schema.json + this kit's game schema (+ its product list) = the schema a theme is checked against. */
function composeSchema() {
  const kit = read(path.join(KIT, 'kit.json'));
  const schema = read(path.join(SHARED, 'theme.base.schema.json'));
  const game = read(path.join(KIT, 'game.schema.json'));
  schema.$id = `https://games.local/kits/${kit.id}/theme.schema.json`;
  schema.title = `${kit.name} theme`;
  schema.properties.products.items.enum = kit.products;
  if (kit.products_min) schema.properties.products.minItems = kit.products_min;
  if (kit.products_max) schema.properties.products.maxItems = Math.min(kit.products_max, kit.products.length);
  // Any string enum left empty in the game schema means "one of this kit's products".
  const fill = (s) => {
    if (!s || typeof s !== 'object') return;
    if (Array.isArray(s.enum) && s.enum.length === 0) s.enum = kit.products;
    Object.values(s).forEach(fill);
  };
  fill(game);
  schema.properties.game = game;
  return schema;
}

/** Everything the Worker (and the agent) needs to know about the kit, as one file: schema, defaults, examples, slots, prompts. */
function kitData() {
  const kit = read(path.join(KIT, 'kit.json'));
  const text = (p) => fs.readFileSync(p, 'utf8');
  const examplesDir = path.join(KIT, 'themes/examples');
  return {
    generated_by: 'game/build.mjs: do not edit',
    id: kit.id,
    name: kit.name,
    products: kit.products,
    schema: composeSchema(),
    defaultTheme: read(path.join(KIT, 'themes/default.json')),
    examples: Object.fromEntries(fs.readdirSync(examplesDir).filter((f) => f.endsWith('.json')).sort().map((f) => [f.replace(/\.json$/, ''), read(path.join(examplesDir, f))])),
    slots: read(path.join(KIT, 'slots.json')),
    prompts: {
      rules: text(path.join(SHARED, 'prompts/rules.md')),
      theme: text(path.join(KIT, 'prompts/theme.md')),
      spriteStyle: text(path.join(SHARED, 'prompts/sprite-style.md')),
    },
  };
}

function generate() {
  write(path.join(KIT, 'theme.schema.json'), composeSchema());
  write(path.join(GENERATED, 'kit.json'), kitData());
}

const site = read(path.join(GAME, 'site.json'));
const viteConfig = (extra) => ({
  root: KIT, base: './', logLevel: 'warn', configFile: false,
  resolve: { alias: { '@shared': path.join(SHARED, 'src') } },
  define: { __SITE__: JSON.stringify(site) },
  ...extra,
});

if (flag('--art')) {
  const py = (script, args) => execFileSync('uv', ['run', '-q', '--with', 'pillow', 'python', script, ...args], { stdio: 'inherit' });
  py(path.join(SHARED, 'sprites.py'), [KIT, path.join(KIT, 'public/assets/default')]); // default PNGs, in the default colours
  py(path.join(KIT, 'tools/export_default_art.py'), []); // default-art.json: the same art as editable grids, for the Worker to recolour
  console.log('default sprites re-rendered and exported');
} else if (flag('--meta')) {
  generate();
} else {
  generate();
  const theme = path.join(KIT, 'public/theme'); // the default theme: it is the game on the site root
  fs.mkdirSync(theme, { recursive: true });
  fs.copyFileSync(path.join(KIT, 'themes/default.json'), path.join(theme, 'theme.json'));
  write(path.join(theme, 'manifest.json'), { slug: 'bug-survivors-default', sprites: {}, music: null, posthog: site.posthog });
  if (flag('--dev')) {
    const server = await createServer(viteConfig({ server: { port: 5173 } }));
    await server.listen();
    server.printUrls();
  } else {
    const t0 = Date.now();
    await build(viteConfig({
      build: { outDir: OUT, emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2000, reportCompressedSize: false },
    }));
    console.log(`game built in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${path.relative(process.cwd(), OUT)}`);
  }
}
