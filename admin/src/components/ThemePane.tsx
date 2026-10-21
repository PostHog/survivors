import { useMutation } from '@tanstack/react-query';
import type { ProspectDetail } from '@worker/api-types';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SchemaField } from '@/components/SchemaForm';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, api } from '@/lib/api';
import { useKit } from '@/lib/queries';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Edit every field of the theme by hand. The assistant edits the same theme; whichever changes it last wins. */
export function ThemePane({ game, onChanged }: { game: ProspectDetail; onChanged: () => void }) {
  const kit = useKit();
  const [draft, setDraft] = useState(game.theme);
  const base = useRef(game.theme);
  const [stale, setStale] = useState(false);

  // When the game changes underneath (the assistant, or a save), follow it, unless there are unsaved edits: then say so.
  useEffect(() => {
    if (same(game.theme, base.current)) return;
    if (same(draft, base.current)) {
      base.current = game.theme;
      setDraft(game.theme);
    } else setStale(true);
  }, [game.theme, draft]);

  const dirty = !same(draft, base.current);
  const save = useMutation({
    mutationFn: () => api(`/prospects/${game.id}/theme`, { method: 'PUT', body: { theme: draft } }),
    onSuccess: () => {
      base.current = draft;
      setStale(false);
      toast.success('Theme saved');
      onChanged();
    },
  });
  const problems = save.error instanceof ApiError ? save.error.problems : [];

  if (!kit.data) return <Skeleton className="m-4 h-96" />;
  return (
    <div className="space-y-4 p-4" data-testid="theme-pane">
      {stale && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <span>The game changed while you were editing. Your edits are kept here.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              base.current = game.theme;
              setDraft(game.theme);
              setStale(false);
            }}
          >
            Load the latest
          </Button>
        </div>
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <SchemaField
          schema={kit.data.schema}
          value={draft}
          onChange={(v) => setDraft(v as typeof draft)}
          problems={problems}
          root={draft}
        />
        {save.error && problems.length === 0 && <p className="text-destructive text-sm">{save.error.message}</p>}
        {problems.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm" role="alert">
            Not saved: {problems.length} thing{problems.length === 1 ? '' : 's'} to fix (marked above).
          </div>
        )}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur">
          <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setDraft(base.current)}>
            Discard
          </Button>
          <Button type="submit" disabled={!dirty || save.isPending} data-testid="save-theme">
            Save theme
          </Button>
        </div>
      </form>
    </div>
  );
}
