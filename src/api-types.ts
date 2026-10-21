// The shapes the JSON API returns, shared by the Worker and the admin app. No imports: this file has to compile in both worlds
// (the Worker's, with Cloudflare types, and the browser's, with DOM types).

export interface Problem {
  path: string;
  message: string;
}

export interface Me {
  email: string;
  name: string;
}

export interface ProspectSummary {
  id: number;
  slug: string;
  name: string;
  domain: string | null;
  ownerEmail: string;
  /** Bumps on every change; the preview and sprite URLs carry it. */
  version: number;
  createdAt: number;
  updatedAt: number;
  hasLogo: number;
  spriteCount: number;
}

export interface ProspectSprite {
  slot: string;
  grid: string;
}

/** The theme is JSON checked against the kit's schema on the server; the admin app edits it generically. */
// biome-ignore lint/suspicious/noExplicitAny: a theme is arbitrary JSON, shaped by the kit's schema at run time
export type ThemeJson = Record<string, any>;

export interface ProspectDetail extends ProspectSummary {
  theme: ThemeJson;
  sprites: ProspectSprite[];
}

export interface JsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  uniqueItems?: boolean;
  additionalProperties?: boolean | JsonSchema;
}

export interface KitSlot {
  id: string;
  w: number;
  h: number;
  frames: number;
  fps?: number;
  kind?: string;
  optional?: boolean;
  prompt?: string;
  /** The kit's own art for this slot as an editable grid; null for the logo, which has no default. */
  defaultGrid: string | null;
}

export interface KitInfo {
  schema: JsonSchema;
  products: string[];
  slots: KitSlot[];
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  score: number;
  stats: Record<string, number | string>;
  at: number;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: unknown[];
}

/** An error body from the API. */
export interface ApiErrorBody {
  error: string;
  message?: string;
  problems?: Problem[];
}
