import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ZyraAgentServer } from '../src/agent-server/server.mjs';
import { ZyraAgentServerClient } from '../src/agent-server/client.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'zyra-connect-overlap-'));
const project = path.join(directory, 'project'); await mkdir(project);
let releaseTransport, notifyConnect;
const transportGate = new Promise(resolve => { releaseTransport = resolve; });
const connectStarted = new Promise(resolve => { notifyConnect = resolve; });
const requests = [];
class Worker extends EventEmitter {
  isAlive() { return true; }
  request(type, payload) {
    requests.push({ type, payload });
    if (type === 'connect') { notifyConnect(); return Promise.resolve({ threadId: 'chat:parallel', model: payload.model, cwd: project, messages: [], events: [] }); }
    return Promise.resolve({ ok: true });
  }
  dispose() {}
}
const server = new ZyraAgentServer({ root: path.resolve('.'), stateDirectory: directory, channel: 'overlap', createWorker: () => new Worker() });
server.harnessTransport.get = () => transportGate;
server.harnessTransport.prepareProject = async () => {};
const client = new ZyraAgentServerClient({ root: path.resolve('.'), stateDirectory: directory, channel: 'overlap', autoStart: false, surface: 'desktop', heartbeat: false });
try {
  await server.start(); await client.connect();
  let attached = false;
  const pending = client.attach({ project, cwd: project, model: 'opencode-harness/openai/gpt-6.1-sol', localThreadId: 'parallel', noSession: true, memoryEnabled: false,
    harnessTransport: { baseUrl: 'untrusted-caller', password: 'untrusted' } }).then(result => { attached = true; return result; });
  await Promise.race([connectStarted, new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Session setup waited for transport startup')), 2000); timer.unref(); })]);
  assert.equal(attached, false, 'attachment remains unavailable until the private transport is bound');
  assert.deepEqual(requests.find(r => r.type === 'connect').payload.harnessTransport, { deferred: true }, 'caller transport is discarded and setup cannot spawn another native service');
  releaseTransport({ baseUrl: 'synthetic-private-endpoint', password: 'synthetic-private-secret' });
  const result = await pending;
  assert.equal(requests.find(r => r.type === 'harness.transport').payload.password, 'synthetic-private-secret');
  assert.equal(JSON.stringify(result).includes('synthetic-private'), false, 'private transport does not enter attachment responses');
  assert.equal(JSON.stringify(server.state()).includes('synthetic-private'), false, 'private transport does not enter public state');
  console.log('Canonical IPC: session setup overlaps transport startup; binding precedes attachment and caller secrets stay private.');
} finally {
  client.close(); await server.stop();
  if (path.dirname(directory) !== tmpdir() || !path.basename(directory).startsWith('zyra-connect-overlap-')) throw Error('Unexpected cleanup target');
  await rm(directory, { recursive: true, force: true });
}
