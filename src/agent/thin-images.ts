// Images are what let the agent see its own work, and they are expensive: a model re-reads every earlier image on every step. Only the
// newest few are kept in full; older ones become a one-line note.
import type { ModelMessage } from 'ai';

type Part = { type: string; [k: string]: unknown };
const isImage = (p: Part) => p.type === 'file' && typeof p.mediaType === 'string' && p.mediaType.startsWith('image/');

/** Keeps the images in the newest `keep` tool results, and replaces the images in older ones with a note. */
export function thinOldImages(messages: ModelMessage[], keep = 3): ModelMessage[] {
  let remaining = keep;
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m.role !== 'tool') continue;
    out[i] = {
      ...m,
      content: m.content.map((part) => {
        const output = (part as { output?: { type: string; value?: Part[] } }).output;
        if (part.type !== 'tool-result' || output?.type !== 'content' || !output.value?.some(isImage)) return part;
        if (remaining > 0) {
          remaining--;
          return part;
        }
        const value = output.value.map((p) =>
          isImage(p)
            ? {
                type: 'text',
                text: '(an earlier preview image was removed to save space; call get_sprite or preview_scene to see it again)',
              }
            : p,
        );
        return { ...part, output: { ...output, value } } as typeof part;
      }),
    } as ModelMessage;
  }
  return out;
}
