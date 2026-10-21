// Runtime theme sanitiser driven by the kit's JSON Schema (a small subset: type, properties,
// items, enum, min/maxLength, pattern, min/maxItems, minimum/maximum, uniqueItems). Anything
// missing or invalid falls back to the default theme's value at the same path, so bad content
// can never crash a game. build-game / check_theme.py validate strictly before this; this is the safety net.
import { cleanText } from './font';

type Schema = Record<string, any>;

export function sanitize(value: any, schema: Schema, fallback: any, path: string, issues: string[], inArray = false): any {
  const t = schema.type;
  const bad = (why: string) => { issues.push(`${path || '(root)'}: ${why}`); return clone(fallback); };
  if (value === undefined || value === null) {
    if (fallback !== undefined) issues.push(`${path}: missing`);
    return clone(fallback);
  }
  if (schema.enum && !schema.enum.includes(value)) return bad(`not one of ${schema.enum.join('|')}`);
  switch (t) {
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return bad('not an object');
      const out: any = {};
      const props = schema.properties ?? {};
      const required: string[] = schema.required ?? [];
      for (const k of Object.keys(props)) {
        // Inside array items the fallback is an unrelated default item: only borrow required fields.
        if (inArray && (value[k] === undefined || value[k] === null) && !required.includes(k)) continue;
        const v = sanitize(value[k], props[k], fallback?.[k], path ? `${path}.${k}` : k, issues, inArray);
        if (v !== undefined) out[k] = v;
      }
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        for (const k of Object.keys(value)) {
          if (k in props) continue;
          const v = sanitize(value[k], schema.additionalProperties, undefined, `${path}.${k}`, issues, inArray);
          if (v !== undefined) out[k] = v;
        }
      }
      return out;
    }
    case 'array': {
      if (!Array.isArray(value)) return bad('not an array');
      const fb: any[] = Array.isArray(fallback) ? fallback : [];
      let out = value.map((v, i) => sanitize(v, schema.items ?? {}, fb[i] ?? fb[0], `${path}[${i}]`, issues, true))
        .filter((v) => v !== undefined);
      if (schema.uniqueItems) out = out.filter((v, i) => out.findIndex((w) => JSON.stringify(w) === JSON.stringify(v)) === i);
      if (schema.maxItems !== undefined && out.length > schema.maxItems) {
        issues.push(`${path}: ${out.length} items, max ${schema.maxItems}`);
        out = out.slice(0, schema.maxItems);
      }
      if (schema.minItems !== undefined && out.length < schema.minItems) {
        issues.push(`${path}: ${out.length} items, min ${schema.minItems}`);
        for (const f of fb) {
          if (out.length >= schema.minItems) break;
          if (!out.some((v) => JSON.stringify(v) === JSON.stringify(f))) out.push(clone(f));
        }
      }
      return out;
    }
    case 'string': {
      if (typeof value !== 'string') return bad('not a string');
      let s = schema.format === 'raw' ? value : cleanText(value).trim();
      if (schema.pattern && !new RegExp(schema.pattern).test(s)) return bad('does not match pattern');
      if (schema.maxLength !== undefined && s.length > schema.maxLength) {
        issues.push(`${path}: ${s.length} chars, max ${schema.maxLength}`);
        s = clip(s, schema.maxLength);
      }
      if (schema.minLength !== undefined && s.length < schema.minLength) return bad('too short');
      return s;
    }
    case 'integer':
    case 'number': {
      let n = typeof value === 'string' ? Number(value) : value;
      if (typeof n !== 'number' || !isFinite(n)) return bad('not a number');
      if (t === 'integer') n = Math.round(n);
      if (schema.minimum !== undefined && n < schema.minimum) n = schema.minimum;
      if (schema.maximum !== undefined && n > schema.maximum) n = schema.maximum;
      return n;
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : bad('not a boolean');
    default:
      return value;
  }
}

/** Cut at a word boundary where one is close, so clipped names still read. */
export function clip(s: string, max: number) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim();
}

const clone = (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
