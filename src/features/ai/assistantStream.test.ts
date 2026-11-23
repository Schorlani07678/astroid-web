import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkForSimulatedStream,
  createSseDecoder,
  extractReply,
  extractStreamDelta,
  isStreamingContentType,
} from './assistantStream';

test('extractStreamDelta understands common delta shapes', () => {
  assert.equal(extractStreamDelta({ delta: 'a' }), 'a');
  assert.equal(extractStreamDelta({ content: 'b' }), 'b');
  assert.equal(extractStreamDelta({ choices: [{ delta: { content: 'c' } }] }), 'c');
  assert.equal(extractStreamDelta({ data: { text: 'd' } }), 'd');
  assert.equal(extractStreamDelta({ unrelated: 1 }), '');
  assert.equal(extractStreamDelta(null), '');
});

test('extractReply reads enveloped and bare JSON replies', () => {
  assert.equal(extractReply({ data: { reply: 'hi' } }), 'hi');
  assert.equal(extractReply({ reply: 'yo' }), 'yo');
  assert.equal(extractReply({}), 'No response from AI.');
});

test('the SSE decoder buffers frames split across network chunks', () => {
  const decoder = createSseDecoder();
  assert.deepEqual(decoder.push('data: {"delta":"Hel'), { deltas: [], done: false });
  assert.deepEqual(decoder.push('lo"}\n\ndata: plain text\n'), { deltas: ['Hello', 'plain text'], done: false });
});

test('the SSE decoder ignores comments/events and stops at [DONE]', () => {
  const decoder = createSseDecoder();
  const result = decoder.push(': keep-alive\nevent: token\ndata: one\r\ndata: [DONE]\ndata: ignored\n');
  assert.deepEqual(result, { deltas: ['one'], done: true });
  assert.deepEqual(decoder.push('data: late\n'), { deltas: [], done: true });
});

test('flush decodes a trailing frame without a newline', () => {
  const decoder = createSseDecoder();
  decoder.push('data: {"content":"tail"}');
  assert.deepEqual(decoder.flush(), { deltas: ['tail'], done: false });
});

test('streaming content types are detected', () => {
  assert.equal(isStreamingContentType('text/event-stream; charset=utf-8'), true);
  assert.equal(isStreamingContentType('text/plain'), true);
  assert.equal(isStreamingContentType('application/json'), false);
  assert.equal(isStreamingContentType(null), false);
});

test('simulated stream chunks reassemble to the original text', () => {
  const text = '**Treasury** is healthy.\n\n- one\n- two';
  const chunks = chunkForSimulatedStream(text);
  assert.ok(chunks.length > 3);
  assert.equal(chunks.join(''), text);
  assert.deepEqual(chunkForSimulatedStream(''), []);
});
