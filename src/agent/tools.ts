// What the agent can do. Each tool reads the game fresh from D1 (the salesperson may have edited it between messages), changes it
// only through the same validated code paths the admin API uses, and, for anything visual, hands back an image the model can look at.
import { tool } from 'ai';
import { z } from 'zod';
import type { Db } from '../db/client';
import { getProspect, removeSprite, saveSprite, setTheme } from '../db/prospects';
import { defaultGrid } from '../lib/default-art';
import { slotInfo } from '../lib/kit';
import { pngBase64, renderScene, renderSpriteReview } from '../lib/preview';
import { checkSprite } from '../lib/sprite-check';
import { type Theme, validateTheme } from '../lib/theme';
import { FetchRefused, fetchPage } from './fetch-page';

export interface AgentContext {
  db: Db;
  prospectId: number;
  /** Injected in tests; the real network otherwise. */
  fetcher?: typeof fetch;
}

const MAX_PAGE_FETCHES = 8;
// Spelled out so the tools' types know the slot names; a test checks this list against the kit's slots.
export const SLOT_IDS = ['enemy_1', 'enemy_2', 'enemy_3', 'boss', 'tile', 'logo'] as const;
const slot = z.enum(SLOT_IDS).describe('Which sprite: enemy_1, enemy_2, enemy_3, boss, tile or logo');

/** What the model reads back from a tool that produced an image: the facts as text, and the picture itself. */
function withPicture({ output }: { output: unknown }) {
  const { previewPng, ...facts } = output as { previewPng?: string } & Record<string, unknown>;
  return {
    type: 'content' as const,
    value: [
      { type: 'text' as const, text: JSON.stringify(facts) },
      ...(previewPng ? [{ type: 'file' as const, mediaType: 'image/png', data: { type: 'data' as const, data: previewPng } }] : []),
    ],
  };
}

/** JSON merge patch (RFC 7396): objects merge, null removes a key, anything else replaces. */
export function mergePatch(target: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const base = target !== null && typeof target === 'object' && !Array.isArray(target) ? { ...(target as Record<string, unknown>) } : {};
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === null) delete base[k];
    else base[k] = mergePatch(base[k], v);
  }
  return base;
}

export function makeTools(ctx: AgentContext) {
  let pageFetches = 0;

  // A model may call several tools in one step, and the SDK runs them at the same time. The tools that read or write the game must not
  // overlap: a sprite preview rendered while the palette change beside it is still being saved would show the old colours to the model.
  // So they run one at a time, in the order the model called them. (fetch_page only touches the network, so it is not held up.)
  let queue: Promise<unknown> = Promise.resolve();
  const inOrder =
    <A, R>(run: (input: A) => Promise<R>) =>
    (input: A): Promise<R> => {
      const result = queue.then(() => run(input));
      queue = result.catch(() => undefined);
      return result;
    };
  const load = async () => {
    const p = await getProspect(ctx.db, ctx.prospectId);
    if (!p) throw new Error('This game no longer exists.');
    return p;
  };
  const palette = (theme: unknown) => (theme as { palette?: Record<string, string> }).palette ?? {};
  const customGrids = (p: { sprites: { slot: string; grid: string }[] }) => Object.fromEntries(p.sprites.map((s) => [s.slot, s.grid]));

  return {
    get_game: tool({
      description:
        'Read the game as it is right now: its full theme, and which sprite slots have hand-made art. Use it if you are unsure what the salesperson may have changed.',
      inputSchema: z.object({}),
      execute: inOrder(async () => {
        const p = await load();
        return {
          name: p.name,
          domain: p.domain,
          version: p.version,
          theme: p.theme,
          slotsWithHandMadeSprites: p.sprites.map((s) => s.slot),
        };
      }),
    }),

    fetch_page: tool({
      description:
        "Read a public web page (the company's own site): its title, description, the visible text, and the brand colours its styles use. Only public http(s) websites work. Use it at most a few times.",
      inputSchema: z.object({ url: z.string().describe('The address, e.g. https://acme.com') }),
      execute: async ({ url }) => {
        if (++pageFetches > MAX_PAGE_FETCHES)
          return { ok: false as const, error: `You have already read ${MAX_PAGE_FETCHES} pages in this reply; work with what you have.` };
        try {
          return { ok: true as const, ...(await fetchPage(url, { fetcher: ctx.fetcher })) };
        } catch (e) {
          if (e instanceof FetchRefused) return { ok: false as const, error: e.message };
          return { ok: false as const, error: `could not read that page (${e instanceof Error ? e.message : 'unknown error'})` };
        }
      },
    }),

    update_theme: tool({
      description:
        'Change the theme. Send only what changes, as a partial theme: objects are merged field by field, arrays and values are replaced, null removes an optional field. ' +
        'prospect.name and prospect.domain are fixed by the game and cannot be changed. The result is checked against the schema and the content rules; if it fails nothing is saved and you get the problems to fix.',
      inputSchema: z.object({
        changes: z
          .record(z.string(), z.unknown())
          .describe('A partial theme, e.g. {"palette":{"primary":"#0a7d5a"},"title":"Acme: Launch Day"}'),
      }),
      execute: inOrder(async ({ changes }) => {
        const p = await load();
        const checked = validateTheme(mergePatch(p.theme, changes), { name: p.name, domain: p.domain });
        if (!checked.ok) return { ok: false as const, problems: checked.problems };
        await setTheme(ctx.db, p.id, { theme: checked.theme as Theme });
        return { ok: true as const, version: p.version + 1, theme: checked.theme };
      }),
    }),

    get_sprite: tool({
      description:
        "Look at a sprite: its grid (your hand-made one if there is one, otherwise the kit's default art to start from) and an image of it in the game's colours.",
      inputSchema: z.object({ slot }),
      execute: inOrder(async ({ slot: id }) => {
        const p = await load();
        const info = slotInfo(id);
        const mine = p.sprites.find((s) => s.slot === id)?.grid;
        const grid = mine ?? defaultGrid(id);
        if (!grid)
          return {
            slot: id,
            width: info?.w,
            height: info?.h,
            frames: info?.frames,
            handMade: false,
            grid: null,
            note: 'No logo yet: the splash screen shows the PostHog logo. The salesperson can upload one.',
          };
        return {
          slot: id,
          width: info?.w,
          height: info?.h,
          frames: info?.frames,
          handMade: Boolean(mine),
          brief: info?.prompt,
          grid,
          previewPng: pngBase64(await renderSpriteReview(grid, palette(p.theme))),
        };
      }),
      toModelOutput: withPicture,
    }),

    set_sprite: tool({
      description:
        'Save a hand-made sprite for a slot, as a complete grid in the sprite file format (size, legend, one frame block per frame). It must match the slot exactly. ' +
        'You get back an image of it: look at it before you decide it is done. If the grid has problems nothing is saved and you get the problems.',
      inputSchema: z.object({ slot, grid: z.string().describe('The whole sprite file') }),
      execute: inOrder(async ({ slot: id, grid }) => {
        const p = await load();
        const checked = checkSprite(id, grid);
        if (!checked.ok) return { ok: false as const, problems: checked.problems };
        await saveSprite(ctx.db, p.id, id, checked.grid);
        const info = slotInfo(id);
        return {
          ok: true as const,
          slot: id,
          width: info?.w,
          height: info?.h,
          frames: info?.frames,
          version: p.version + 1,
          previewPng: pngBase64(await renderSpriteReview(checked.grid, palette(p.theme))),
        };
      }),
      toModelOutput: withPicture,
    }),

    reset_sprite: tool({
      description: "Throw away a hand-made sprite and go back to the kit's default art for that slot.",
      inputSchema: z.object({ slot }),
      execute: inOrder(async ({ slot: id }) => {
        const p = await load();
        await removeSprite(ctx.db, p.id, id);
        return { ok: true as const, slot: id, version: p.version + 1 };
      }),
    }),

    preview_scene: tool({
      description:
        'See the whole cast together on the arena floor, as the game shows it: the hog, three kinds of bug, the boss, loot. Use it to check that everything reads against the floor, the bugs differ from each other, and the style matches.',
      inputSchema: z.object({}),
      execute: inOrder(async () => {
        const p = await load();
        return {
          ok: true as const,
          handMadeSlots: p.sprites.map((s) => s.slot),
          previewPng: pngBase64(await renderScene({ custom: customGrids(p), palette: palette(p.theme) })),
        };
      }),
      toModelOutput: withPicture,
    }),
  };
}

export type AgentTools = ReturnType<typeof makeTools>;
