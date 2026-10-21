import { useChat } from '@ai-sdk/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type FileUIPart, type UIMessage } from 'ai';
import { ImageIcon, KeyRoundIcon, MessageSquarePlusIcon, SparklesIcon, XIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input';
import { Suggestion } from '@/components/ai-elements/suggestion';
import { changedTheGame, ToolCall, type ToolPartLike } from '@/components/chat/ToolCall';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { llmHeaders, useLlmSettings } from '@/lib/llm-settings';
import { fetchMessages, keys } from '@/lib/queries';

interface Props {
  gameId: number;
  gameName: string;
  domain: string | null;
  /** Called whenever the agent has changed the game, so the preview and the panels can refresh. */
  onChanged: () => void;
}

/** The server answers errors as JSON; the chat library hands us the body as the message. */
function errorText(e: Error): { text: string; needsKey: boolean } {
  try {
    const body = JSON.parse(e.message) as { error?: string; message?: string };
    return { text: body.message ?? body.error ?? e.message, needsKey: body.error === 'missing_key' };
  } catch {
    // The connection dropped (each browser words it differently): say what happened and what was kept.
    if (/network ?error|failed to fetch|load failed|network connection was lost/i.test(e.message))
      return {
        text: 'The connection to the server dropped before the reply finished. Whatever the assistant already changed in the game is kept. Send your message again to carry on.',
        needsKey: false,
      };
    return { text: e.message, needsKey: false };
  }
}

export function ChatPanel(props: Props) {
  const history = useQuery({
    queryKey: keys.messages(props.gameId),
    queryFn: () => fetchMessages(props.gameId),
    gcTime: 0,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (history.isLoading || !history.data) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  return <ChatInner key={props.gameId} {...props} initial={history.data as UIMessage[]} />;
}

function Attachments() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {attachments.files.map((f) => (
        <div key={f.id} className="relative">
          <img src={f.url} alt={f.filename ?? 'attachment'} className="size-14 rounded border object-cover" />
          <button
            type="button"
            className="-right-1 -top-1 absolute grid size-4 place-items-center rounded-full bg-foreground text-background"
            onClick={() => attachments.remove(f.id)}
            aria-label="Remove attachment"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function AttachButton() {
  const attachments = usePromptInputAttachments();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => attachments.openFileDialog()}
      title="Attach an image (a logo, a brand guide...)"
    >
      <ImageIcon />
      <span className="sr-only">Attach an image</span>
    </Button>
  );
}

/** Is the reply's text arriving right now? Then the text itself shows the assistant is working. */
function writing(messages: UIMessage[]) {
  const last = messages.at(-1);
  const part = last?.role === 'assistant' ? last.parts.at(-1) : undefined;
  return part?.type === 'text' && part.state === 'streaming';
}

/** Shown whenever a reply is underway but nothing new is on screen: the model thinking (its reasoning isn't shown) or between steps. */
function Working() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setSecs(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="animate-pulse text-muted-foreground text-sm" data-testid="chat-working">
      Working...{secs >= 5 && ` ${secs}s`}
    </p>
  );
}

function ChatInner({ gameId, gameName, domain, onChanged, initial }: Props & { initial: UIMessage[] }) {
  const llm = useLlmSettings();
  const qc = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/prospects/${gameId}/chat`,
        headers: () => llmHeaders(),
        // The server keeps the conversation: it only needs the newest message.
        prepareSendMessagesRequest: ({ messages }) => ({ body: { message: messages[messages.length - 1] } }),
      }),
    [gameId],
  );
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    id: `game-${gameId}`,
    messages: initial,
    transport,
  });

  // Reload the preview as soon as a tool has changed the game, not only when the reply ends.
  const changes = useMemo(
    () => messages.flatMap((m) => m.parts).filter((p) => p.type.startsWith('tool-') && changedTheGame(p as unknown as ToolPartLike)).length,
    [messages],
  );
  const seen = useRef(changes);
  useEffect(() => {
    if (changes > seen.current) onChanged();
    seen.current = changes;
  }, [changes, onChanged]);
  useEffect(() => {
    if (status === 'ready' || status === 'error') onChanged();
  }, [status, onChanged]);

  const busy = status === 'submitted' || status === 'streaming';
  const err = error ? errorText(error) : null;
  const send = (text: string, files: FileUIPart[] = []) => {
    clearError();
    sendMessage(files.length ? { text, files } : { text });
  };

  const suggestions = [
    `Research ${domain || gameName} and theme the whole game for them`,
    'Redraw the three bugs and the boss so they feel like their world',
    'Keep it light: friendly, funny pains, nothing that could offend',
  ];

  return (
    <div className="flex h-full flex-col" data-testid="chat">
      <Conversation className="min-h-0">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<SparklesIcon className="size-6" />}
              title="Make this game theirs"
              description="Tell the assistant what you know about the prospect, or give it their website. It changes the theme, redraws the sprites, and you watch the game update."
            >
              <div className="flex flex-col items-center gap-3">
                <SparklesIcon className="size-6 text-muted-foreground" />
                <div className="space-y-1">
                  <h3 className="font-medium text-sm">Make this game theirs</h3>
                  <p className="max-w-xs text-muted-foreground text-sm">
                    Tell the assistant what you know about the prospect, or give it their website. It changes the theme, redraws the
                    sprites, and you watch the game update.
                  </p>
                </div>
                <div className="flex flex-col items-stretch gap-2">
                  {suggestions.map((s) => (
                    <Suggestion key={s} suggestion={s} onClick={(t) => send(t)} className="h-auto whitespace-normal py-2 text-left" />
                  ))}
                </div>
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role} data-testid={`message-${m.role}`}>
                <MessageContent>
                  {m.parts.map((part, i) => {
                    const key = `${m.id}-${i}`;
                    if (part.type === 'text')
                      return m.role === 'assistant' ? (
                        <MessageResponse key={key}>{part.text}</MessageResponse>
                      ) : (
                        <p key={key} className="whitespace-pre-wrap">
                          {part.text}
                        </p>
                      );
                    if (part.type === 'file' && part.mediaType.startsWith('image/'))
                      return <img key={key} src={part.url} alt={part.filename ?? 'attachment'} className="max-h-48 rounded-md border" />;
                    if (part.type.startsWith('tool-')) return <ToolCall key={key} part={part as unknown as ToolPartLike} />;
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
          {busy && !writing(messages) && <Working />}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="space-y-2 border-t p-3">
        {err && (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
            role="alert"
            data-testid="chat-error"
          >
            {err.text}
            {err.needsKey && (
              <Button size="sm" variant="outline" className="mt-2 block" onClick={() => setSettingsOpen(true)}>
                Add your key
              </Button>
            )}
          </div>
        )}
        {!llm.apiKey && !err && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm"
            onClick={() => setSettingsOpen(true)}
            data-testid="need-key"
          >
            <KeyRoundIcon className="size-4 shrink-0" />
            Add your Anthropic or OpenAI API key to start chatting. It stays in this browser.
          </button>
        )}
        <PromptInput
          accept="image/*"
          maxFiles={4}
          maxFileSize={1_500_000}
          onError={(e) => toast.error(e.code === 'max_file_size' ? 'That image is over 1.5 MB' : e.message)}
          onSubmit={({ text, files }) => {
            if (busy || (!text.trim() && files.length === 0)) return;
            if (!llm.apiKey) return setSettingsOpen(true);
            send(text, files);
          }}
        >
          <Attachments />
          <PromptInputBody>
            <PromptInputTextarea
              placeholder={busy ? 'The assistant is working. Type your next message, or stop it.' : 'Tell the assistant what to do...'}
              // One reply at a time: sending now would cut off the one underway. Enter waits; the draft stays.
              onKeyDown={(e) => {
                if (busy && e.key === 'Enter' && !e.shiftKey) e.preventDefault();
              }}
              data-testid="chat-input"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <AttachButton />
              {messages.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    await api(`/prospects/${gameId}/messages`, { method: 'DELETE' });
                    setMessages([]);
                    qc.removeQueries({ queryKey: keys.messages(gameId) });
                  }}
                >
                  <MessageSquarePlusIcon />
                  New conversation
                </Button>
              )}
            </PromptInputTools>
            <PromptInputSubmit status={status} onStop={stop} data-testid="chat-send" />
          </PromptInputFooter>
        </PromptInput>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
