/**
 * Helpers for consuming streamed AI assistant replies (Nvidia NIM via the
 * Astroid API). Pure and framework-free so they can be unit-tested in Node.
 *
 * The `/ai/chat` endpoint may answer in one of three shapes:
 * 1. `application/json` — `{ data: { reply } }` or `{ reply }` (non-streaming)
 * 2. `text/event-stream` — SSE frames whose `data:` payload is either raw text
 *    or JSON carrying a delta (`delta`, `content`, `text`, or the
 *    OpenAI-compatible `choices[0].delta.content` NIM emits); `[DONE]` ends it
 * 3. `text/plain` chunked — every chunk is appended verbatim
 */

export type AssistantGenerationState = 'idle' | 'waiting' | 'streaming';

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Pulls the incremental text out of one parsed SSE JSON payload. */
export function extractStreamDelta(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!isRecord(payload)) return '';

  for (const key of ['delta', 'content', 'text', 'reply'] as const) {
    const value = payload[key];
    if (typeof value === 'string') return value;
  }

  const choices = payload.choices;
  if (Array.isArray(choices) && isRecord(choices[0])) {
    const delta = choices[0].delta;
    if (isRecord(delta) && typeof delta.content === 'string') return delta.content;
  }

  if (isRecord(payload.data)) return extractStreamDelta(payload.data);
  return '';
}

/** Reads the reply text from a non-streaming JSON response body. */
export function extractReply(body: unknown, fallback = 'No response from AI.'): string {
  if (isRecord(body)) {
    const data = body.data;
    if (isRecord(data) && typeof data.reply === 'string') return data.reply;
    if (typeof body.reply === 'string') return body.reply;
  }
  return fallback;
}

export interface SseDecodeResult {
  /** Text fragments decoded from the complete frames in this chunk. */
  deltas: string[];
  /** True once the `[DONE]` sentinel has been received. */
  done: boolean;
}

/**
 * Stateful SSE decoder. Network chunks can split a frame anywhere, so partial
 * lines are buffered until their newline arrives. Call `flush()` when the
 * stream ends to decode a trailing line without a newline.
 */
export function createSseDecoder() {
  let buffer = '';
  let done = false;

  const decodeLine = (rawLine: string, deltas: string[]) => {
    const line = rawLine.replace(/\r$/, '');
    if (!line.startsWith('data:')) return; // comments, `event:`, `id:`, blanks
    const payload = line.slice(5).replace(/^ /, '');
    if (payload.trim() === '[DONE]') {
      done = true;
      return;
    }
    let delta = payload;
    try {
      delta = extractStreamDelta(JSON.parse(payload));
    } catch {
      // Not JSON: the payload itself is the text fragment.
    }
    if (delta) deltas.push(delta);
  };

  return {
    push(chunk: string): SseDecodeResult {
      const deltas: string[] = [];
      if (done) return { deltas, done };
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (done) break;
        decodeLine(line, deltas);
      }
      return { deltas, done };
    },
    flush(): SseDecodeResult {
      const deltas: string[] = [];
      if (!done && buffer) decodeLine(buffer, deltas);
      buffer = '';
      return { deltas, done };
    },
  };
}

/** True when a response should be consumed incrementally rather than as JSON. */
export function isStreamingContentType(contentType: string | null): boolean {
  return /text\/event-stream|text\/plain/i.test(contentType ?? '');
}

/**
 * Splits a full reply into word-sized chunks (whitespace preserved) so mock
 * mode can replay it through the same streaming UI as the live endpoint.
 */
export function chunkForSimulatedStream(text: string): string[] {
  return text.match(/\s*\S+\s*/g) ?? (text ? [text] : []);
}
