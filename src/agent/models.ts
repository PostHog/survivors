// Which AI provider and model to talk to. The person brings their own API key (the admin app keeps it in its localStorage and sends it
// with each chat request); it is used for that request and never stored or logged here.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { Env } from '../env';
import { PROVIDERS } from '../provider-list';

export { PROVIDERS, type ProviderId } from '../provider-list';

/** What the chat request says about the model, read from its headers. */
export const llmConfig = z.object({
  provider: z.enum(['anthropic', 'openai']),
  apiKey: z.string().regex(/^[\x21-\x7e]{8,400}$/, 'that does not look like an API key'),
  model: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/, 'that is not a model name')
    .optional(),
});
export type LlmConfig = z.infer<typeof llmConfig>;

export function readLlmConfig(headers: Headers) {
  return llmConfig.safeParse({
    provider: headers.get('x-llm-provider') ?? undefined,
    apiKey: headers.get('x-llm-key') ?? undefined,
    model: headers.get('x-llm-model') || undefined,
  });
}

/** BASE_URL variables let the provider be reached through a proxy or gateway (and let the browser test use a fake provider). */
export function createModel(cfg: LlmConfig, env: Pick<Env, 'ANTHROPIC_BASE_URL' | 'OPENAI_BASE_URL'>): LanguageModel {
  const id = cfg.model ?? PROVIDERS[cfg.provider].defaultModel;
  return cfg.provider === 'anthropic'
    ? createAnthropic({ apiKey: cfg.apiKey, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) })(id)
    : createOpenAI({ apiKey: cfg.apiKey, ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}) })(id);
}
