import { BodyCache, mobileEvent } from '../../src/projection.mjs';
import { MobileOutbound } from '../../src/outbound.mjs';

// Synthetic Pi-shaped events pass through the same projector/batcher as real sockets.
export function timelineWireFixture() {
  const cache = new BodyCache(), frames = [];
  const output = new MobileOutbound({ readyState: 1, bufferedAmount: 0, send: json => frames.push(JSON.parse(json)), close: () => { throw Error('Unexpected frame rejection'); } });
  const message = { id: 'answer-1', role: 'assistant', content: [] };
  const delta = (type, contentIndex, text) => ({ type: 'message_update', message, assistantMessageEvent: { type, contentIndex, delta: text } });
  const events = [
    { type: 'message_start', message },
    delta('thinking_delta', 0, 'Check '), delta('thinking_delta', 0, '😀'),
    delta('text_delta', 1, 'Answer '), delta('text_delta', 1, 'ready.'),
    { type: 'message_end', message: { ...message, content: [{ type: 'thinking', thinking: 'Check 😀' }, { type: 'text', text: 'Answer ready.' }] } },
    { type: 'tool_execution_start', toolCallId: 'tool-1', toolName: 'read' },
    { type: 'tool_execution_end', toolCallId: 'tool-1', result: { content: [{ type: 'text', text: 'File contents' }] } },
    { type: 'message_end', message: { role: 'toolResult', toolCallId: 'tool-1', toolName: 'read', content: 'File contents', timestamp: 1000 } },
    { type: 'agent_end' }
  ];
  const envelopes = events.map((event, index) => mobileEvent({ sessionKey: 'chat', sequence: index + 1, event }, 'synthetic-phone', cache));
  try { for (const envelope of envelopes) output.send(envelope); output.flush(); }
  finally { output.close(); }
  const canonical = { type: 'message_end', canonicalCommit: true, historyEntryIndex: 42,
    message: { id: 'voice-saved', role: 'assistant', content: [{ type: 'text', text: 'A saved Voice reply.' }],
      zyraCanonicalMessage: { canonicalMessageId: 'voice-saved', providerItemId: 'voice-provider' } } };
  const canonicalFrames = JSON.parse(JSON.stringify([11, 12].map(sequence => mobileEvent({ sessionKey: 'chat', sequence, event: canonical }, 'synthetic-phone', cache))));
  return { checkpoint: JSON.parse(JSON.stringify(envelopes.slice(0, 2))), frames, canonicalFrames, expected: { text: 'Answer ready.', reasoning: 'Check 😀', tool: 'read\nFile contents', items: 2, sequence: 10 } };
}
