import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isolateBridgeEnvironment, fixtureModel } from './fixtures/agent-server-bridge-env.mjs';

const root = path.resolve(import.meta.dirname, '..');
const directory = mkdtempSync(path.join(tmpdir(), 'zyra-worker-preparation-'));
const isolation = isolateBridgeEnvironment(directory);
let server, client;
const workers = [];
try {
  const { ZyraAgentServer } = await import('../src/agent-server/server.mjs');
  const { ZyraAgentServerClient } = await import('../src/agent-server/client.mjs');
  server = new ZyraAgentServer({ root, stateDirectory: path.join(directory, 'server'), channel: 'preparation' });
  const createWorker = server.sessionWorkerPool.createWorker;
  server.sessionWorkerPool.createWorker = input => { const worker = createWorker(input); workers.push(worker); return worker; };
  await server.start();
  const warmed = server.sessionWorkerPool.spare;
  assert.ok(warmed, 'the real server starts preparation before any chat attaches');
  await warmed.request('prepare', {}, { timeoutMs: 60_000 });
  client = new ZyraAgentServerClient({ root, stateDirectory: path.join(directory, 'server'), channel: 'preparation', autoStart: false, surface: 'desktop' });
  await client.connect();
  assert.deepEqual(await client.request('runtime.prepare', { model: fixtureModel }), { prepared: true });
  assert.equal(server.sessions.size, 0, 'draft preparation does not create or attach a chat');
  assert.equal(server.harnessTransport.pending, null, 'a direct model does not start the optional harness');
  let selectedPreparations = 0;
  const getTransport = server.harnessTransport.get;
  server.harnessTransport.get = async () => { selectedPreparations++; return { baseUrl: 'synthetic-private-endpoint', password: 'synthetic-private-secret' }; };
  try {
    assert.deepEqual(await client.request('runtime.prepare', { model: 'opencode-harness/openai/gpt-6.1-sol' }), { prepared: true },
      'selected-model preparation never returns the private transport');
    assert.equal(selectedPreparations, 1);
    assert.equal(server.sessions.size, 0, 'selected harness preparation does not create a chat');
  } finally { server.harnessTransport.get = getTransport; }
  for (let index = 1; index <= 2; index++) {
    const project = path.join(directory, `project-${index}`); mkdirSync(project);
    const expectedWorker = server.sessionWorkerPool.spare;
    await expectedWorker.request('prepare', {}, { timeoutMs: 60_000 });
    const began = performance.now();
    const attached = await client.attach({ project, cwd: project, localThreadId: `prepared-thread-${index}`, noSession: true,
      memoryEnabled: false, model: fixtureModel, thinking: 'low', profile: 'default', runtimeMode: 'approval-required' });
    const elapsed = performance.now() - began;
    assert.equal(server.sessions.get(attached.sessionKey).worker, expectedWorker, 'attachment claims the already prepared process');
    assert.equal(attached.connected.cwd, project, 'a worker prepared at the runtime root still owns the requested project');
    assert.equal(attached.connected.model, fixtureModel);
    console.log(`Prepared canonical attachment ${index}: ${Math.round(elapsed)} ms`);
  }
  isolation.assertOffline();
  console.log('Real server, bridge, SDK, isolated projects and replacement preparation passed without network/model calls.');
} finally {
  client?.close();
  const exits = workers.flatMap(worker => worker.child && worker.child.exitCode === null ? [once(worker.child, 'close')] : []);
  await server?.stop();
  await Promise.all(exits);
  isolation.restore();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('zyra-worker-preparation-')) throw new Error('Unexpected worker preparation cleanup path');
  rmSync(directory, { recursive: true, force: true });
}
