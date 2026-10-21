import { useMutation } from '@tanstack/react-query';
import type { ProspectDetail } from '@worker/api-types';
import { KeyRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { CopyButton } from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, describe } from '@/lib/api';

export function SharePane({ game }: { game: ProspectDetail }) {
  const url = `${location.origin}/g/${game.slug}/`;
  const [fresh, setFresh] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const reset = useMutation({
    mutationFn: () =>
      api<{ password: string }>(`/prospects/${game.id}/password`, { method: 'POST', body: custom.trim() ? { password: custom } : {} }),
    onSuccess: (r) => {
      setFresh(r.password);
      setCustom('');
    },
  });

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link</CardTitle>
          <CardDescription>Anyone with the link and the password can play. The link is not listed or indexed anywhere.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input readOnly value={url} data-testid="share-url" />
          <CopyButton text={url} label="Link" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password</CardTitle>
          <CardDescription>
            Passwords are kept only as a hash, so they cannot be shown again. If you lost it, set a new one: that also signs out anyone who
            had the old one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fresh && (
            <div className="ph-no-capture space-y-2 rounded-md border bg-secondary p-3" data-testid="new-password">
              <Label>New password (shown once)</Label>
              <div className="flex gap-2">
                <Input readOnly value={fresh} className="font-mono" />
                <CopyButton text={fresh} label="Password" />
              </div>
              <CopyButton text={`Here is a game made for you: ${url}\nPassword: ${fresh}`} label="Message" size="default" />
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Choose one, or leave empty to generate"
              aria-label="New password"
            />
            <Button variant="outline" onClick={() => reset.mutate()} disabled={reset.isPending} data-testid="reset-password">
              <KeyRoundIcon />
              Set new password
            </Button>
          </div>
          {reset.error && <p className="text-destructive text-sm">{describe(reset.error)}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
