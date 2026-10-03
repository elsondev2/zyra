import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ZyraAgentServer } from '../src/agent-server/server.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'zyra-navigation-presence-'));
const server = new ZyraAgentServer({ stateDirectory: directory, channel: 'navigation-test' });
try {
  const ancestor = { worker: Object.assign(new EventEmitter(), { isAlive: () => true }) };
  const parent = server.ensureAgentView(ancestor, { providerSessionId: 'parent', agentRunId: 'parent-run', cwd: directory });
  parent.parentOwner = null;
  parent.latestTurn = { id: 'parent-turn', state: 'completed' };
  const child = server.ensureAgentView(parent, { providerSessionId: 'child', agentRunId: 'child-run', cwd: directory });
  child.latestTurn = { id: 'child-turn', state: 'completed' };
  child.clients.add({ clientId: 'viewer', surface: 'desktop', attachedSessionIds: new Set() });
  assert.equal(server.sessionPresence('parent').state, 'ready', 'Viewing a completed child must not revive its parent');
  child.activeRequests = 1;
  assert.equal(server.sessionPresence('parent').state, 'ready', 'Reading a child must not count as work');
  child.latestTurn = { id: 'child-next', state: 'running' };
  assert.equal(server.sessionPresence('parent').state, 'background', 'Real child work remains visible independently of selection');
  child.latestTurn = { id: 'child-next', state: 'completed' };
  assert.equal(server.sessionPresence('parent').state, 'ready');
  console.log('PASS completed child viewing and reads preserve parent idle state; real child work remains background work');
} finally {
  server.memoryQueue.dispose?.();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert(path.basename(directory).startsWith('zyra-navigation-presence-'));
  rmSync(directory, { recursive: true, force: true });
}
