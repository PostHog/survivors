import { ExternalLinkIcon, GamepadIcon, ImageIcon } from 'lucide-react';
import { Link } from 'react-router';
import { CopyButton } from '@/components/CopyButton';
import { NewGameDialog } from '@/components/NewGameDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ago } from '@/lib/format';
import { useGames } from '@/lib/queries';

export function GamesPage() {
  const games = useGames();
  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Games</h1>
          <p className="text-muted-foreground text-sm">A game for each prospect: its own link and password.</p>
        </div>
        <NewGameDialog />
      </div>

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">The default game</CardTitle>
            <CardDescription>Uncustomised and public: share it as it is.</CardDescription>
          </div>
          <div className="flex gap-2">
            <CopyButton text={`${location.origin}/`} label="Link" />
            <Button variant="outline" size="sm" asChild>
              <a href="/" target="_blank" rel="noreferrer">
                <ExternalLinkIcon />
                Play
              </a>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {games.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}
      {games.data?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <GamepadIcon className="size-8 text-muted-foreground" />
            <p className="font-medium">No games yet</p>
            <p className="max-w-sm text-muted-foreground text-sm">
              Make one for a prospect: pick a company, then tell the assistant what you know about them and it will theme the whole game.
            </p>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2" data-testid="game-list">
        {games.data?.map((g) => (
          <Link key={g.id} to={`/games/${g.id}`} className="group" data-testid="game-card">
            <Card className="h-full transition-colors group-hover:border-primary/60">
              <CardHeader className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{g.name}</CardTitle>
                  {g.hasLogo ? <Badge variant="secondary">logo</Badge> : null}
                </div>
                <CardDescription>{g.domain ?? 'no website'}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-muted-foreground text-xs">
                <span>
                  {g.ownerEmail.split('@')[0]} · {ago(g.updatedAt)}
                </span>
                <span className="flex items-center gap-1">
                  <ImageIcon className="size-3" />
                  {g.spriteCount} redrawn
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
