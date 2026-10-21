import { ExternalLinkIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** The game itself, live. A signed-in person needs no password to see it, so this is the real page, not a copy. */
export function PreviewPane({ slug, version }: { slug: string; version: number }) {
  const [reload, setReload] = useState(0);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
        <span className="text-muted-foreground">Live preview (click the game, then use the arrow keys)</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setReload((n) => n + 1)}>
            <RefreshCwIcon />
            Restart
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/g/${slug}/`} target="_blank" rel="noreferrer">
              <ExternalLinkIcon />
              Open
            </a>
          </Button>
        </div>
      </div>
      {/* The key changes when the game does (version) or on Restart: a new key is a fresh page. */}
      <iframe
        key={`${version}-${reload}`}
        src={`/g/${slug}/`}
        title="Game preview"
        className="min-h-0 w-full flex-1 bg-black"
        allow="autoplay; gamepad"
        data-testid="preview"
      />
    </div>
  );
}
