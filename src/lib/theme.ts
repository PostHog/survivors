// Theme validation: a port of the games repo's pipeline/tools/check_theme.py + theme_rules.py. A theme must pass the kit's JSON
// Schema, the content filter and the kit's cross-field rule, with the prospect's fixed fields (name, domain) applied first.
import { Validator } from '@cfworker/json-schema';
import { DEFAULT_THEME, THEME_SCHEMA } from './kit';

export interface Problem {
  path: string;
  message: string;
}
export interface Theme {
  prospect: { name: string; short: string; domain?: string };
  title: string;
  tagline: string;
  palette: { primary: string; secondary: string; accent: string };
  products: string[];
  text: { win: string; lose: string; credits: string };
  game: { starting_product: string } & Record<string, unknown>;
  [k: string]: unknown;
}
/** The fields of a prospect the theme may not contradict. */
export interface Fixed {
  name: string;
  domain?: string | null;
}

// Other companies and unsafe words are kept out of every game (the content rules every theme must follow).
const COMPETITORS = [
  'amplitude',
  'mixpanel',
  'heap analytics',
  'fullstory',
  'logrocket',
  'hotjar',
  'pendo',
  'optimizely',
  'launchdarkly',
  'statsig',
  'split.io',
  'sentry',
  'datadog',
  'new relic',
  'segment',
  'google analytics',
  'adobe analytics',
  'growthbook',
  'rollbar',
  'bugsnag',
  'smartlook',
  'clarity',
  'kissmetrics',
  'quantum metric',
  'contentsquare',
  'glassbox',
  'userpilot',
  'appcues',
  'chameleon',
  'qualtrics',
  'typeform',
  'surveymonkey',
  'snowflake',
  'bigquery',
  'databricks',
  'fivetran',
  'rudderstack',
];
const BLOCKLIST = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'dick',
  'piss',
  'bastard',
  'damn',
  'hell ',
  'sexy',
  'nazi',
  'kill yourself',
  'drunk',
  'beer',
  'vodka',
  'weed',
  'cocaine',
  'stupid',
  'idiot',
  'dumb',
  'moron',
  'suck',
];
const EMOJI = /[\u{1F000}-\u{1FAFF}]|[\u2600-\u27BF]|\uFE0F/u; // the pixel font can't draw them
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function* strings(v: unknown, path = ''): Generator<[string, string]> {
  if (typeof v === 'string') yield [path, v];
  else if (Array.isArray(v)) for (const [i, x] of v.entries()) yield* strings(x, `${path}[${i}]`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* strings(x, path ? `${path}.${k}` : k);
}

export function contentProblems(theme: unknown, companyName: string): Problem[] {
  const allowed = new Set([companyName.toLowerCase(), 'posthog']);
  const out: Problem[] = [];
  for (const [path, s] of strings(theme)) {
    const low = s.toLowerCase();
    for (const c of COMPETITORS) {
      if (new RegExp(`\\b${escapeRegExp(c)}\\b`).test(low) && !allowed.has(c)) {
        out.push({ path, message: `names a competitor or other company ('${c}'); use a generic problem instead` });
      }
    }
    for (const w of BLOCKLIST) if (low.includes(w)) out.push({ path, message: `contains '${w.trim()}', which isn't allowed` });
    if (EMOJI.test(s)) out.push({ path, message: "contains emoji; the pixel font can't draw them" });
  }
  return out;
}

const validator = new Validator(THEME_SCHEMA as never, '2020-12', false);

/** Fields the prospect record decides, not the author of the theme (the games repo's apply_brief). Returns a copy. */
export function applyFixed(theme: unknown, fixed: Fixed): unknown {
  const t = structuredClone(theme) as Record<string, unknown>;
  const p = (t.prospect && typeof t.prospect === 'object' ? t.prospect : {}) as Record<string, unknown>;
  p.name = fixed.name.slice(0, 40);
  if (fixed.domain) p.domain = fixed.domain.slice(0, 60);
  p.short = String(p.short || fixed.name).slice(0, 14);
  t.prospect = p;
  return t;
}

/** The schema validator reports every ancestor of a failure too ("Items did not match schema."): keep only the leaves. */
function schemaProblems(theme: unknown): Problem[] {
  const result = validator.validate(theme);
  if (result.valid) return [];
  const wrapper = /^(Property ".*" does not match (additional properties )?schema\.|Items did not match schema\.)$/;
  const all = result.errors
    .filter((e) => !wrapper.test(e.error))
    .map((e) => ({ path: e.instanceLocation.replace(/^#\/?/, '').replaceAll('/', '.') || '(root)', message: e.error }));
  const out: Problem[] = [];
  for (const e of all) {
    // "False boolean schema" is how additionalProperties:false reports a field that should not be there. When a real error sits at
    // or below the same place it is just an ancestor repeating it; otherwise it is the unknown field itself.
    if (e.message === 'False boolean schema.') {
      const below = (o: Problem) =>
        o.message !== e.message && (e.path === '(root)' || o.path === e.path || o.path.startsWith(`${e.path}.`));
      if (all.some(below)) continue;
      e.message = 'is not an allowed field';
    }
    if (!out.some((o) => o.path === e.path && o.message === e.message)) out.push(e);
  }
  return out;
}

export function validateTheme(raw: unknown, fixed: Fixed): { ok: true; theme: Theme } | { ok: false; problems: Problem[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, problems: [{ path: '(root)', message: 'a theme is a JSON object' }] };
  const theme = applyFixed(raw, fixed);
  const problems: Problem[] = [];
  problems.push(...schemaProblems(theme));
  problems.push(...contentProblems(theme, fixed.name));
  const t = theme as Theme;
  if (t.game?.starting_product !== undefined && !t.products?.includes(t.game.starting_product)) {
    problems.push({ path: 'game.starting_product', message: 'must also be listed in products' });
  }
  return problems.length ? { ok: false, problems } : { ok: true, theme: t };
}

/** The theme a new prospect starts with: the kit default, made out to this company (the games repo's safe_theme). */
export function newTheme(name: string, domain?: string | null): Theme {
  const t = structuredClone(DEFAULT_THEME) as Theme;
  const short = name.slice(0, 14);
  t.prospect = { name: name.slice(0, 40), short, ...(domain ? { domain: domain.slice(0, 60) } : {}) };
  t.title = `${short} vs The Bugs`.slice(0, 30);
  t.tagline = `Made for ${name} by PostHog`.slice(0, 48);
  t.text.credits = `Made for ${name} by PostHog`.slice(0, 80);
  return t;
}
