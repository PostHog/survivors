import { useMutation } from '@tanstack/react-query';
import type { KitSlot, ProspectDetail } from '@worker/api-types';
import { parseSprite, SpriteError } from '@worker/lib/sprite';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SpriteCanvas } from '@/components/SpriteCanvas';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, describe } from '@/lib/api';

const BLANK = (w: number, h: number) => `size ${w}x${h}\nlegend\n  a #ffffff\nframe\n${`${'.'.repeat(w)}\n`.repeat(h)}`;

/** Edit a sprite as text, seeing it as you type. The assistant draws the same way. */
export function SpriteEditorDialog({
  slot,
  game,
  initial,
  open,
  onOpenChange,
  onSaved,
}: {
  slot: KitSlot;
  game: ProspectDetail;
  initial: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (open) setText(initial);
  }, [open, initial]);

  const palette = game.theme.palette;
  const local = useMemo(() => {
    try {
      const spr = parseSprite(text);
      if (spr.w !== slot.w || spr.h !== slot.h) return `This slot is ${slot.w}x${slot.h}; the grid says ${spr.w}x${spr.h}.`;
      if (spr.frames.length !== slot.frames)
        return `This slot needs ${slot.frames} frame${slot.frames === 1 ? '' : 's'}; the grid has ${spr.frames.length}.`;
      return null;
    } catch (e) {
      return e instanceof SpriteError ? e.message : 'Cannot read this grid.';
    }
  }, [text, slot]);

  const save = useMutation({
    mutationFn: () => api(`/prospects/${game.id}/sprites/${slot.id}`, { method: 'PUT', body: { grid: text } }),
    onSuccess: () => {
      toast.success('Sprite saved');
      onSaved();
      onOpenChange(false);
    },
  });

  const scale = Math.max(2, Math.min(10, Math.floor(260 / Math.max(slot.w, slot.h))));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit {slot.id.replace('_', ' ')}</DialogTitle>
          <DialogDescription>
            {slot.w}x{slot.h} pixels, {slot.frames} frame{slot.frames === 1 ? '' : 's'}. Colours are hex (#rrggbb) or brand tokens: @1
            primary, @2 secondary, @3 accent, @4 dark primary, @5 light primary (add d or l for darker or lighter).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            wrap="off"
            className="h-80 font-mono text-xs leading-tight"
            data-testid="sprite-text"
          />
          <div className="space-y-2 overflow-auto">
            {!local ? <SpriteCanvas grid={text} palette={palette} scale={scale} /> : <p className="text-destructive text-sm">{local}</p>}
            {save.error instanceof ApiError && <p className="text-destructive text-sm">{describe(save.error)}</p>}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => setText(initial || BLANK(slot.w, slot.h))}>
            Undo changes
          </Button>
          <Button onClick={() => save.mutate()} disabled={!!local || save.isPending} data-testid="save-sprite">
            Save sprite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
