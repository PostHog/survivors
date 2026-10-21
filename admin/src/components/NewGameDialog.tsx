import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProspectDetail } from '@worker/api-types';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CopyButton } from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api, describe } from '@/lib/api';
import { keys } from '@/lib/queries';

interface Created {
  prospect: ProspectDetail;
  password: string;
  url: string;
}

export function NewGameDialog() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [password, setPassword] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: () =>
      api<Created>('/prospects', {
        method: 'POST',
        body: { name, ...(domain.trim() ? { domain } : {}), ...(password.trim() ? { password } : {}) },
      }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: keys.games });
      setCreated(c);
    },
  });

  const reset = () => {
    setName('');
    setDomain('');
    setPassword('');
    setCreated(null);
    create.reset();
  };
  const problem = (field: string) =>
    create.error instanceof ApiError ? create.error.problems.find((p) => p.path === field)?.message : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button data-testid="new-game">
          <PlusIcon />
          New game
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Game created for {created.prospect.name}</DialogTitle>
              <DialogDescription>
                Share the link and the password with your prospect. The password is shown only now: it cannot be looked up later, only
                reset.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={created.url} data-testid="created-url" />
                  <CopyButton text={created.url} label="Link" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <div className="flex gap-2">
                  <Input readOnly value={created.password} data-testid="created-password" className="font-mono" />
                  <CopyButton text={created.password} label="Password" />
                </div>
              </div>
              <CopyButton
                text={`Here is a game made for you: ${created.url}\nPassword: ${created.password}`}
                label="Message"
                size="default"
              />
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  setOpen(false);
                  navigate(`/games/${created.prospect.id}`);
                  reset();
                }}
                data-testid="open-new-game"
              >
                Open the workspace
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New game</DialogTitle>
              <DialogDescription>
                Start from the default game, made out to a company. You customise it in the workspace, mostly by chatting.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="name">Company name</Label>
                <Input
                  id="name"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Rockets"
                  maxLength={40}
                  required
                />
                {problem('name') && <p className="text-destructive text-sm">{problem('name')}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Website (optional)</Label>
                <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acmerockets.com" />
                {problem('domain') && <p className="text-destructive text-sm">{problem('domain')}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw">Password (optional)</Label>
                <Input id="pw" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave empty to generate one" />
                {problem('password') && <p className="text-destructive text-sm">{problem('password')}</p>}
              </div>
              {create.error && !(create.error instanceof ApiError && create.error.problems.length) && (
                <p className="text-destructive text-sm">{describe(create.error)}</p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={create.isPending || !name.trim()} data-testid="create-game">
                  {create.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
