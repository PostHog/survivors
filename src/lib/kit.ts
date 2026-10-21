// What the Worker knows about the Bug Survivors kit, from src/generated/kit.json (built from game/: schema, defaults, examples,
// slots, prompts) and game/bug-survivors/default-art.json (the default art as grids).
import kit from '../generated/kit.json';
import { defaultGrid } from './default-art';

export interface SlotInfo {
  id: string;
  w: number;
  h: number;
  frames: number;
  fps?: number;
  kind?: string;
  optional?: boolean;
  prompt?: string;
}

export const SLOTS = kit.slots as SlotInfo[];
/** The slots an agent (or a person) may redraw: the ones the kit gives a brief for. */
export const EDITABLE_SLOTS = SLOTS.filter((s) => s.prompt !== undefined);
export const slotInfo = (id: string) => SLOTS.find((s) => s.id === id);
export const isEditable = (id: string) => EDITABLE_SLOTS.some((s) => s.id === id);
export const PRODUCTS = kit.products as string[];
export const THEME_SCHEMA = kit.schema;
export const DEFAULT_THEME = kit.defaultTheme;
export const EXAMPLE_THEMES = kit.examples as Record<string, unknown>;
export const PROMPTS = kit.prompts;

/** The default art for an editable slot as an editable grid (what the agent starts from), if it has one. */
export const startingGrid = (id: string) => defaultGrid(id);
