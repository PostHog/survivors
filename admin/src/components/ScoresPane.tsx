import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProspectDetail } from '@worker/api-types';
import { Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';
import { keys, useBoard } from '@/lib/queries';

export function ScoresPane({ game }: { game: ProspectDetail }) {
  const [mode, setMode] = useState('run');
  const board = useBoard(game.id, mode);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (entry: number) => api(`/prospects/${game.id}/leaderboard/${mode}/${entry}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.board(game.id, mode) }),
  });

  return (
    <div className="space-y-4 p-4">
      <Tabs value={mode} onValueChange={setMode}>
        <TabsList>
          <TabsTrigger value="run">Run</TabsTrigger>
          <TabsTrigger value="yolo">YOLO</TabsTrigger>
        </TabsList>
      </Tabs>
      {board.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">No scores yet. They appear when people finish runs in this game.</p>
      )}
      <ol className="space-y-1">
        {board.data?.map((e, i) => (
          <li key={e.id} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm">
            <span className="w-6 text-muted-foreground">{i + 1}</span>
            <span className="w-12 font-mono font-semibold">{e.name}</span>
            <span className="flex-1 tabular-nums">{e.score.toLocaleString()}</span>
            <span className="text-muted-foreground text-xs">{ago(e.at)}</span>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => remove.mutate(e.id)} title="Remove this score">
              <Trash2Icon />
              <span className="sr-only">Remove this score</span>
            </Button>
          </li>
        ))}
      </ol>
    </div>
  );
}
