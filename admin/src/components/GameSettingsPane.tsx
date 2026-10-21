import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProspectDetail } from '@worker/api-types';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api, describe } from '@/lib/api';
import { keys } from '@/lib/queries';

export function GameSettingsPane({ game }: { game: ProspectDetail }) {
  const [name, setName] = useState(game.name);
  const [domain, setDomain] = useState(game.domain ?? '');
  const qc = useQueryClient();
  const navigate = useNavigate();

  const save = useMutation({
    mutationFn: () => api(`/prospects/${game.id}`, { method: 'PATCH', body: { name, domain: domain.trim() ? domain : null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.game(game.id) });
      qc.invalidateQueries({ queryKey: keys.games });
      toast.success('Saved');
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/prospects/${game.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.games });
      toast.success(`${game.name} deleted`);
      navigate('/');
    },
  });
  const problem = (f: string) => (save.error instanceof ApiError ? save.error.problems.find((p) => p.path === f)?.message : undefined);

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company</CardTitle>
          <CardDescription>The name appears in the game itself. The link does not change.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="gname">Name</Label>
              <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              {problem('name') && <p className="text-destructive text-sm">{problem('name')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="gdomain">Website</Label>
              <Input id="gdomain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acmerockets.com" />
              {problem('domain') && <p className="text-destructive text-sm">{problem('domain')}</p>}
            </div>
            {save.error &&
              !(save.error instanceof ApiError && save.error.problems.some((p) => p.path === 'name' || p.path === 'domain')) && (
                <p className="text-destructive text-sm">{describe(save.error)}</p>
              )}
            <Button type="submit" disabled={save.isPending || !name.trim() || (name === game.name && domain === (game.domain ?? ''))}>
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Delete this game</CardTitle>
          <CardDescription>
            Removes the game, its sprites, its conversation and its scores. The link stops working. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" data-testid="delete-game">
                Delete {game.name}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {game.name}?</AlertDialogTitle>
                <AlertDialogDescription>Anyone who has the link will lose access. Created by {game.ownerEmail}.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate()} data-testid="confirm-delete">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
