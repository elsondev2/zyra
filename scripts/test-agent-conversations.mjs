import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CanonicalChatCatalog } from '../src/agent-server/catalog.mjs';
import { AgentThreadCoordinator } from '../src/agent-server/thread-coordinator.mjs';

const temporary = mkdtempSync(path.join(os.tmpdir(), 'zyra-agent-conversations-'));
try {
  const project = path.join(temporary, 'project');
  const stateDirectory = path.join(temporary, 'state');
  mkdirSync(project, { recursive: true });
  const chat = { canonicalChatId: 'independent-session', project, storageProject: project, cwd: project,
    sessionPath: path.join(project, 'independent.jsonl'), modifiedAt: new Date().toISOString(), title: 'Independent' };
  const index = { listProjects: async () => [chat], get: () => chat, update() {}, registerAgentThread() {} };
  const catalog = new CanonicalChatCatalog({ stateDirectory, channel: 'test-agent-conversations', index });
  catalog.record.metadata[chat.canonicalChatId] = { agentCreatedBy: 'owner-session' };
  assert.deepEqual(await catalog.list({ project }), [], 'legacy unclassified child remains hidden while its fleet snapshot is unavailable');
  const snapshotPath = path.join(project, '.zyra', 'agent-runs', 'owner-session', 'fleet.snapshot.json');
  mkdirSync(path.dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify({ agents: { independent: {
    providerSessionId: chat.canonicalChatId, conversationKind: 'thread'
  } } }));
  assert.equal((await catalog.list({ project })).some(item => item.canonicalChatId === chat.canonicalChatId), true,
    'legacy independent thread becomes visible as soon as its parent snapshot appears');
  writeFileSync(snapshotPath, JSON.stringify({ agents: { independent: {
    providerSessionId: chat.canonicalChatId, conversationKind: 'subagent'
  } } }));
  assert.deepEqual(await catalog.list({ project }), [], 'a changed snapshot replaces a prior legacy classification');

  let writes = 0;
  const agent = { providerSessionId: 'retry-session', sessionFile: path.join(project, 'retry.jsonl'),
    agentRunId: 'run-1', label: 'Retry', conversationKind: 'thread' };
  const owner = { sessionKey: 'owner-session', connectedResult: { project }, latestFleetSnapshot: { agents: { 'run-1': agent } } };
  const server = {
    paths: { stateDirectory, namespaceId: 'fixture' }, sessions: new Map([['owner-session', owner]]),
    ensureAgentView() {}, broadcastCatalogChanged() {}, emit() {},
    catalog: { index, updateChat: async () => { writes += 1; if (writes === 1) throw new Error('transient catalog failure'); } }
  };
  const coordinator = new AgentThreadCoordinator(server);
  coordinator.registerAgentThreads(owner);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(coordinator.registered.has(agent.providerSessionId), false, 'rejected metadata write must remain eligible for retry');
  coordinator.registerAgentThreads(owner);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(writes, 2);
  assert.equal(coordinator.registered.has(agent.providerSessionId), true, 'successful metadata write registers the session');

  const serverSource = readFileSync(new URL('../src/agent-server/server.mjs', import.meta.url), 'utf8');
  assert.match(serverSource, /requested\.agentConversationKind === 'thread'[\s\S]*?this\.catalog\.find\(requested\.agentCreatedBy[\s\S]*?this\.attachSession\(client, \{ \.\.\.params, session: ownerChat\.canonicalChatId/,
    'opening a durable independent thread must restore its recorded owner before attaching the child view');
} finally {
  rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
console.log('Agent conversation catalog freshness, registration retry and restart owner restoration passed');
