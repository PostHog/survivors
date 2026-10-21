import { useMutation } from '@tanstack/react-query';
import type { KitSlot, ProspectDetail, ThemeJson } from '@worker/api-types';
import { ImageIcon, PencilIcon, RotateCcwIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { LogoDialog } from '@/components/LogoDialog';
import { SpriteEditorDialog } from '@/components/SpriteEditorDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, describe } from '@/lib/api';
import { useKit } from '@/lib/queries';

/** What the theme says each redrawable slot is, so a card can say "Flaky Test" and not "enemy_1". */
function about(slot: string, theme: ThemeJson): { title: string; sub: string } {
  const g = theme.game ?? {};
  const enemy = /^enemy_(\d)$/.exec(slot);
  if (enemy) {
    const e = g.enemies?.[Number(enemy[1]) - 1];
    return { title: e?.name ?? `Bug ${enemy[1]}`, sub: e?.sprite_prompt ?? '' };
  }
  if (slot === 'boss') return { title: g.boss?.name ?? 'Boss', sub: g.boss?.sprite_prompt ?? '' };
  if (slot === 'tile') return { title: g.arena?.name ?? 'Arena floor', sub: g.arena?.sprite_prompt ?? '' };
  return { title: 'Splash logo', sub: 'Shown first, above "powered by PostHog". Without one, the PostHog logo is shown.' };
}

export function SpritesPane({ game, onChanged }: { game: ProspectDetail; onChanged: () => void }) {
  const kit = useKit();
  const [editing, setEditing] = useState<KitSlot | null>(null);
  const [logo, setLogo] = useState(false);
  const reset = useMutation({
    mutationFn: (slot: string) => api(`/prospects/${game.id}/sprites/${slot}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Back to the default art');
      onChanged();
    },
    onError: (e) => toast.error(describe(e)),
  });

  return (
    <div className="space-y-4 p-4">
      <p className="text-muted-foreground text-sm">
        The bugs, the boss and the floor can be redrawn for this company. Anything not redrawn uses the default art in the game's colours.
        Ask the assistant to draw them, or edit the pixels yourself.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {kit.data?.slots.map((slot) => {
          const mine = game.sprites.find((s) => s.slot === slot.id)?.grid;
          const { title, sub } = about(slot.id, game.theme);
          const scale = Math.max(2, Math.floor(120 / slot.h));
          return (
            <Card key={slot.id} data-testid={`slot-${slot.id}`}>
              <CardHeader className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{title}</CardTitle>
                  <Badge variant={mine ? 'default' : 'secondary'}>
                    {mine ? 'redrawn' : slot.id === 'logo' ? 'PostHog logo' : 'default art'}
                  </Badge>
                </div>
                {sub && <p className="line-clamp-2 text-muted-foreground text-xs">{sub}</p>}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid min-h-24 place-items-center rounded-md bg-neutral-900 p-3">
                  {slot.id === 'logo' && !mine ? (
                    <span className="flex items-center gap-2 text-neutral-400 text-xs">
                      <ImageIcon className="size-4" />
                      No logo yet
                    </span>
                  ) : (
                    <img
                      src={`/g/${game.slug}/theme/sprites/${slot.id}.png?v=${game.version}`}
                      alt={title}
                      className="pixelated max-w-full"
                      style={{ width: slot.w * slot.frames * scale, height: slot.h * scale }}
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {slot.id === 'logo' ? (
                    <Button size="sm" onClick={() => setLogo(true)} data-testid="upload-logo">
                      <UploadIcon />
                      {mine ? 'Replace logo' : 'Upload logo'}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(slot)}
                    disabled={slot.id === 'logo' && !mine}
                    data-testid={`edit-${slot.id}`}
                  >
                    <PencilIcon />
                    Edit pixels
                  </Button>
                  {mine && (
                    <Button size="sm" variant="ghost" onClick={() => reset.mutate(slot.id)} disabled={reset.isPending}>
                      <RotateCcwIcon />
                      {slot.id === 'logo' ? 'Remove' : 'Reset to default'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {editing && (
        <SpriteEditorDialog
          slot={editing}
          game={game}
          initial={game.sprites.find((s) => s.slot === editing.id)?.grid ?? editing.defaultGrid ?? ''}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          onSaved={onChanged}
        />
      )}
      <LogoDialog game={game} open={logo} onOpenChange={setLogo} onSaved={onChanged} />
    </div>
  );
}
