import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEntryModel, newModelPresentation, normalizeChatModel } from '../src/agent-server/chat-model.mjs';

test('model identity accepts actual string/object forms without inventing a provider', () => {
  assert.equal(normalizeChatModel({ id: 'gpt-test', provider: 'openai-codex' }), 'openai-codex/gpt-test');
  assert.equal(normalizeChatModel('openai-codex/gpt-test', 'openai-codex'), 'openai-codex/gpt-test');
  assert.equal(normalizeChatModel('anthropic/claude-test', 'openrouter'), 'openrouter/anthropic/claude-test');
  assert.equal(normalizeChatModel('local-model'), 'local-model');
  for (const value of [null, {}, [], 4, '', 'bad\nmodel', 'x'.repeat(513)]) assert.equal(normalizeChatModel(value), null);
});
test('branching back to an earlier parent restores its model instead of the latest other branch', () => {
  const state = newModelPresentation();
  for (const entry of [
    { type: 'model_change', id: 'first', parentId: null, provider: 'openai', modelId: 'a' },
    { type: 'message', id: 'prompt', parentId: 'first', message: { role: 'user' } },
    { type: 'model_change', id: 'alternate', parentId: 'prompt', provider: 'openai', modelId: 'b' },
    { type: 'message', id: 'branch', parentId: 'prompt', message: { role: 'user' } }
  ]) applyEntryModel(state, entry);
  assert.equal(state.model, 'openai/a');
  assert.deepEqual(state.modelNames, [null, 'openai/a', 'openai/b']);
  applyEntryModel(state, { type: 'message', id: 'answer', parentId: 'branch', message: { role: 'assistant', provider: 'other', model: 'actual-model' } });
  assert.equal(state.model, 'other/actual-model');
});
test('legacy linear records retain model while malformed/nested payloads cannot impersonate settings', () => {
  const state = newModelPresentation();
  applyEntryModel(state, { type: 'model_change', id: 'one', modelId: 'known' });
  applyEntryModel(state, { type: 'message', id: 'two', message: { role: 'user', model: 'fake', content: [{ type: 'model_change', modelId: 'fake' }] } });
  assert.equal(state.model, 'known');
  applyEntryModel(state, { type: 'message', id: 'three', message: { role: 'assistant' } });
  assert.equal(state.model, 'known');
});
test('unresolved and explicit root parents do not inherit a different branch', () => {
  const state = newModelPresentation();
  applyEntryModel(state, { type: 'model_change', id: 'one', modelId: 'known' });
  applyEntryModel(state, { type: 'message', id: 'two', parentId: 'missing', message: { role: 'user' } });
  assert.equal(state.model, null);
  applyEntryModel(state, { type: 'message', id: 'three', parentId: null, message: { role: 'user' } });
  assert.equal(state.model, null);
});
test('lineage remains safe after JSON persistence with special property names', () => {
  const state = JSON.parse(JSON.stringify(newModelPresentation()));
  applyEntryModel(state, { type: 'model_change', id: '__proto__', modelId: 'known' });
  applyEntryModel(state, { type: 'message', id: 'constructor', parentId: '__proto__', message: { role: 'user' } });
  assert.equal(state.model, 'known');
  assert.equal(Object.getPrototypeOf(state.modelLineage), Object.prototype);
});

import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CanonicalChatIndex } from '../src/agent-server/chat-index.mjs';
import { ZyraAgentServer } from '../src/agent-server/server.mjs';

test('index persists branch model lineage, appends changes and excludes internal metadata from catalog/history', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'zyra-model-index-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'), directory = path.join(project, '.zyra/sessions');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'chat.jsonl');
  const entries = [
    { type: 'session', id: 'chat', cwd: project },
    { type: 'model_change', id: 'one', parentId: null, provider: 'openai', modelId: 'a' },
    { type: 'message', id: 'two', parentId: 'one', message: { role: 'user', content: 'A prompt' } },
    { type: 'model_change', id: 'three', parentId: 'two', provider: 'openai', modelId: 'b' },
    { type: 'message', id: 'four', parentId: 'two', message: { role: 'user', content: 'A branch' } }
  ];
  writeFileSync(file, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
  const stateDirectory = path.join(root, 'state');
  let index = new CanonicalChatIndex({ stateDirectory });
  assert.equal((await index.listProjects([project]))[0].model, 'openai/a');
  index = new CanonicalChatIndex({ stateDirectory });
  appendFileSync(file, JSON.stringify({ type: 'message', id: 'five', parentId: 'four', message: { role: 'assistant', provider: 'other', model: 'answer-model', content: 'An answer' } }) + '\n');
  const chat = (await index.listProjects([project]))[0];
  assert.equal(chat.model, 'other/answer-model');
  for (const key of ['modelLineage', 'modelNames', 'modelLeaf', 'modelPresentationVersion']) assert.equal(key in chat, false);
  assert.equal(index.history('chat').chat.model, 'other/answer-model');
  // A same-size rewrite is a fresh branch projection, not an append.
  writeFileSync(file, JSON.stringify({ type: 'session', id: 'chat', cwd: project }) + '\n' + JSON.stringify({ type: 'model_change', id: 'new', parentId: null, modelId: 'replacement' }) + '\n');
  assert.equal((await index.listProjects([project]))[0].model, 'replacement');
});
test('catalog model prefers the live session and safely falls back for detached/legacy chats', () => {
  const server = { catalog: {}, sessions: new Map(), sessionPresence: () => ({ state: 'ready' }) };
  const project = chat => ZyraAgentServer.prototype.projectCatalogChat.call(server, chat);
  assert.equal(project({ canonicalChatId: 'one', model: 'saved' }).model, 'saved');
  server.sessions.set('one', { connectedResult: { config: { model: { provider: 'openai', id: 'live' } } } });
  assert.equal(project({ canonicalChatId: 'one', model: 'saved' }).model, 'openai/live');
  assert.equal(project({ canonicalChatId: 'legacy' }).model, null);
});
