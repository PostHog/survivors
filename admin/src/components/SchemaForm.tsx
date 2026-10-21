// A form generated from the kit's theme JSON Schema, so the Theme tab follows the game's schema instead of duplicating it: add a field to
// the schema and it appears here. Supports what the schema uses: objects, strings (with limits, enums, a colour pattern), numbers,
// arrays of enums (the products), and fixed-length arrays of objects (the bugs).
import type { JsonSchema, Problem } from '@worker/api-types';
import { ArrowDownIcon, ArrowUpIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Path = (string | number)[];
const key = (p: Path) => p.join('.');

const LABELS: Record<string, string> = {
  prospect: 'Company',
  short: 'Short name',
  title: 'Game title',
  tagline: 'Tagline',
  palette: 'Colours',
  products: 'PostHog products (most relevant first)',
  sprite_prompt: 'What it looks like',
  starting_product: 'Starting weapon',
  pain: 'The pain, in their words',
  taunt: 'What it says when it arrives',
  product_lines: 'Card lines per product',
  win: 'You win',
  lose: 'You lose',
  bpm: 'Tempo (bpm)',
};
const nice = (k: string) => LABELS[k] ?? k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const READ_ONLY = new Set(['prospect.name', 'prospect.domain']);

export interface FormProps {
  schema: JsonSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  problems: Problem[];
  /** The whole theme, for fields that depend on others (the per-product lines depend on the chosen products). */
  root: Record<string, unknown>;
  path?: Path;
  label?: string;
}

function Problems({ path, problems }: { path: Path; problems: Problem[] }) {
  const mine = problems.filter((p) => p.path === key(path));
  return mine.map((p) => (
    <p key={p.message} className="text-destructive text-xs" role="alert">
      {p.message}
    </p>
  ));
}

const Hint = ({ schema }: { schema: JsonSchema }) =>
  schema.description ? <p className="text-muted-foreground text-xs">{schema.description}</p> : null;

export function SchemaField({ schema, value, onChange, problems, root, path = [], label }: FormProps) {
  const name = label ?? nice(String(path.at(-1) ?? ''));
  const id = `f-${key(path)}`;

  // ---- objects: a group of fields ----
  if (schema.type === 'object' && schema.properties) {
    const entries = Object.entries(schema.properties);
    const obj = (value ?? {}) as Record<string, unknown>;
    const body = (
      <div className="space-y-4">
        {entries.map(([k, sub]) => (
          <SchemaField
            key={k}
            schema={sub}
            value={obj[k]}
            root={root}
            problems={problems}
            path={[...path, k]}
            onChange={(v) => onChange({ ...obj, [k]: v })}
          />
        ))}
      </div>
    );
    return path.length === 0 ? (
      body
    ) : (
      <fieldset className="space-y-3 rounded-lg border p-4" data-testid={`group-${key(path)}`}>
        <legend className="px-1 font-medium text-sm">{name}</legend>
        <Hint schema={schema} />
        {body}
      </fieldset>
    );
  }

  // ---- a map of strings (the per-product card lines): one input per chosen product ----
  if (schema.type === 'object' && typeof schema.additionalProperties === 'object') {
    const map = (value ?? {}) as Record<string, string>;
    const products = (root.products as string[] | undefined) ?? [];
    return (
      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 font-medium text-sm">{name}</legend>
        <Hint schema={schema} />
        {products.map((p) => (
          <div key={p} className="space-y-1">
            <Label htmlFor={`${id}-${p}`} className="font-mono text-xs">
              {p}
            </Label>
            <Input
              id={`${id}-${p}`}
              value={map[p] ?? ''}
              maxLength={
                schema.additionalProperties && typeof schema.additionalProperties === 'object'
                  ? schema.additionalProperties.maxLength
                  : undefined
              }
              placeholder="(use the default line)"
              onChange={(e) => {
                const next = { ...map };
                if (e.target.value) next[p] = e.target.value;
                else delete next[p];
                onChange(next);
              }}
            />
            <Problems path={[...path, p]} problems={problems} />
          </div>
        ))}
      </fieldset>
    );
  }

  // ---- arrays ----
  if (schema.type === 'array' && schema.items?.type === 'string' && schema.items.enum) {
    const chosen = ((value ?? []) as string[]).filter((v) => schema.items?.enum?.includes(v));
    const move = (i: number, d: number) => {
      const next = [...chosen];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      onChange(next);
    };
    const available = schema.items.enum.filter((e) => !chosen.includes(e));
    return (
      <div className="space-y-2" data-testid={`field-${key(path)}`}>
        <Label>{name}</Label>
        <Hint schema={schema} />
        <ol className="space-y-1">
          {chosen.map((p, i) => (
            <li key={p} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1 text-sm">
              <span className="w-5 text-muted-foreground text-xs">{i + 1}</span>
              <span className="flex-1 font-mono text-xs">{p}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={`Move ${p} up`}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                disabled={i === chosen.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move ${p} down`}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                disabled={schema.minItems !== undefined && chosen.length <= schema.minItems}
                onClick={() => onChange(chosen.filter((c) => c !== p))}
                aria-label={`Remove ${p}`}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ol>
        {available.length > 0 && (schema.maxItems === undefined || chosen.length < schema.maxItems) && (
          <Select value="" onValueChange={(v) => onChange([...chosen, v])}>
            <SelectTrigger className="w-56" aria-label="Add a product">
              <SelectValue placeholder="Add a product..." />
            </SelectTrigger>
            <SelectContent>
              {available.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Problems path={path} problems={problems} />
      </div>
    );
  }
  if (schema.type === 'array' && schema.items?.type === 'object') {
    const list = (value ?? []) as unknown[];
    return (
      <div className="space-y-3">
        <Label>{name}</Label>
        <Hint schema={schema} />
        {list.map((item, i) => (
          <SchemaField
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed-length list: the position is the identity
            key={i}
            schema={schema.items as JsonSchema}
            value={item}
            root={root}
            problems={problems}
            path={[...path, i]}
            label={`${name.replace(/s$/, '')} ${i + 1}`}
            onChange={(v) => onChange(list.map((x, j) => (j === i ? v : x)))}
          />
        ))}
        <Problems path={path} problems={problems} />
      </div>
    );
  }

  // ---- values ----
  const readOnly = READ_ONLY.has(key(path));
  if (schema.type === 'string' && schema.enum) {
    // an enum that is the products list (the starting weapon) can only be one of the chosen products
    const options = key(path) === 'game.starting_product' ? ((root.products as string[] | undefined) ?? schema.enum) : schema.enum;
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>{name}</Label>
        <Select value={String(value ?? '')} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Hint schema={schema} />
        <Problems path={path} problems={problems} />
      </div>
    );
  }
  if (schema.type === 'string' && schema.pattern?.includes('[0-9a-fA-F]{6}')) {
    const v = String(value ?? '#000000');
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>{name}</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${name} colour`}
            value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
          />
          <Input
            id={id}
            value={v}
            onChange={(e) => onChange(e.target.value)}
            className="w-32 font-mono"
            data-testid={`field-${key(path)}`}
          />
        </div>
        <Hint schema={schema} />
        <Problems path={path} problems={problems} />
      </div>
    );
  }
  if (schema.type === 'string') {
    const text = String(value ?? '');
    const long = (schema.maxLength ?? 0) > 70;
    return (
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <Label htmlFor={id}>{name}</Label>
          {schema.maxLength && (
            <span className={`text-xs tabular-nums ${text.length > schema.maxLength ? 'text-destructive' : 'text-muted-foreground'}`}>
              {text.length}/{schema.maxLength}
            </span>
          )}
        </div>
        {long ? (
          <Textarea
            id={id}
            rows={2}
            value={text}
            readOnly={readOnly}
            onChange={(e) => onChange(e.target.value)}
            data-testid={`field-${key(path)}`}
          />
        ) : (
          <Input
            id={id}
            value={text}
            readOnly={readOnly}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value)}
            data-testid={`field-${key(path)}`}
          />
        )}
        {readOnly && <p className="text-muted-foreground text-xs">Change this in the Game tab.</p>}
        <Hint schema={schema} />
        <Problems path={path} problems={problems} />
      </div>
    );
  }
  if (schema.type === 'integer' || schema.type === 'number') {
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>{name}</Label>
        <Input
          id={id}
          type="number"
          className="w-32"
          min={schema.minimum}
          max={schema.maximum}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
        <Hint schema={schema} />
        <Problems path={path} problems={problems} />
      </div>
    );
  }
  return null;
}
