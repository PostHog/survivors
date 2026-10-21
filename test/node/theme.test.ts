import { describe, expect, it } from 'vitest';
import type { ThemeJson } from '../../src/api-types';
import { DEFAULT_THEME, EXAMPLE_THEMES, PRODUCTS } from '../../src/lib/kit';
import { newTheme, type Theme, validateTheme } from '../../src/lib/theme';

const problems = (raw: unknown, name = 'Acme Rockets') => {
  const r = validateTheme(raw, { name });
  return r.ok ? [] : r.problems.map((p) => `${p.path}: ${p.message}`);
};
/** A valid theme to break one field of. */
const base = (): Theme => newTheme('Acme Rockets', 'acmerockets.com');
const edit = (fn: (t: ThemeJson) => void) => {
  const t = base() as ThemeJson;
  fn(t);
  return problems(t);
};

describe('theme validation', () => {
  it("accepts the kit's default theme and every example theme the game ships", () => {
    expect(validateTheme(DEFAULT_THEME, { name: 'Your Company' }).ok).toBe(true);
    for (const [name, theme] of Object.entries(EXAMPLE_THEMES)) {
      const company = (theme as Theme).prospect.name;
      expect(problems(theme, company), name).toEqual([]);
    }
  });

  it('accepts the theme a new prospect starts with, made out to that company', () => {
    const t = newTheme('Acme Rockets', 'acmerockets.com');
    expect(validateTheme(t, { name: 'Acme Rockets', domain: 'acmerockets.com' }).ok).toBe(true);
    expect(t.prospect).toEqual({ name: 'Acme Rockets', short: 'Acme Rockets', domain: 'acmerockets.com' });
    expect(t.title).toBe('Acme Rockets vs The Bugs');
    expect(t.tagline).toBe('Made for Acme Rockets by PostHog');
    expect(t.text.credits).toBe('Made for Acme Rockets by PostHog');
  });

  it('keeps the generated title, tagline and credits inside their limits for a long company name', () => {
    const t = newTheme('The International Association of Very Long Company Names Incorporated');
    expect(validateTheme(t, { name: 'The International Association of Very Long Company Names Incorporated' }).ok).toBe(true);
  });

  it("applies the prospect's name and domain, whatever the theme says, and never lets short run past 14 characters", () => {
    const t = base() as ThemeJson;
    t.prospect = { name: 'Someone Else', short: 'x'.repeat(30), domain: 'evil.example' };
    const r = validateTheme(t, { name: 'Acme Rockets', domain: 'acmerockets.com' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.theme.prospect).toEqual({ name: 'Acme Rockets', short: 'x'.repeat(14), domain: 'acmerockets.com' });
  });

  it('says where a schema violation is, in words', () => {
    expect(edit((t) => (t.title = 'x'))).toContainEqual(expect.stringMatching(/^title: /));
    expect(edit((t) => (t.palette.primary = 'orange'))).toContainEqual(expect.stringMatching(/^palette\.primary: /));
    expect(edit((t) => (t.game.enemies = t.game.enemies.slice(0, 2)))).toContainEqual(expect.stringMatching(/^game\.enemies: /));
    expect(edit((t) => (t.game.enemies[1].name = 'n'.repeat(40)))).toContainEqual(expect.stringMatching(/^game\.enemies\.1\.name: /));
    expect(edit((t) => (t.game.boss.taunt = 't'.repeat(80)))).toContainEqual(expect.stringMatching(/^game\.boss\.taunt: /));
    expect(edit((t) => (t.surprise = true))).toContain('surprise: is not an allowed field'); // unknown fields are refused, by name
    expect(edit((t) => (t.game.boss.extra = 1))).toContain('game.boss.extra: is not an allowed field');
    expect(edit((t) => delete t.palette)).not.toEqual([]);
    expect(edit((t) => (t.products = ['session_replay', 'nonsense', 'surveys']))).not.toEqual([]);
  });

  it('reports each problem once, not once per ancestor', () => {
    const found = edit((t) => (t.game.enemies[1].name = 'n'.repeat(40)));
    expect(found.filter((p) => p.startsWith('game.enemies.1.name'))).toHaveLength(1);
    expect(found.some((p) => /does not match|False boolean|Items did not/.test(p))).toBe(false);
    expect(found).toEqual(['game.enemies.1.name: String is too long (40 > 18).']);
  });

  it('rejects a starting product that is not among the products', () => {
    const other = PRODUCTS.find((p) => p !== 'surveys') as string;
    expect(
      edit((t) => {
        t.products = PRODUCTS.filter((p) => p !== other).slice(0, 3);
        t.game.starting_product = other;
      }),
    ).toContain('game.starting_product: must also be listed in products');
  });

  it('keeps competitors out, but lets the prospect be named', () => {
    expect(edit((t) => (t.game.boss.name = 'The Datadog Hydra'))).toContainEqual(
      expect.stringContaining("names a competitor or other company ('datadog')"),
    );
    expect(edit((t) => (t.game.enemies[0].pain = 'Mixpanel funnels leak'))).toContainEqual(expect.stringContaining('mixpanel'));
    expect(edit((t) => (t.text.win = 'Better than Amplitude'))).toContainEqual(expect.stringContaining('amplitude'));
    expect(edit((t) => (t.game.boss.name = 'Segmentation Fault'))).toEqual([]); // a whole word, not a substring
    // a company that shares a name with a listed competitor may name itself
    const seg = newTheme('Segment');
    expect(validateTheme(seg, { name: 'Segment' }).ok).toBe(true);
  });

  it('keeps unsafe words and emoji out', () => {
    expect(edit((t) => (t.game.enemies[0].name = 'Stupid Bug'))).toContainEqual(expect.stringContaining("contains 'stupid'"));
    expect(edit((t) => (t.text.lose = 'Well, hell no.'))).toContainEqual(expect.stringContaining("contains 'hell'"));
    expect(edit((t) => (t.tagline = 'Ship it 🚀'))).toContainEqual(expect.stringContaining('emoji'));
    expect(edit((t) => (t.tagline = 'Ship it ✨'))).toContainEqual(expect.stringContaining('emoji'));
  });

  it('refuses things that are not themes', () => {
    for (const bad of [null, 'a theme', 42, [], undefined]) expect(problems(bad)).toEqual(['(root): a theme is a JSON object']);
  });
});
