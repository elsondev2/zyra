import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ZyraAgentServer } from '../src/agent-server/server.mjs';

const root = mkdtempSync(path.join(os.tmpdir(), 'zyra-tool-catalog-'));
const server = new ZyraAgentServer({ stateDirectory: root, channel: 'fixture',
  createWorker() { throw new Error('Tool-only chats must not start a model'); } });
const client = { connectionId: 'fixture:pi', surface: 'pi', displayName: 'Pi', socket: { writable: true } };
try {
  const first = await server.externalTools.open(client, { project: root, sourceSessionId: 'parent:one' });
  const record = await server.catalog.find(first.canonicalChatId, { allProjects: true });
  assert(record, 'Desktop can discover the canonical tool chat for approvals');
  assert.equal(record.title, 'Pi · tool verification');
  assert(record.aliases.some(alias => alias.startsWith('external-tools:')));
  const content = readFileSync(record.sessionPath, 'utf8');
  assert(!content.includes('"role":"user"') && !content.includes('"role":"assistant"'), 'no Pi conversation is copied into a second model context');
  server.externalTools.cancel(client, { toolSessionId: first.toolSessionId });
  const second = await server.externalTools.open(client, { project: root, sourceSessionId: 'parent:one' });
  assert.equal(second.canonicalChatId, first.canonicalChatId, 'reuse one verification chat across Pi turns');
  assert.notEqual(second.turnId, first.turnId, 'new turn cannot reuse old grants');
  const count = readdirSync(path.join(root, '.zyra/sessions')).filter(name => name.endsWith('.jsonl')).length;
  assert.equal(count, 1, 'no new tool chat for every turn');
  const other = await server.externalTools.open({ ...client, connectionId: 'fixture:child' }, { project: root, sourceSessionId: 'child:one' });
  assert.notEqual(other.canonicalChatId, first.canonicalChatId, 'child context has its own control identity');
  console.log('PASS tool catalog: real persisted chat, Desktop discovery, private-context separation, turn reuse and child isolation');
} finally { server.externalTools.dispose(); await server.catalog.index.closeModelBackfill(); server.memoryQueue.dispose(); rmSync(root, { recursive: true, force: true }); }
