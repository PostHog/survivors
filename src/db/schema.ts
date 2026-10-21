// The database, as code. `npm run db:generate` turns changes here into a new SQL file in migrations/.
import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** The slug the game on the site root uses (it is the kit's own default manifest). Its leaderboards are public; no prospect may take it. */
export const DEFAULT_SLUG = 'bug-survivors-default';

/** One themed game. The theme (what used to be theme.json) lives here, not in a file. */
export const prospects = sqliteTable(
  'prospects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** The public URL segment: <company>-<random>, 3-48 chars (48 is the leaderboard's limit). */
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    domain: text('domain'),
    /** The @posthog.com user who made it. */
    ownerEmail: text('owner_email').notNull(),
    /** JSON, validated against the kit's theme schema. */
    theme: text('theme').notNull(),
    /** pbkdf2$<iterations>$<salt>$<hash>. The game is not served without the password. */
    passwordHash: text('password_hash').notNull(),
    /** Bumped on a password reset: signs everyone out of the old password. */
    gateVersion: integer('gate_version').notNull().default(1),
    /** Bumped on every theme or sprite change: cache-busts the sprite URLs. */
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [check('slug_not_reserved', sql`${t.slug} <> 'bug-survivors-default'`)],
);

/** One row per hand-drawn slot (enemy_1, boss, ...): the .sprite text grid. Slots without a row use the kit's default art. */
export const sprites = sqliteTable(
  'sprites',
  {
    prospectId: integer('prospect_id')
      .notNull()
      .references(() => prospects.id, { onDelete: 'cascade' }),
    slot: text('slot').notNull(),
    grid: text('grid').notNull(),
  },
  (t) => [primaryKey({ columns: [t.prospectId, t.slot] })],
);

/** The admin chat for a prospect, so a conversation resumes where it left off. */
export const messages = sqliteTable(
  'messages',
  {
    prospectId: integer('prospect_id')
      .notNull()
      .references(() => prospects.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    /** The chat library's message id. */
    messageId: text('message_id').notNull(),
    role: text('role').notNull(),
    /** JSON: AI SDK UI message parts. */
    parts: text('parts').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.prospectId, t.seq] })],
);

/** Leaderboards: the top 20 per "<slug>:<mode>" board, kept by pruning on insert. */
export const scores = sqliteTable(
  'scores',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    board: text('board').notNull(),
    name: text('name').notNull(),
    score: integer('score').notNull(),
    /** JSON. */
    stats: text('stats').notNull(),
    at: integer('at').notNull(),
  },
  (t) => [index('scores_board').on(t.board, sql`${t.score} desc`, t.at)],
);

export type Prospect = typeof prospects.$inferSelect;
