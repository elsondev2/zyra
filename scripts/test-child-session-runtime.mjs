import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ModelRuntime, ModelRegistry } from '../src/runtime/engine/src/index.js';
import { AssistantMessageEventStream } from '../src/runtime/providers/src/utils/event-stream.js';
import { envApiKeyAuth } from '../src/runtime/providers/src/auth/helpers.js';
import { AgentFleetController } from '../src/agents/runtime/fleet-controller.mjs';
import { ChildSessionFactory } from '../src/agents/runtime/child-session-factory.mjs';
import { ChildSessionHost } from '../src/agents/runtime/child-session-host.mjs';

// Real fleet -> factory -> owned AgentSession -> auth -> tool loop. No network,
// user credentials, or worktree edits: auth exists only on the parent runtime.
const directory = await mkdtemp(path.join(os.tmpdir(), 'zyra-child-runtime-'));
let fleet;
let host;
try {
  const model = { provider: 'fixture', id: 'child-fixture', name: 'Child fixture', api: 'fixture', baseUrl: 'https://fixture.invalid', reasoning: true, input: ['text'], contextWindow: 8192, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  let requests = 0;
  let failRequest = false;
  let expectedKey = 'synthetic-parent-only-key';
  const stream = (_model, context, options) => {
    assert.equal(options.apiKey, expectedKey);
    requests++;
    const result = new AssistantMessageEventStream();
    const needsRead = !context.messages.some(entry => entry.role === 'toolResult');
    const message = { role: 'assistant', provider: model.provider, model: model.id, api: model.api, usage, timestamp: Date.now(),
      stopReason: failRequest ? 'error' : needsRead ? 'toolUse' : 'stop',
      ...(failRequest ? { errorMessage: 'Synthetic provider failure' } : {}),
      content: failRequest ? [] : needsRead ? [{ type: 'toolCall', id: `read-${requests}`, name: 'read', arguments: { path: 'evidence.txt' } }] : [{ type: 'text', text: `Verified child result ${requests}` }],
    };
    if (!needsRead && !failRequest) assert.match(context.messages.find(entry => entry.role === 'toolResult').content[0].text, /Scoped evidence/);
    queueMicrotask(() => {
      result.push({ type: 'start', partial: message });
      result.push(failRequest ? { type: 'error', reason: 'error', error: message } : { type: 'done', reason: message.stopReason, message });
      result.end();
    });
    return result;
  };
  await writeFile(path.join(directory, 'evidence.txt'), 'Scoped evidence');
  const modelRuntime = await ModelRuntime.create({ authPath: path.join(directory, 'empty-auth.json'), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
  modelRuntime.registerNativeProvider({ id: 'fixture', auth: { apiKey: envApiKeyAuth('Fixture', []) }, getModels: () => [model], stream, streamSimple: stream });
  await modelRuntime.setRuntimeApiKey('fixture', 'synthetic-parent-only-key');
  const modelRegistry = new ModelRegistry(modelRuntime);
  const missingRuntime = new ChildSessionFactory({ project: directory, transcriptDirectory: path.join(directory, 'children') });
  await assert.rejects(missingRuntime.create({ model }), /parent model runtime/);
  const factory = new ChildSessionFactory({ project: directory, agentDir: directory, transcriptDirectory: path.join(directory, 'children'), modelRuntime,
    settings: { compaction: { enabled: false }, retry: { enabled: false } } });
  host = new ChildSessionHost({ factory, maxTurns: 8 });
  await host.open({ model, tools: ['read'], readScope: ['.'], noSession: true });
  assert.ok(host.requireSession().modelRuntime === modelRuntime, 'The child must use parent auth and model registrations, not a default credential store.');
  const first = await host.run('Read the evidence and answer.');
  assert.equal(first.turns, 2);
  assert.match(first.text, /Verified child result/);
  assert.equal(requests, 2);
  host.dispose();
  host = null;

  fleet = new AgentFleetController({ project: directory, rootSessionId: 'fixture-root', rootSession: { model, modelRuntime, modelRegistry },
    modelCatalog: [{ key: 'fixture/child-fixture', provider: model.provider, id: model.id, model, eligible: true, authenticated: true, availability: 'available', rejectionReasons: [], reasoning: true, toolUse: true, contextWindow: 8192 }] });
  await fleet.initialize({ installRoot: path.resolve('.') });
  const spawned = await fleet.spawn({ prompt: 'Read the evidence.', model: 'inherit', tools: ['read'], readScope: ['.'], maxTurns: 8, background: true });
  const completed = await fleet.wait(spawned.agentRunId);
  assert.equal(completed.status, 'completed', completed.error?.message);
  const delegatedSession = fleet.completedHosts.get(spawned.agentRunId).requireSession();
  const delegatedEntry = delegatedSession.sessionManager.getEntries().find(entry => entry.type === 'custom_message' && entry.customType === 'zyra_thread_message');
  assert.equal(delegatedEntry?.details?.origin, 'delegation', 'Initial agent context persists its origin rather than becoming an ordinary user prompt.');
  assert.equal(delegatedEntry?.details?.text, 'Read the evidence.');
  assert.equal(delegatedSession.messages.some(message => message.role === 'user' && JSON.stringify(message.content).includes('Delegated goal:')), false);
  assert.ok(fleet.completedHosts.get(spawned.agentRunId).requireSession().modelRuntime === modelRuntime);
  await fleet.send(spawned.agentRunId, 'Continue the evidence review.');
  assert.match(fleet.status(spawned.agentRunId).result.text, /Verified child result/);
  const previousHost = fleet.completedHosts.get(spawned.agentRunId);
  expectedKey = 'synthetic-refreshed-parent-key';
  await modelRuntime.setRuntimeApiKey('fixture', expectedKey);
  await fleet.resume(spawned.agentRunId, 'Resume the persisted evidence review.');
  const resumed = await fleet.wait(spawned.agentRunId);
  assert.equal(resumed.status, 'completed', resumed.error?.message);
  assert.equal(resumed.attempt, 2);
  assert.equal(resumed.sessionFile, completed.sessionFile);
  assert.equal(previousHost.sessionResult, null, 'Resume must dispose the replaced host.');
  console.log('PASS real child sessions inherit parent authentication and providers through tools, follow-up, and persisted resume');
  failRequest = true;
  const failing = await fleet.spawn({ prompt: 'Synthetic failure.', model: 'inherit', tools: ['read'], background: true });
  const failed = await fleet.wait(failing.agentRunId);
  assert.equal(failed.status, 'failed', 'An exhausted provider error must not be reported as a completed child.');
  assert.match(failed.error.message, /Synthetic provider failure/);
  const failedReplay = await fleet.eventStore.load();
  assert.equal(failedReplay.snapshot.agents[failing.agentRunId].status, 'failed');
  failRequest = false;
  await fleet.retry(failing.agentRunId);
  const retried = await fleet.wait(failing.agentRunId);
  assert.equal(retried.status, 'completed', retried.error?.message);
  assert.equal(retried.attempt, 2);
  assert.equal(retried.error, null);
  console.log('PASS provider failures remain failures and can be retried successfully');
  failRequest = true;
  await assert.rejects(fleet.send(failing.agentRunId, 'Fail this follow-up.'), /Synthetic provider failure/);
  assert.equal(fleet.status(failing.agentRunId).status, 'failed', 'Follow-up failures must update the durable fleet state.');
  failRequest = false;
  await fleet.resume(failing.agentRunId, 'Recover the failed follow-up.');
  const recovered = await fleet.wait(failing.agentRunId);
  assert.equal(recovered.status, 'completed', recovered.error?.message);
  assert.equal(recovered.error, null);
  const completedReplay = await fleet.eventStore.load();
  assert.equal(completedReplay.snapshot.agents[failing.agentRunId].status, 'completed');
  console.log('PASS failed follow-ups update durable status and resume successfully');
  const limitedEvents = [];
  const unsubscribe = fleet.subscribeSessionEvents(entry => limitedEvents.push(entry));
  const limited = await fleet.spawn({ prompt: 'Bounded tool work.', model: 'inherit', tools: ['read'], readScope: ['.'], maxTurns: 1, background: true });
  const stopped = await fleet.wait(limited.agentRunId);
  unsubscribe();
  assert.equal(stopped.status, 'cancelled', 'Hitting the child turn limit is a bounded stop, not a provider failure.');
  assert.equal(stopped.error.code, 'CHILD_MAX_TURNS');
  const budgetEvents = limitedEvents.filter(entry => entry.agentRunId === limited.agentRunId).map(entry => entry.event);
  assert.ok(budgetEvents.some(event => event.type === 'zyra_agent_interruption' && event.interruption.reason === 'turn-limit'));
  assert.ok(budgetEvents.some(event => event.type === 'agent_end' && event.outcome === 'interrupted' && event.interruption.reason === 'turn-limit'));
  const stoppedReplay = await fleet.eventStore.load();
  assert.equal(stoppedReplay.snapshot.agents[limited.agentRunId].status, 'cancelled');
  console.log('PASS real child turn limits retain stop reason through session, fleet completion, and durable replay');
} finally {
  host?.dispose();
  await fleet?.dispose();
  await rm(directory, { recursive: true, force: true });
}
