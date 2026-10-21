import { useMutation } from '@tanstack/react-query';
import type { ProspectDetail } from '@worker/api-types';
import { UploadIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { SpriteCanvas } from '@/components/SpriteCanvas';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, describe } from '@/lib/api';
import { type LogoOption, logoFromPixels, splashBg } from '@/lib/logo';
import { loadImagePixels } from '@/lib/logo-load';

/** Upload a company's real logo; four pixel versions of it are made right here in the browser, and one is chosen for the splash screen. */
export function LogoDialog({
  game,
  open,
  onOpenChange,
  onSaved,
}: {
  game: ProspectDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [options, setOptions] = useState<LogoOption[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const palette = game.theme.palette;
  const bg = splashBg(palette);

  const save = useMutation({
    mutationFn: (grid: string) => api(`/prospects/${game.id}/sprites/logo`, { method: 'PUT', body: { grid } }),
    onSuccess: () => {
      toast.success('Logo saved');
      onSaved();
      onOpenChange(false);
    },
  });

  async function read(f: File) {
    setProblem(null);
    setOptions(null);
    try {
      setOptions(logoFromPixels(await loadImagePixels(f), palette));
    } catch (e) {
      setProblem(e instanceof Error ? `Could not read that image: ${e.message}` : 'Could not read that image');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setOptions(null);
          setProblem(null);
        }
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Splash logo</DialogTitle>
          <DialogDescription>
            Upload their logo (PNG, JPEG, WebP or SVG; a transparent background works best). It is turned into pixel art in your browser.
            Pick the version that reads best: it is shown first, above "powered by PostHog".
          </DialogDescription>
        </DialogHeader>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          className="sr-only"
          data-testid="logo-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) read(f);
            e.target.value = '';
          }}
        />
        <Button type="button" variant="outline" onClick={() => file.current?.click()} className="self-start">
          <UploadIcon />
          Choose a logo file
        </Button>
        {problem && <p className="text-destructive text-sm">{problem}</p>}
        {save.error && <p className="text-destructive text-sm">{describe(save.error)}</p>}
        {options && (
          <div className="grid gap-3 sm:grid-cols-2" data-testid="logo-options">
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate(o.grid)}
                className="rounded-lg border p-3 text-left transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`logo-option-${o.key}`}
              >
                <div className="rounded p-2" style={{ background: bg }}>
                  <SpriteCanvas grid={o.grid} palette={palette} scale={2} className="border-0" />
                </div>
                <div className="mt-2 font-medium text-sm">
                  {o.key.toUpperCase()}: {o.name}
                </div>
                <div className="text-muted-foreground text-xs">{o.why}</div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
