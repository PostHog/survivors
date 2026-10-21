import { vi } from 'vitest';
import { anthropicStream, type Recorded, sseResponse, type Turn } from '../fake-anthropic';

export type { Turn } from '../fake-anthropic';

/**
 * Stands in for the AI provider at https://llm.test/anthropic/v1 for the rest of the test. Returns what the Worker asked it.
 * `respond` can override a reply (for example to refuse the key).
 */
export function fakeAnthropic(turns: Turn[], respond?: (n: number, req: Recorded) => Response | undefined) {
  const requests: Recorded[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('https://llm.test/anthropic/v1/')) return real(input, init);
    const rec = { url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
    requests.push(rec);
    const n = requests.length - 1;
    return respond?.(n, rec) ?? sseResponse(anthropicStream(turns[Math.min(n, turns.length - 1)], n));
  });
  return { requests };
}
