import { KeyRoundIcon, LogOutIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Button } from '@/components/ui/button';
import { startAnalytics } from '@/lib/analytics';
import { useLlmSettings } from '@/lib/llm-settings';
import { useMe } from '@/lib/queries';

export function Layout() {
  const me = useMe();
  const llm = useLlmSettings();
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    if (me.data) void startAnalytics(me.data);
  }, [me.data]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="grid size-7 place-items-center rounded bg-primary font-mono text-primary-foreground text-xs">S</span>
          Survivors
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSettings(true)} data-testid="ai-settings">
            <KeyRoundIcon />
            AI settings
            <span
              className={`size-2 rounded-full ${llm.apiKey ? 'bg-green-500' : 'bg-amber-500'}`}
              title={llm.apiKey ? 'Key saved in this browser' : 'No key yet'}
            />
          </Button>
          <span className="hidden text-muted-foreground text-sm sm:inline" data-testid="who">
            {me.data?.name ?? ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await fetch('/oauth/logout', { method: 'POST' });
              location.assign('/');
            }}
          >
            <LogOutIcon />
            Sign out
          </Button>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
      <SettingsDialog open={settings} onOpenChange={setSettings} />
    </div>
  );
}
