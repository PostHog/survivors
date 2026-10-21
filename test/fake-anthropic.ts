// A scripted stand-in for Anthropic's Messages API (streaming), so the real @ai-sdk/anthropic provider code runs in tests and in the
// browser test without a network or a key. Each request the Worker makes consumes the next scripted turn.
//
// A turn is what the model says: some text and/or tool calls. After a turn with tool calls the SDK runs the tools and calls again.

export type Block = { text: string } | { tool: string; input: unknown };
export type Turn = Block[];

export interface Recorded {
  url: string;
  headers: Headers;
  // biome-ignore lint/suspicious/noExplicitAny: a request body is whatever the provider sent
  body: any;
}

const sse = (events: [string, unknown][]) => events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');

/** The streamed response for one scripted turn. */
export function anthropicStream(turn: Turn, n: number): string {
  const events: [string, unknown][] = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: `msg_${n}`,
          type: 'message',
          role: 'assistant',
          model: 'fake',
          content: [],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 1 },
        },
      },
    ],
  ];
  turn.forEach((block, index) => {
    if ('text' in block) {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }]);
      events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } }]);
    } else {
      events.push([
        'content_block_start',
        { type: 'content_block_start', index, content_block: { type: 'tool_use', id: `toolu_${n}_${index}`, name: block.tool, input: {} } },
      ]);
      events.push([
        'content_block_delta',
        { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } },
      ]);
    }
    events.push(['content_block_stop', { type: 'content_block_stop', index }]);
  });
  const usesTools = turn.some((b) => 'tool' in b);
  events.push([
    'message_delta',
    {
      type: 'message_delta',
      delta: { stop_reason: usesTools ? 'tool_use' : 'end_turn', stop_sequence: null },
      usage: { output_tokens: 20 },
    },
  ]);
  events.push(['message_stop', { type: 'message_stop' }]);
  return sse(events);
}

export const sseResponse = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
