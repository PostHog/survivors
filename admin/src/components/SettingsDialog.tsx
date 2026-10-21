import { PROVIDERS, type ProviderId } from '@worker/provider-list';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clearLlmSettings, saveLlmSettings, useLlmSettings } from '@/lib/llm-settings';

const DEFAULT = '__default__';

/** Where a person brings their own AI key. It is kept in this browser only. */
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const saved = useLlmSettings();
  const [provider, setProvider] = useState<ProviderId>(saved.provider);
  const [apiKey, setApiKey] = useState(saved.apiKey);
  const [model, setModel] = useState(saved.model);

  // Start from what is saved each time the dialog opens.
  useEffect(() => {
    if (open) {
      setProvider(saved.provider);
      setApiKey(saved.apiKey);
      setModel(saved.model);
    }
  }, [open, saved.provider, saved.apiKey, saved.model]);

  const info = PROVIDERS[provider];
  const known = (info.models as readonly string[]).includes(model);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>AI settings</DialogTitle>
          <DialogDescription>
            The chat uses your own API key. It is stored only in this browser and sent to the Survivors server with each message, which uses
            it for that message and does not keep it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveLlmSettings({ provider, apiKey, model });
            toast.success('AI settings saved in this browser');
            onOpenChange(false);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select
              value={provider}
              onValueChange={(v) => {
                setProvider(v as ProviderId);
                setModel('');
              }}
            >
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDERS[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ph-no-capture space-y-2">
            <Label htmlFor="apikey">API key</Label>
            <Input
              id="apikey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={info.keyHint}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Select
              value={model === '' ? DEFAULT : known ? model : '__custom__'}
              onValueChange={(v) => setModel(v === DEFAULT ? '' : v === '__custom__' ? 'my-model' : v)}
            >
              <SelectTrigger id="model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT}>Default ({info.defaultModel})</SelectItem>
                {info.models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">Another model...</SelectItem>
              </SelectContent>
            </Select>
            {model !== '' && !known && (
              <Input aria-label="Model name" value={model} onChange={(e) => setModel(e.target.value)} placeholder="model name" />
            )}
            <p className="text-muted-foreground text-xs">
              Pick a model that can look at images: the agent checks its own sprites by looking at them.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {saved.apiKey ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  clearLlmSettings();
                  toast.success('Key removed from this browser');
                  onOpenChange(false);
                }}
              >
                Remove key
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={apiKey.trim().length < 8}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
