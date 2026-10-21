import { type Palette, parseSprite, rasterise } from '@worker/lib/sprite';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

const FLOOR = '#15141f';

/** Draws a sprite grid (all its frames, side by side) at a whole-number zoom, in the game's colours. */
export function SpriteCanvas({
  grid,
  palette,
  scale,
  className,
}: {
  grid: string;
  palette: Partial<Palette>;
  scale: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let spr: ReturnType<typeof parseSprite>;
    try {
      spr = parseSprite(grid);
    } catch {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const frames = rasterise(spr, palette);
    const gap = 4;
    canvas.width = frames.length * (spr.w * scale + gap) - gap;
    canvas.height = spr.h * scale;
    ctx.fillStyle = FLOOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    frames.forEach((f, i) => {
      const tmp = document.createElement('canvas');
      tmp.width = spr.w;
      tmp.height = spr.h;
      tmp.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(f), spr.w, spr.h), 0, 0);
      ctx.drawImage(tmp, i * (spr.w * scale + gap), 0, spr.w * scale, spr.h * scale);
    });
  }, [grid, palette, scale]);

  return <canvas ref={ref} className={cn('pixelated max-w-full rounded border', className)} />;
}
