import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SLOT_IDS, defaultGrid, hasDefaultArt, renderDefault } from '../../src/lib/default-art';
import { EDITABLE_SLOTS, SLOTS, startingGrid } from '../../src/lib/kit';
import { parseSprite, SpriteError } from '../../src/lib/sprite';

// Reference: the game's own Python renderer (game/shared/pixel.py), run through uv with Pillow.
const GAME = path.resolve(import.meta.dirname, '../../game');
const hasUv = (() => {
  try {
    execFileSync('uv', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('sprite renderer', () => {
  // Every slot's default art, recoloured, against shared/sprites.py build(): the exact code that made a game before this Worker.
  // 'near-master' sits one step off a master colour, which exercises the shade-must-differ fallback.
  const palettes: Record<string, { primary: string; secondary: string; accent: string }> = {
    ledgerly: JSON.parse(fs.readFileSync(path.join(GAME, 'bug-survivors/themes/examples/ledgerly.json'), 'utf8')).palette,
    'acme-rockets': JSON.parse(fs.readFileSync(path.join(GAME, 'bug-survivors/themes/examples/acme-rockets.json'), 'utf8')).palette,
    'near-master': { primary: '#f83801', secondary: '#0000bd', accent: '#f8b801' },
  };

  it.skipIf(!hasUv).each(Object.entries(palettes))(
    'renders every slot pixel-identically to the Python build: %s',
    async (_name, palette) => {
      const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sprites-'));
      for (const slot of DEFAULT_SLOT_IDS) fs.writeFileSync(path.join(out, `${slot}.png`), await renderDefault(slot, palette));
      const themePath = path.join(out, 'theme.json');
      fs.writeFileSync(themePath, JSON.stringify({ palette }));
      const res = execFileSync(
        'uv',
        ['run', '-q', '--with', 'pillow', 'python', '-I', path.join(import.meta.dirname, 'compare_sprites.py'), GAME, out, themePath],
        { encoding: 'utf8' },
      );
      expect(res).toMatch(/(\d+)\/\1 slots identical/);
    },
  );

  // A pure black or white brand colour has no darker/lighter shade to find. The game's own Python build raises StopIteration
  // for it (an upstream bug, so there is nothing to compare against); this Worker must still render the game.
  it.each([
    ['black', { primary: '#000000', secondary: '#101010', accent: '#ffffff' }],
    ['white', { primary: '#ffffff', secondary: '#fcfcfc', accent: '#000000' }],
  ])('renders every slot, without throwing, for a pure %s brand colour', async (_name, palette) => {
    for (const slot of DEFAULT_SLOT_IDS) {
      const png = await renderDefault(slot, palette);
      expect([...png.slice(0, 4)]).toEqual([137, 80, 78, 71]);
    }
  });

  it('fails bad grids with a message the agent can act on', () => {
    const ok = 'size 2x2\nlegend\n  a #ff0000\nframe\naa\naa\n';
    expect(() => parseSprite(ok)).not.toThrow();
    expect(() => parseSprite(ok.replace('size 2x2', ''))).toThrow(SpriteError);
    expect(() => parseSprite(ok.replace('aa\naa', 'aa'))).toThrow(/1 rows, want 2/);
    expect(() => parseSprite(ok.replace('aa\naa', 'aa\naab'))).toThrow(/3 wide, want 2/);
    expect(() => parseSprite(ok.replace('aa\naa', 'aa\nab'))).toThrow(/"b", which is not in the legend/);
  });

  it('has default art, of the right size, for every slot except the optional logo', async () => {
    for (const slot of SLOTS) {
      if (slot.optional) {
        expect(hasDefaultArt(slot.id), `${slot.id} is optional and has no default`).toBe(false);
        continue;
      }
      const spr = parseSprite(defaultGrid(slot.id) as string);
      expect([spr.w, spr.h, spr.frames.length], slot.id).toEqual([slot.w, slot.h, slot.frames]);
      const png = await renderDefault(slot.id, {});
      expect(new DataView(png.buffer).getUint32(16), `${slot.id} sheet width`).toBe(slot.w * slot.frames);
    }
  });

  it('lets an agent redraw exactly the enemies, the boss, the floor and the logo, each starting from its default art', () => {
    expect(EDITABLE_SLOTS.map((s) => s.id).sort()).toEqual(['boss', 'enemy_1', 'enemy_2', 'enemy_3', 'logo', 'tile']);
    for (const s of EDITABLE_SLOTS) expect(startingGrid(s.id) !== undefined, s.id).toBe(!s.optional);
  });
});
