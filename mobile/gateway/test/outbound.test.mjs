import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MobileOutbound } from '../src/outbound.mjs';
function socket() { return { readyState: 1, bufferedAmount: 0, sent: [], send(json) { this.sent.push(JSON.parse(json)); }, close(code) { this.closed = code; } }; }
const delta = (sequence, text) => ({ type: 'session.event', sessionKey: 'chat', sequence, event: { type: 'text_delta', contentIndex: 0, delta: text } });
test('coalescing preserves sequences and flushes before attention, without sending accumulated full messages', () => {
  const wire = socket(), output = new MobileOutbound(wire);
  try {
    for (let i = 1; i <= 100; i++) output.send(delta(i, 'a'));
    assert.equal(wire.sent.length, 0);
    output.send({ type: 'session.event', sessionKey: 'chat', sequence: 101, event: { type: 'approval_requested', requestId: 'approval' } });
    assert.equal(wire.sent.length, 2); assert.equal(wire.sent[0].firstSequence, 1); assert.equal(wire.sent[0].sequence, 100);
    assert.equal(wire.sent[0].event.delta, 'a'.repeat(100)); assert.equal(wire.sent[1].sequence, 101);
    output.send(delta(102, 'b')); output.send(delta(104, 'd')); output.flush();
    assert.equal(wire.sent[2].sequence, 102); assert.equal(wire.sent[3].sequence, 104);
  } finally { output.close(); }
});
test('slow terminal output yields buffer space to controls and resumes from a screen snapshot', async () => {
  const wire = socket(), output = new MobileOutbound(wire);
  try {
    wire.bufferedAmount = 150 * 1024;
    output.send({ type: 'terminal.event', terminalId: 'shell', event: { type: 'output', data: 'bulk' } });
    output.send({ type: 'response', id: 'stop', ok: true });
    assert.equal(wire.sent.length, 1); assert.equal(wire.sent[0].id, 'stop'); assert.equal(wire.closed, undefined);
    wire.bufferedAmount = 0;
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(wire.sent[1].event.type, 'resync');
  } finally { output.close(); }
});
