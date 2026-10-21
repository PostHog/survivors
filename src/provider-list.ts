// The AI providers and the models offered for each. Pure data, shared by the Worker (which defaults to the first model) and the admin
// app (which shows them). Any model name the provider accepts may also be typed in by hand.
export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-5-5',
    models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-haiku-5-5'],
    keyHint: 'sk-ant-...',
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-6-sol',
    models: ['gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-luna', 'gpt-5.6', 'gpt-5.5'],
    keyHint: 'sk-...',
  },
} as const;
export type ProviderId = keyof typeof PROVIDERS;
