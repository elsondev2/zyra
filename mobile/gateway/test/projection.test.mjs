import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BodyCache, mobileEvent, projectEvent, replayGap } from '../src/projection.mjs';
import { installZyraNextTurnCheckpoint } from '../../../src/zyra-next-turn-checkpoint.mjs';

test('actual managed-command checkpoint context never becomes mobile narration, delta or deferred body', async () => {
  let update;
  const agent = { state: { messages: [] }, steer: message => { update = message; agent.state.messages.push(message); } };
  const uninstall = installZyraNextTurnCheckpoint({ agent }, { hasAutoPollJobs: () => true }, {
    waitForUpdate: async () => 'Command exited with code 1.\n' + 'synthetic command output\n'.repeat(4000),
  });
  try { await agent.prepareNextTurnWithContext({ context: {} }); } finally { uninstall(); }
  assert.equal(update.role, 'custom'); assert.equal(update.display, false);
  assert.match(update.content[0].text, /^\[Zyra managed command update\]/);
  const raw = JSON.stringify(update), cache = new BodyCache();
  for (const [index, type] of ['message_start', 'message_update', 'message_end'].entries()) {
    const event = { type, message: update, ...(type === 'message_update' ? { assistantMessageEvent: { type: 'text_delta', delta: 'INTERNAL' } } : {}) };
    const projected = mobileEvent({ sessionKey: 'chat', sequence: index + 1, event }, 'phone', cache);
    assert.deepEqual(projected.event, { type: 'message_hidden' });
    assert.equal(projected.sequence, index + 1);
    assert.deepEqual(projectEvent(event, 'phone', cache, 'chat'), { type: 'message_hidden' });
  }
  assert.equal(cache.bytes, 0); assert.equal(cache.media.items?.size || 0, 0);
  assert.equal(JSON.stringify(agent.state.messages[0]), raw, 'raw agent context is untouched');
});

test('visibility uses producer metadata, never the words of an authored message', () => {
  const cache = new BodyCache();
  const content = '[Zyra managed command update]\nUse this command output to decide';
  for (const role of ['user', 'assistant', 'custom']) {
    const message = { role, content, ...(role === 'custom' ? { display: true, customType: 'visible.notice' } : {}) };
    const event = { type: 'message_end', message };
    assert.deepEqual(mobileEvent({ sequence: 1, event }, 'phone', cache).event, event);
  }
  for (const message of [{ role: 'custom', content }, { role: 'assistant', display: false, content }]) {
    assert.deepEqual(mobileEvent({ sequence: 2, event: { type: 'message_end', message } }, 'phone', cache).event, { type: 'message_hidden' });
  }
  const visible = mobileEvent({ event: { type: 'message_end', message: { role: 'custom', display: true, customType: 'visible.notice', content: 'x'.repeat(40000) } } }, 'phone', cache).event;
  assert.ok(visible.deferred); assert.equal(visible.message.display, true); assert.equal(visible.message.customType, 'visible.notice');
});
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


test('compaction and recovery lifecycle survives deferred error details', () => {
  const cache = new BodyCache();
  for (const source of [
    { type: 'compaction_end', reason: 'manual', aborted: true, willRetry: false, result: { tokensBefore: 250000, estimatedTokensAfter: 40000 }, errorMessage: 'failure '.repeat(10000) },
    { type: 'auto_retry_start', attempt: 2, maxAttempts: 5, delayMs: 2000, recoveryKind: 'network', errorMessage: 'network '.repeat(10000) },
    { type: 'auto_retry_end', success: false, attempt: 5, finalError: 'failure '.repeat(10000) },
  ]) {
    const envelope = mobileEvent({ sessionKey: 'chat', sequence: 11, requestContext: { turnId: 'turn' }, event: source }, 'phone', cache);
    const event = envelope.event;
    assert.equal(envelope.requestContext.turnId, 'turn');
    assert.ok(event.deferred);
    for (const key of ['type', 'reason', 'aborted', 'willRetry', 'result', 'attempt', 'maxAttempts', 'delayMs', 'recoveryKind', 'success'])
      assert.deepEqual(event[key], source[key]);
    assert.ok(JSON.stringify(envelope).length < 5000);
    assert.equal((event.errorMessage || event.finalError).length, 1000);
  }
});

test('accepted prompt keeps its turn and projects images before canonical user content', () => {
  const cache = new BodyCache();
  const projected = mobileEvent({ sessionKey: 'chat', sequence: 1, requestContext: { turnId: 'mobile:pending' }, event: {
    type: 'zyra_server_prompt_accepted', message: { role: 'user', timestamp: 123, content: [
      { type: 'text', text: 'inspect this' }, { type: 'image', mimeType: 'image/png', data: Buffer.from([137,80,78,71,13,10,26,10]).toString('base64') }
    ] }
  } }, 'phone', cache);
  assert.equal(projected.requestContext.turnId, 'mobile:pending');
  assert.equal(projected.event.type, 'zyra_server_prompt_accepted');
  assert.equal(projected.event.message.content[0].text, 'inspect this');
  assert.ok(projected.event.message.content[1].mediaRef);
  assert.equal(projected.event.message.content[1].data, undefined);
});
