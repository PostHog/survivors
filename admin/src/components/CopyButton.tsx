import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** Copies `text` and says so. `label` names what was copied, for the toast. */
export function CopyButton({ text, label, size = 'sm' }: { text: string; label: string; size?: 'sm' | 'icon' | 'default' }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        toast.success(`${label} copied`);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      {size === 'icon' ? <span className="sr-only">Copy {label}</span> : 'Copy'}
    </Button>
  );
}
