// Which AI provider, model and API key to use. The key lives in this browser's localStorage and nowhere else: it is sent to our own
// server with each chat request (in a header), used for that request, and never stored there.

import { PROVIDERS, type ProviderId } from '@worker/provider-list';
import { useSyncExternalStore } from 'react';

export interface LlmSettings {
  provider: ProviderId;
  apiKey: string;
  /** Empty = the provider's default model. */
  model: string;
}

const STORAGE_KEY = 'survivors.llm.v1';
const EMPTY: LlmSettings = { provider: 'anthropic', apiKey: '', model: '' };

let snapshot: LlmSettings | null = null;
const listeners = new Set<() => void>();

function parse(raw: string | null): LlmSettings {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<LlmSettings>) : {};
    return {
      provider: v.provider && v.provider in PROVIDERS ? v.provider : EMPTY.provider,
      apiKey: typeof v.apiKey === 'string' ? v.apiKey : '',
      model: typeof v.model === 'string' ? v.model : '',
    };
  } catch {
    return EMPTY;
  }
}

/** The current settings (a stable object until they change, as useSyncExternalStore needs). */
export function readLlmSettings(): LlmSettings {
  if (!snapshot) snapshot = parse(localStorage.getItem(STORAGE_KEY));
  return snapshot;
}

function publish(next: LlmSettings | null) {
  snapshot = next ?? EMPTY;
  if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else localStorage.removeItem(STORAGE_KEY);
  for (const l of listeners) l();
}
export const saveLlmSettings = (s: LlmSettings) => publish({ ...s, apiKey: s.apiKey.trim(), model: s.model.trim() });
export const clearLlmSettings = () => publish(null);

// Another tab changed it.
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    snapshot = parse(e.newValue);
    for (const l of listeners) l();
  }
});

export function useLlmSettings(): LlmSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readLlmSettings,
    () => EMPTY,
  );
}

/** The headers that tell the server which provider and key to use for one chat request. */
export function llmHeaders(): Record<string, string> {
  const s = readLlmSettings();
  return { 'x-llm-provider': s.provider, 'x-llm-key': s.apiKey, ...(s.model ? { 'x-llm-model': s.model } : {}) };
}
