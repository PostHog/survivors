// Checks a hand-made .sprite grid before it is stored: it must parse, fit its slot exactly, and draw something. Messages are written
// to be acted on by the AI agent (or a person) that made the mistake.
import { isEditable, slotInfo } from './kit';
import { parseSprite, SpriteError } from './sprite';
import type { Problem } from './theme';

export const MAX_GRID_CHARS = 30_000;

export function checkSprite(slot: string, grid: string): { ok: true; grid: string } | { ok: false; problems: Problem[] } {
  const info = slotInfo(slot);
  if (!info) return { ok: false, problems: [{ path: 'slot', message: `there is no slot "${slot}"` }] };
  if (!isEditable(slot))
    return {
      ok: false,
      problems: [
        {
          path: 'slot',
          message: `slot "${slot}" cannot be redrawn; the redrawable slots are enemy_1, enemy_2, enemy_3, boss, tile and logo`,
        },
      ],
    };
  if (grid.length > MAX_GRID_CHARS)
    return { ok: false, problems: [{ path: 'grid', message: `the grid is ${grid.length} characters; at most ${MAX_GRID_CHARS}` }] };

  const normalised = `${grid.replace(/\r\n?/g, '\n').trimEnd()}\n`;
  let spr: ReturnType<typeof parseSprite>;
  try {
    spr = parseSprite(normalised);
  } catch (e) {
    if (e instanceof SpriteError) return { ok: false, problems: [{ path: 'grid', message: e.message }] };
    throw e;
  }
  const problems: Problem[] = [];
  if (spr.w !== info.w || spr.h !== info.h)
    problems.push({ path: 'grid', message: `slot "${slot}" is ${info.w}x${info.h} but the grid says size ${spr.w}x${spr.h}` });
  if (spr.frames.length !== info.frames)
    problems.push({
      path: 'grid',
      message: `slot "${slot}" needs ${info.frames} frame${info.frames === 1 ? '' : 's'} but the grid has ${spr.frames.length}`,
    });
  if (!spr.frames.some((f) => f.some((row) => /[^.]/.test(row))))
    problems.push({ path: 'grid', message: 'the sprite is empty: every pixel is transparent' });
  return problems.length ? { ok: false, problems } : { ok: true, grid: normalised };
}
