// The kit's default art for every slot, recoloured per prospect. The art itself is game/bug-survivors/default-art.json
// (exported from the game's own sprite files by `npm run art`); the colour maths is src/lib/sprite.ts.
import art from '../../game/bug-survivors/default-art.json';
import { type Palette, parseSprite, rasterise, renderSheet } from './sprite';

interface DefaultSlot {
  palette: 'brand' | 'master';
  grid: string;
  w: number;
  h: number;
  frames: number;
}
const slots = art.slots as Record<string, DefaultSlot>;

/** Every slot that has default art (all of them except the optional prospect logo). */
export const DEFAULT_SLOT_IDS = Object.keys(slots);
export const hasDefaultArt = (slot: string) => slot in slots;
export const defaultGrid = (slot: string): string | undefined => slots[slot]?.grid;

/** A slot's default art in a prospect's colours, as a PNG sprite sheet. */
export function renderDefault(slot: string, palette: Partial<Palette>): Promise<Uint8Array<ArrayBuffer>> {
  const s = slots[slot];
  if (!s) throw new Error(`no default art for slot ${slot}`);
  return renderSheet(parseSprite(s.grid), palette, s.palette === 'master' ? { mode: 'master', master: art.master } : { mode: 'brand' });
}

/** A slot's default art as raw frames, in a prospect's colours (for review images). */
export function rasteriseDefault(slot: string, palette: Partial<Palette>) {
  const s = slots[slot];
  const spr = parseSprite(s.grid);
  return {
    w: spr.w,
    h: spr.h,
    frames: rasterise(spr, palette, s.palette === 'master' ? { mode: 'master', master: art.master } : { mode: 'brand' }),
  };
}
