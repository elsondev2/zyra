import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HostRouter, isRead } from '../src/router.mjs';
import { BodyCache } from '../src/projection.mjs';
test('Desktop content search exposes only canonical chats visible to this phone', async () => {
  const requested = [];
  const router = new HostRouter({ owner: 'phone', cache: new BodyCache(), allProjects: true, hiddenProjects: ['/private'],
    client: { async request(_method, { session }) { return { chat: { canonicalChatId: session, project: session === 'hidden' ? '/private' : '/work' } }; } },
    searchChats: async input => { requested.push(input); return { indexingOlderChats: true, matches: [
      { canonicalChatId: 'visible', threadId: 'thread', messageId: 'message', snippet: 'Matching answer', role: 'assistant' },
      { canonicalChatId: 'hidden', threadId: 'secret', messageId: 'private', snippet: 'Never send this' }
    ] }; },
    searchContext: async input => { assert.equal(input.session, 'visible'); return { messages: [{ text: 'Context' }] }; }
  });
  const response = await router.dispatch('catalog.search', { query: 'answer' });
  assert.equal(response.matches.length, 1);
  assert.equal(response.matches[0].chat.canonicalChatId, 'visible');
  assert.equal(JSON.stringify(response).includes('Never send this'), false);
  assert.deepEqual(requested, [{ query: 'answer', limit: 50 }]);
  assert.equal(response.indexingOlderChats, true);
  await assert.rejects(router.dispatch('catalog.search.context', { session: 'hidden', threadId: 'secret', messageId: 'private' }), { code: 'CHAT_NOT_VISIBLE' });
  assert.equal((await router.dispatch('catalog.search.context', { session: 'visible', threadId: 'thread', messageId: 'message' })).messages[0].text, 'Context');
  assert.equal(isRead('catalog.search'), true);
  assert.equal(isRead('catalog.search.context'), true);
});
