import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Link, useParams } from 'react-router';
import { ChatPanel } from '@/components/chat/Chat';
import { GameSettingsPane } from '@/components/GameSettingsPane';
import { PreviewPane } from '@/components/PreviewPane';
import { ScoresPane } from '@/components/ScoresPane';
import { SharePane } from '@/components/SharePane';
import { SpritesPane } from '@/components/SpritesPane';
import { ThemePane } from '@/components/ThemePane';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api';
import { keys, useGame } from '@/lib/queries';

export function WorkspacePage() {
  const id = Number(useParams().id);
  const game = useGame(id);
  const qc = useQueryClient();
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: keys.game(id) }), [qc, id]);

  if (game.error instanceof ApiError && game.error.status === 404) {
    return (
      <div className="p-6">
        <p className="mb-2 font-medium">That game does not exist (it may have been deleted).</p>
        <Link to="/" className="underline">
          Back to the games
        </Link>
      </div>
    );
  }
  if (!game.data) return <Skeleton className="m-6 h-96" />;
  const p = game.data.prospect;

  return (
    <div className="grid h-full lg:grid-cols-[minmax(360px,440px)_1fr]" data-testid="workspace">
      <section className="flex min-h-0 flex-col border-r bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <Link to="/" className="text-muted-foreground text-xs hover:underline">
              All games
            </Link>
            <h1 className="truncate font-semibold" data-testid="game-title">
              {p.name}
            </h1>
          </div>
          <span className="text-muted-foreground text-xs">v{p.version}</span>
        </div>
        <div className="min-h-0 flex-1">
          <ChatPanel gameId={p.id} gameName={p.name} domain={p.domain} onChanged={refresh} />
        </div>
      </section>

      <section className="min-h-0 min-w-0">
        <Tabs defaultValue="preview" className="flex h-full flex-col gap-0">
          <TabsList className="m-3 self-start">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="sprites">Sprites</TabsTrigger>
            <TabsTrigger value="theme">Theme</TabsTrigger>
            <TabsTrigger value="share">Share</TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
            <TabsTrigger value="settings">Game</TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="min-h-0 flex-1">
            <PreviewPane slug={p.slug} version={p.version} />
          </TabsContent>
          <TabsContent value="sprites" className="min-h-0 flex-1 overflow-y-auto">
            <SpritesPane game={p} onChanged={refresh} />
          </TabsContent>
          <TabsContent value="theme" className="min-h-0 flex-1 overflow-y-auto">
            <ThemePane game={p} onChanged={refresh} />
          </TabsContent>
          <TabsContent value="share" className="min-h-0 flex-1 overflow-y-auto">
            <SharePane game={p} />
          </TabsContent>
          <TabsContent value="scores" className="min-h-0 flex-1 overflow-y-auto">
            <ScoresPane game={p} />
          </TabsContent>
          <TabsContent value="settings" className="min-h-0 flex-1 overflow-y-auto">
            <GameSettingsPane game={p} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
