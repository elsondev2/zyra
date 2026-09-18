import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BodyCache, projectEvent } from '../src/projection.mjs';

const result = patch => ({ content: [{ type: 'text', text: 'Successfully replaced 1 block(s) in app.ts.' }],
  details: { patch, diff: '-1 old\n+1 new  \n' } });

test('mobile transport retains captured edit evidence on live and committed tool results', () => {
  const patch = '--- app.ts\n+++ app.ts\n@@ -1 +1 @@\n-old\n+new  \n';
  const cache = new BodyCache();
  for (const event of [
    { type: 'tool_execution_end', toolCallId: 'edit-1', result: result(patch) },
    { type: 'message_end', message: { role: 'toolResult', toolCallId: 'edit-1', ...result(patch) } },
  ]) {
    const projected = projectEvent(event, 'phone', cache, 'chat');
    assert.deepEqual(projected, event);
    assert.equal((projected.result || projected.message).details.patch, patch);
  }
});

test('on-demand body keeps the complete patch when mobile preview defers a large edit', () => {
  const patch = '--- app.ts\n+++ app.ts\n@@ -1 +1 @@\n-old\n+' + 'new '.repeat(16000) + '\n';
  const event = { type: 'message_end', message: { role: 'toolResult', toolCallId: 'edit-1', toolName: 'edit', ...result(patch) } };
  const cache = new BodyCache();
  const preview = projectEvent(event, 'phone', cache, 'chat');
  assert.ok(preview.deferred?.bodyId);
  const parts = []; let offset = 0;
  do {
    const chunk = cache.chunk('phone', preview.deferred.bodyId, offset);
    parts.push(Buffer.from(chunk.base64, 'base64')); offset = chunk.next;
  } while (offset < preview.deferred.bytes);
  assert.equal(JSON.parse(Buffer.concat(parts).toString()).message.details.patch, patch);
  assert.throws(() => cache.chunk('other-phone', preview.deferred.bodyId));
});
