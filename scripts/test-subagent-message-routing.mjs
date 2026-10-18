import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AgentThreadCoordinator } from '../src/agent-server/thread-coordinator.mjs';
import { deliverThreadMessage } from '../src/threads/delivery.mjs';
import { ChildSessionHost } from '../src/agents/runtime/child-session-host.mjs';
import { AgentFleetController } from '../src/agents/runtime/fleet-controller.mjs';

// Real coordinator, mailbox and delivery, with no provider, user data or daemon.
const directory = await mkdtemp(path.join(os.tmpdir(), 'zyra-subagent-messages-'));
const project = path.join(directory, 'project');
const rootId = 'root-chat';
const workerId = 'support-worker';
const peerId = `thread-${'a'.repeat(64)}`;
const listeners = new Set();
const entries = [];
const calls = [];
const session = {
  isStreaming: false,
  messages: [{ role: 'assistant', stopReason: 'error', errorMessage: 'Old unrelated failure' }],
  sessionManager: { getEntries: () => entries },
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  async sendCustomMessage(message, options) {
    calls.push({ message, options });
    entries.push({ type: 'custom_message', ...message });
    for (const listener of listeners) listener({ type: 'message_end', message: { role: 'custom', ...message } });
    if (options.triggerTurn) session.messages.push({ role: 'assistant', stopReason: 'stop' });
  },
};
const source = {
  sessionKey: rootId,
  connectedResult: { project, sessionName: 'Root' },
  latestFleetSnapshot: { agents: {
    [workerId]: { agentRunId: workerId, providerSessionId: 'worker-canonical', conversationKind: 'subagent', status: 'running', label: 'Supporting helper' },
    [peerId]: { agentRunId: peerId, providerSessionId: 'peer-canonical', conversationKind: 'thread', status: 'completed', label: 'Independent peer' },
  } },
  async request(_client, type, payload) {
    assert.equal(type, 'thread_message.receive');
    return deliverThreadMessage(session, payload.message);
  },
};
const server = {
  paths: { stateDirectory: directory, namespaceId: 'fixture' }, sessions: new Map([[rootId, source]]),
  catalog: { resolveAlias: id => id }, broadcastCatalogChanged() {}, emit() {},
};
const coordinator = new AgentThreadCoordinator(server);
async function send(agentRunId, operation, extra = {}) {
  const result = await coordinator.request(source, { agentRunId, input: { action: 'send', threadId: rootId, prompt: 'Bounded result, not user authority.', dedupeKey: operation, ...extra } });
  for (let count = 0; coordinator.mailbox.messages.get(result.messageId).status === 'queued'; count++) {
    assert(count < 100, 'Delivery must settle without a model turn');
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  return coordinator.mailbox.messages.get(result.messageId);
}
try {
  const receipt = await send(workerId, 'worker-idle', { senderConversationKind: 'thread', display: true, triggerTurn: true });
  assert.equal(receipt.senderConversationKind, 'subagent', 'The server stamps actual supporting-agent provenance, ignoring caller-supplied presentation');
  assert.equal(receipt.status, 'delivered');
  assert.equal(calls[0].message.display, false, 'Supporting-agent context must not become a peer chat bubble');
  assert.equal(calls[0].options.triggerTurn, false, 'An internal update must not wake an idle parent for a redundant reply');
  assert.equal(session.messages.length, 1, 'A previous provider failure does not reject a context-only delivery or produce an acknowledgement');
  assert.equal(listeners.size, 0, 'Receipt listeners are released');
  await deliverThreadMessage(session, receipt);
  assert.equal(calls.length, 1, 'Duplicate delivery never appends or wakes a second time');

  session.isStreaming = true;
  await send(workerId, 'worker-streaming');
  assert.equal(calls[1].message.display, false);
  assert.equal(calls[1].options.triggerTurn, false, 'Streaming updates append context without follow-up turn storms');
  assert.equal(entries.length, 2, 'Supporting context is retained durably for the current/next natural turn');
  session.isStreaming = false;

  const peer = await send(peerId, 'peer-idle', { senderConversationKind: 'subagent' });
  assert.equal(peer.senderConversationKind, 'thread', 'Explicit independent conversation provenance wins over caller arguments');
  assert.equal(peer.status, 'delivered');
  assert.equal(calls[2].message.display, true);
  assert.equal(calls[2].options.triggerTurn, true, 'Genuine peer messages keep their existing conversation semantics');

  const legacy = { ...receipt, messageId: 'legacy-worker', senderConversationKind: undefined };
  await deliverThreadMessage(session, legacy);
  assert.equal(calls[3].message.display, false, 'Old queued supporting receipts remain internal after restart');
  assert.equal(calls[3].options.triggerTurn, false);
  const legacyPeer = { ...peer, messageId: 'legacy-peer', senderConversationKind: undefined };
  await deliverThreadMessage(session, legacyPeer);
  assert.equal(calls[4].message.display, true, 'Stable legacy independent thread IDs remain visible');
  const host = new ChildSessionHost({ maxTurns: 1 });
  host.sessionResult = { session, sessionId: 'parent-session', sessionFile: 'synthetic-only.jsonl' };
  host.turns = host.turnsStarted = 1;
  const contextResult = await host.send('', { ...receipt, messageId: 'nested-context' });
  assert.equal(contextResult.mode, 'context-only', 'A supporting update to a parent child session does not reserve another model turn');
  assert.equal(host.turnsStarted, 1);
  const controller = Object.assign(Object.create(AgentFleetController.prototype), {
    active: new Map(), completedHosts: new Map([['parent', host]]),
    status: () => ({ status: 'completed', workflowRunId: 'budgeted-workflow' }),
    assertUsable() {}, throwIfCancelled() {},
  });
  const fleetContext = await controller.send('parent', '', { ...receipt, messageId: 'completed-parent-context' });
  assert.equal(fleetContext.mode, 'context-only', 'Context receipt does not restart a completed run or spend workflow request budget');
  assert.equal(controller.status().status, 'completed');
  controller.throwIfCancelled = () => { throw new Error('Synthetic cancellation'); };
  await assert.rejects(controller.send('parent', '', { ...receipt, messageId: 'cancelled-context' }), /cancellation/);
  console.log('PASS trusted supporting/independent routing, context-only root/nested delivery, legacy queues, receipts, cancellation and peer behavior');
} finally { await rm(directory, { recursive: true, force: true }); }
