import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AgentBridgeWorker } from '../src/agent-server/bridge-worker.mjs';

const fixture = await mkdtemp(path.join(os.tmpdir(), 'zyra-force-stop-'));
let worker;
try {
  await mkdir(path.join(fixture, 'src'));
  const trace = path.join(fixture, 'cleanup.jsonl');
  await writeFile(path.join(fixture, 'src', 'zyra-sdk.mjs'), `
import { appendFileSync } from 'node:fs';
const record = event => appendFileSync(${JSON.stringify(trace)}, JSON.stringify(event) + '\\n');
let emit, finishPrompt, finishJob, permission, browser, options;
export async function createZyraSession(value) {
  options = value;
  const job = { done: new Promise(resolve => { finishJob = resolve; }) };
  return {
    session: {
      sessionManager: { getSessionId: () => 'fixture-chat', getSessionName: () => 'Fixture' },
      subscribe(listener) { emit = listener; return () => {}; },
      abortCompaction() { record('abort-compaction'); },
      async abort() { record('abort-root'); await Promise.all([permission, browser, job.done]); finishPrompt(); },
      dispose() {}
    },
    managedBash: {
      jobs: new Map([['background-job', job]]),
      abortAll() { record('abort-job'); setTimeout(() => { record('job-exited'); finishJob(); }, 40); }
    },
    fleet: { async cancelAll() { record('abort-fleet'); } }
  };
}
export function getZyraThinkingLevel() { return 'medium'; }
export function describeRuntime() { return {}; }
export function setZyraReasoningSummary() {}
export async function runZyraPrompt() {
  const result = new Promise(resolve => { finishPrompt = resolve; });
  permission = options.permissionRequest({ title: 'Pending approval', toolName: 'bash' }).then(decision => record('approval-' + decision));
  browser = options.controlBridgeClient.request({ operation: 'observe', targetId: 'fixture' }).catch(error => record(error.code));
  emit({ type: 'agent_start' });
  await result;
}
`);
  worker = new AgentBridgeWorker({ root: fixture, cwd: fixture, bridgePath: path.resolve(import.meta.dirname, '../src/zyra-ui-bridge.mjs') });
  let remoteCancelled = false;
  worker.on('control', message => { if (message.type === 'control.cancel') remoteCancelled = true; });
  await worker.request('connect', { surface: 'memory-worker', cwd: fixture }, { timeoutMs: 15000 });
  const started = once(worker, 'event');
  const prompt = worker.request('prompt', { prompt: 'fixture', skipTitleGeneration: true });
  void prompt.catch(() => {});
  await started;
  await worker.request('abort', {}, { timeoutMs: 5000 });
  await prompt;
  const events = (await readFile(trace, 'utf8')).trim().split('\n').map(JSON.parse);
  for (const expected of ['abort-compaction', 'abort-job', 'job-exited', 'abort-fleet', 'abort-root', 'approval-decline', 'CONTROL_CANCELLED']) {
    assert(events.includes(expected), `Force Stop acknowledgement must follow ${expected}`);
  }
  assert(remoteCancelled, 'Force Stop cancels the correlated desktop browser request');
  assert(!events.includes('dispose-session'), 'Force Stop preserves the chat session');
  console.log('Force Stop cancels background jobs, fleet, pending approvals and remote browser input before acknowledgement: ok');
} finally {
  const child = worker?.child;
  const exited = child && child.exitCode === null ? once(child, 'exit') : Promise.resolve();
  worker?.dispose();
  await exited;
  await rm(fixture, { recursive: true, force: true });
}
