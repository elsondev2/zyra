import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BodyCache, mobileEvent, replayGap } from '../src/projection.mjs';
test('streaming sends only deltas, and large bodies are bounded, scoped and expiring', () => {
  let now = 0; const cache = new BodyCache({ budget: 100000, ttl: 10, now: () => now });
  const original = { event: { type: 'message_update', message: { content: 'a'.repeat(80000) }, assistantMessageEvent: { type: 'text_delta', delta: 'b', contentIndex: 0 } }, sequence: 4 };
  assert.ok(JSON.stringify(mobileEvent(original, 'a', cache)).length < 200);
  const large = cache.project('a', { text: 'x'.repeat(40000) });
  assert.ok(large.deferred.bodyId);
  assert.throws(() => cache.chunk('b', large.deferred.bodyId));
  assert.equal(JSON.parse(Buffer.from(cache.chunk('a', large.deferred.bodyId).base64, 'base64').toString()).text.length, 40000);
  now = 11; assert.throws(() => cache.chunk('a', large.deferred.bodyId));
  assert.equal(cache.bytes, 0);
});
test('missing replay ranges and a reset host cursor force resynchronization', () => {
  assert.equal(replayGap(3, 5, [{ sequence: 4 }, { sequence: 5 }]), false);
  assert.equal(replayGap(3, 10, [{ sequence: 8 }]), true);
  assert.equal(replayGap(3, 10, []), true);
  assert.equal(replayGap(10, 3, []), true);
  assert.equal(replayGap(3, 3, []), false);
});
test('large message envelopes keep their role and identity while the body is deferred', () => {
  const cache = new BodyCache();
  const event = mobileEvent({ sessionKey: 'chat', sequence: 4, event: { type: 'message_start', message: { role: 'user', id: 'message', timestamp: 42, content: [{type:'text',text:'x'.repeat(60000)}] } } }, 'phone', cache).event;
  assert.ok(event.deferred.bodyId); assert.equal(event.message.role,'user'); assert.equal(event.message.id,'message'); assert.equal(event.message.content[0].text.length,1024);
  assert.ok(JSON.stringify(event).length < 2000);
});

test('deferred actions retain bounded labels and tool identity without inline file bodies', () => {
  const cache = new BodyCache();
  const event = mobileEvent({ sessionKey: 'chat', sequence: 7, event: { type: 'tool_execution_end', toolCallId: 'read', toolName: 'read', isError: true,
    args: { path: '/project/skills/design/SKILL.md', content: 'PRIVATE CONTENT'.repeat(4000), command: 'x'.repeat(2000) },
    surface: { version: 1, kind: 'skill', lifecycle: 'failed', paths: ['/project/skills/design/SKILL.md'], summary: 'Skill load failed' },
    result: { content: [{ type: 'text', text: 'x'.repeat(50000) }] } } }, 'phone', cache).event;
  assert.ok(event.deferred.bodyId); assert.equal(event.surface.kind, 'skill'); assert.equal(event.args.path, '/project/skills/design/SKILL.md');
  assert.equal(event.args.command.length, 1000); assert.equal(event.args.content, undefined); assert.equal(event.isError, true);
  assert.ok(JSON.stringify(event).length < 2500);
});

test('large assistant messages keep tool call labels for later results', () => {
  const cache = new BodyCache();
  const event = mobileEvent({ sessionKey: 'chat', sequence: 8, event: { type: 'message_end', message: { role: 'assistant', id: 'call',
    content: [{ type: 'text', text: 'x'.repeat(50000) }, { type: 'toolCall', id: 'edit', name: 'write', arguments: { path: '/project/app.ts', content: 'source'.repeat(5000) } }] } } }, 'phone', cache).event;
  assert.equal(event.message.content[1].type, 'toolCall'); assert.equal(event.message.content[1].arguments.path, '/project/app.ts');
  assert.equal(event.message.content[1].arguments.content, undefined); assert.ok(JSON.stringify(event).length < 2500);
});
