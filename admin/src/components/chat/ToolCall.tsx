import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool';

/** The parts of a tool call this display reads (the chat library's own type is generic over the tool set). */
export interface ToolPartLike {
  type: string;
  toolCallId: string;
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error'
    | 'approval-requested'
    | 'approval-responded'
    | 'output-denied';
  // biome-ignore lint/suspicious/noExplicitAny: tool inputs and outputs are whatever the tool defines
  input?: any;
  // biome-ignore lint/suspicious/noExplicitAny: see above
  output?: any;
  errorText?: string;
}

const SLOT_NAMES: Record<string, string> = {
  enemy_1: 'the first bug',
  enemy_2: 'the second bug',
  enemy_3: 'the third bug',
  boss: 'the boss',
  tile: 'the arena floor',
  logo: 'the logo',
};
export const slotName = (slot: string | undefined) => (slot ? (SLOT_NAMES[slot] ?? slot) : 'a sprite');

const host = (url: string | undefined) => {
  try {
    return new URL(url ?? '').hostname;
  } catch {
    return 'a page';
  }
};

/** What the agent did, in a few words. */
export function toolTitle(p: ToolPartLike): string {
  const name = p.type.replace(/^tool-/, '');
  switch (name) {
    case 'get_game':
      return 'Looked at the game';
    case 'fetch_page':
      return `Read ${host(p.input?.url)}`;
    case 'update_theme':
      return 'Changed the theme';
    case 'get_sprite':
      return `Looked at ${slotName(p.input?.slot)}`;
    case 'set_sprite':
      return `Drew ${slotName(p.input?.slot)}`;
    case 'reset_sprite':
      return `Reset ${slotName(p.input?.slot)} to the default`;
    case 'preview_scene':
      return 'Checked the whole scene';
    default:
      return name;
  }
}

/** Did this call change the game (so the preview should reload)? */
export const changedTheGame = (p: ToolPartLike) =>
  p.state === 'output-available' && p.output?.ok === true && ['tool-update_theme', 'tool-set_sprite', 'tool-reset_sprite'].includes(p.type);

const Swatch = ({ colour, label }: { colour: string; label?: string }) => (
  <span className="inline-flex items-center gap-1 text-xs" title={label ?? colour}>
    <span className="size-4 rounded border" style={{ background: colour }} />
    <span className="font-mono">{colour}</span>
  </span>
);

export function ToolCall({ part }: { part: ToolPartLike }) {
  const out = part.output;
  const failed = part.state === 'output-error' || out?.ok === false;
  const picture: string | undefined = out?.previewPng;

  return (
    <div className="mb-4 space-y-2" data-testid={`tool-${part.type.replace(/^tool-/, '')}`}>
      <Tool className="mb-0">
        <ToolHeader type={part.type as `tool-${string}`} state={part.state as never} title={toolTitle(part)} />
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput
            output={out ? { ...out, previewPng: picture ? '(image shown below)' : undefined } : undefined}
            errorText={part.errorText}
          />
        </ToolContent>
      </Tool>

      {failed && out?.problems && (
        <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-xs">
          {(out.problems as { path: string; message: string }[]).map((p) => (
            <li key={`${p.path}:${p.message}`}>
              <span className="font-mono">{p.path}</span>: {p.message}
            </li>
          ))}
        </ul>
      )}
      {failed && out?.error && <p className="text-destructive text-xs">{out.error}</p>}

      {part.type === 'tool-update_theme' && out?.ok && out.theme?.palette && (
        <div className="flex flex-wrap gap-3">
          <Swatch colour={out.theme.palette.primary} label="primary" />
          <Swatch colour={out.theme.palette.secondary} label="secondary" />
          <Swatch colour={out.theme.palette.accent} label="accent" />
        </div>
      )}
      {part.type === 'tool-fetch_page' && out?.ok && Array.isArray(out.colours) && out.colours.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {(out.colours as string[]).slice(0, 5).map((c) => (
            <Swatch key={c} colour={c} />
          ))}
        </div>
      )}
      {picture && (
        <img
          src={`data:image/png;base64,${picture}`}
          alt={toolTitle(part)}
          className="pixelated max-h-72 w-auto max-w-full rounded-md border bg-neutral-900"
          data-testid="tool-picture"
        />
      )}
    </div>
  );
}
