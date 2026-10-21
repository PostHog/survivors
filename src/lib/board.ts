// What a leaderboard accepts: the same checks (and the same error words, which the game shows players) as the games repo's
// original relay. Anyone can post a fake score with dev tools; that's the trade for no logins. The checks keep it honest-ish:
// A-Z initials minus a blocklist, sane stats, a score that fits the run's length, and a few posts a minute per IP.
import { z } from 'zod';

export const BOARD_RE = /^[a-z0-9][a-z0-9-]{0,47}:[a-z0-9-]{1,24}$/;

const BLOCK = new Set([
  'ASS',
  'CUM',
  'COK',
  'COC',
  'DIC',
  'DIK',
  'FAG',
  'FCK',
  'FUC',
  'FUK',
  'FUX',
  'GAY',
  'JIZ',
  'KKK',
  'KYS',
  'NAZ',
  'NIG',
  'NGR',
  'PIS',
  'POO',
  'SEX',
  'SHT',
  'SUK',
  'TIT',
  'VAG',
  'WTF',
  'XXX',
  'HIV',
  'ANL',
  'CNT',
  'KUM',
]);

const inRange = (lo: number, hi: number) => z.number().finite().min(lo).max(hi).transform(Math.floor);

/** The numeric stats a board keeps, with their upper bounds. Anything else a client sends is dropped. */
const STAT_LIMITS = { wave: 99, time: 4 * 3600, level: 999, kills: 1e7, players: 4, heat: 9 } as const;

const stats = z
  .record(z.string(), z.unknown())
  .default({})
  .transform((raw, ctx) => {
    const out: Record<string, number | string> = {};
    for (const [key, hi] of Object.entries(STAT_LIMITS)) {
      if (raw[key] === undefined) continue;
      const v = inRange(0, hi).safeParse(raw[key]);
      if (!v.success) {
        ctx.addIssue({ code: 'custom', message: 'bad score or stats' });
        return z.NEVER;
      }
      out[key] = v.data;
    }
    const hog = raw.hog;
    if (typeof hog === 'string' && /^[ -~]{1,24}$/.test(hog) && !/[<>"\\]/.test(hog)) out.hog = hog; // printable ASCII only
    return out;
  });

export const scoreInput = z
  .object({
    name: z
      .string('name: 3 letters A-Z')
      .transform((s) => s.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{3}$/, 'name: 3 letters A-Z'))
      .refine((n) => !BLOCK.has(n), 'try other letters'),
    score: z
      .number('bad score or stats')
      .finite('bad score or stats')
      .min(1, 'bad score or stats')
      .max(1e9, 'bad score or stats')
      .transform(Math.floor),
    stats,
  })
  // The score has to fit the run: a generous cap per second played.
  .refine(
    (v) => v.score <= 6000 * Math.max(10, typeof v.stats.time === 'number' ? v.stats.time : 0) + 600_000,
    'score does not fit the run',
  );

export type ScoreInput = z.infer<typeof scoreInput>;
