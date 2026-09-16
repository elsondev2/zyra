import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ZyraAgentServer } from '../src/agent-server/server.mjs';
import { ZyraAgentServerClient } from '../src/agent-server/client.mjs';

const dir = mkdtempSync(path.join(os.tmpdir(), 'zyra-mobile-sync-'));
const canonical = 'chat:mobile-sync';
const chat = { canonicalChatId: canonical, project: dir, cwd: dir, title: 'Synthetic sync' };
const catalog = { registerProject: () => dir, find: async () => chat, resolveAlias: v => v || '', recordAttachment() {},
  updateChat: async () => chat, list: async () => [chat], snapshot: () => ({ projects: [{ path: dir }] }) };
class Worker extends EventEmitter {
  calls = []; alive = true;
  isAlive() { return this.alive; }
  async request(type, params) { this.calls.push({ type, params }); if (type === 'connect') return { threadId: canonical, cwd: dir }; return { ok: true }; }
  dispose() { this.alive = false; }
  sendControlResponse() {}
}
const worker = new Worker();
const server = new ZyraAgentServer({ stateDirectory: dir, root: process.cwd(), endpoint: 0, catalog, createWorker: () => worker });
let desktop, phone;
try {
  await server.start();
  desktop = new ZyraAgentServerClient({ stateDirectory: dir, autoStart: false, clientId: 'test:desktop', surface: 'desktop' });
  phone = new ZyraAgentServerClient({ stateDirectory: dir, autoStart: false, clientId: 'test:phone', surface: 'mobile', displayName: 'Test phone\n\u0000' });
  await desktop.attach({ project: dir, session: canonical, filesystemScope: { projectId: 'one', revision: 7, workingRoot: dir, roots: [{ id: 'root', path: dir, access: 'read-only' }] } });
  worker.emit('event', { type: 'approval_requested', requestId: 'approval:held', command: 'synthetic command' });
  for (let i = 0; i < 520; i++) worker.emit('event', { type: 'message_update', message: { role: 'assistant', content: String(i) } });
  const joined = await phone.request('session.join', { session: canonical, lastSequence: 0, filesystemScope: { revision: 999 } });
  assert.equal(joined.canonicalChatId, canonical);
  const phonePresence = (await desktop.request('catalog.get', { session: canonical })).chat.presence.clients.find(client => client.clientId === 'test:phone');
  assert.equal(phonePresence.displayName, 'Test phone', 'authenticated phone display metadata reaches canonical presence without control characters');
  assert.equal(worker.calls.filter(c => c.type === 'connect').length, 1, 'joining cannot restart or reconfigure a worker');
  assert.equal(worker.calls[0].params.filesystemScope.revision, 7, 'original filesystem authority is preserved');
  assert.equal(joined.replay.length, 512);
  assert.ok(joined.replay[0].sequence > 1, 'old stream events have aged out');
  assert.equal(joined.pendingAttention[0].requestId, 'approval:held', 'pending approval survives replay-window eviction');
  assert.equal(joined.liveMessage.content, '519', 'current assistant text survives replay eviction');
  const liveSession = server.sessions.get(canonical);
  const previousTurn = { id: 'strong-turn', state: 'completed', completedAt: '2026-09-14T00:00:00Z', assistantMessageId: 'strong-answer' };
  liveSession.latestTurn = { ...previousTurn };
  worker.emit('event', { type: 'message_end', canonicalCommit: true, historyEntryIndex: 42, message: { id: 'voice-saved', role: 'assistant', content: 'Saved Voice' } });
  assert.deepEqual(liveSession.latestTurn, previousTurn);
  assert.equal(liveSession.liveMessage.content, '519', 'canonical saves cannot clear an unrelated live message');
  const voiceReplay = await phone.request('session.join', { session: canonical, lastSequence: joined.latestSequence });
  assert.equal(voiceReplay.replay[0].event.message.id, 'voice-saved');
  assert.equal(voiceReplay.replay[0].event.historyEntryIndex, 42);
  liveSession.updateLatestTurnSummary(voiceReplay.replay[0].event, { turnId: 'old-voice-turn' }, '2026-09-14T00:00:01Z');
  assert.deepEqual(liveSession.latestTurn, previousTurn, 'journal reconstruction ignores Voice commits as turn boundaries');
  await phone.request('session.request', { sessionKey: canonical, type: 'preferences.get', payload: {} });
  await phone.request('session.request', { sessionKey: canonical, type: 'memory.configure', payload: { enabled: false } });
  assert.deepEqual(worker.calls.at(-1), { type: 'memory.configure', params: { enabled: false } });
  worker.emit('event', { type: 'session_memory', memoryMode: 'disabled' });
  const preferencesReplay = await desktop.request('session.join', { session: canonical, lastSequence: joined.latestSequence });
  assert.equal(preferencesReplay.replay.find(frame => frame.event.type === 'session_memory').event.memoryMode, 'disabled', 'memory changes propagate to the other attached client');
  worker.emit('event', { type: 'tool_execution_start', toolCallId: 'tool:held', toolName: 'bash' });
  for (let i = 0; i < 20; i++) worker.emit('event', { type: 'message_update', message: { role: 'assistant', content: 'x'.repeat(600000) } });
  const bounded = await phone.request('session.join', { session: canonical, lastSequence: 0 });
  assert.ok(Buffer.byteLength(JSON.stringify(bounded.replay)) < 8 * 1024 * 1024);
  assert.equal(bounded.pendingTools[0].toolCallId, 'tool:held');
  const modelNotice = new Promise(resolve => phone.once('catalog-changed', resolve));
  worker.emit('event', { type: 'session_config', model: 'openai-codex/current-model', thinking: 'high' });
  assert.equal((await modelNotice).change.model, true, 'the phone is notified when Desktop changes the model');
  const listed = await phone.request('catalog.list');
  assert.equal(listed.chats[0].model, 'openai-codex/current-model', 'catalog model follows live Desktop configuration');
  assert.equal((await desktop.request('catalog.get', { session: canonical })).chat.model, 'openai-codex/current-model', 'both clients see the same model');
  worker.emit('event', { type: 'session_config', profile: 'focused' });
  assert.equal((await phone.request('catalog.list')).chats[0].model, 'openai-codex/current-model', 'partial settings do not erase the model');
  const detachNotice = new Promise(resolve => desktop.once('catalog-changed', resolve));
  await phone.detach(canonical);
  assert.equal((await detachNotice).change.presence, true, 'Desktop is notified when the phone leaves');
  assert.equal((await desktop.request('catalog.get', { session: canonical })).chat.presence.clients.some(client => client.surface === 'mobile'), false, 'phone presence disappears without clearing the live worker');
  phone.close();
  assert.equal(worker.alive, true, 'phone detach preserves server-owned work');
  console.log('Mobile join, authority preservation, bounded replay and pending attention: passed');
} finally {
  phone?.close(); desktop?.close(); await server.stop(); rmSync(dir, { recursive: true, force: true });
}
