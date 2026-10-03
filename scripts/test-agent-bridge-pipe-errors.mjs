import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentBridgeWorker } from '../src/agent-server/bridge-worker.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'zyra-bridge-pipe-errors-'));
let worker, exited;
try {
  const bridgePath = path.join(directory, 'bridge.mjs');
  await writeFile(bridgePath, 'process.stdin.resume();');
  worker = new AgentBridgeWorker({ root: directory, bridgePath });
  const errors = [];
  worker.on('worker-error', error => errors.push(error));
  const request = worker.request('fixture', {}, { timeoutMs: 5000 });
  const child = worker.child;
  exited = once(child, 'exit');
  const pipeError = Object.assign(new Error('Fixture bridge pipe closed.'), { code: 'EPIPE' });
  const rejected = assert.rejects(request, error => error === pipeError);
  child.stdin.destroy(pipeError);
  await rejected;
  assert.deepEqual(errors, [pipeError], 'a live pipe failure reaches the worker lifecycle');
  assert.equal(worker.pending.size, 0, 'pipe failure settles outstanding requests');
  worker.dispose();
  child.stdin.emit('error', pipeError);
  assert.equal(errors.length, 1, 'late shutdown pipe errors remain handled without reviving the worker');
  console.log('Agent bridge pipe errors: pending requests settle and late shutdown errors remain handled.');
} finally {
  worker?.dispose();
  await exited;
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
