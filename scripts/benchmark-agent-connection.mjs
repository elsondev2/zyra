import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join, basename } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fixtureModel, isolateBridgeEnvironment } from './fixtures/agent-server-bridge-env.mjs';

// Real server, protocol and SDK workers; only credentials and input data are fixtures.
const directory = mkdtempSync(join(tmpdir(), 'zyra-connection-perf-'));
const isolation = isolateBridgeEnvironment(directory);
const baselineIndex = process.argv.indexOf('--baseline-source-dir');
if (baselineIndex >= 0) process.env.ZYRA_PERF_BASELINE_DIR = resolve(process.argv[baselineIndex + 1]);
if (process.argv.includes('--trace-phases')) {
  process.env.ZYRA_PERF_TRACE_DIR = join(directory, 'phase-timings');
  mkdirSync(process.env.ZYRA_PERF_TRACE_DIR);
}
const hooks = new URL('./fixtures/connection-performance-hooks.mjs', import.meta.url);
process.env.NODE_OPTIONS += ` --import ${JSON.stringify(hooks.href)}`;
await import(hooks.href);
const root = resolve(import.meta.dirname, '..');
const project = join(directory, 'project');
mkdirSync(project, { recursive: true });
const timings = {};
const requests = [];
const exits = [];
let server, client, daemon;
const measure = async (name, work) => {
  const start = performance.now();
  const result = await work();
  timings[name] = performance.now() - start;
  console.log(`${name}: ${timings[name].toFixed(1)}ms`);
  return result;
};
try {
  const { ZyraAgentServerClient } = await import('../src/agent-server/client.mjs');
  const { ZyraAgentServer } = await import('../src/agent-server/server.mjs');
  const { AgentBridgeWorker } = await import('../src/agent-server/bridge-worker.mjs');
  const autoStartOnly = process.argv.includes('--autostart-only');
  if (autoStartOnly) {
    client = new ZyraAgentServerClient({ root, stateDirectory: join(directory, 'state'), channel: `perf-${process.pid}`,
      clientId: 'desktop:perf', surface: 'desktop' });
    // Keep a process handle for cleanup; the entry, environment and IPC are real.
    client.startServer = () => {
      daemon = spawn(process.execPath, [join(root, 'src/agent-server/main.mjs'), '--channel', client.paths.channel], {
        cwd: root, env: process.env, windowsHide: true, stdio: 'ignore',
      });
      exits.push(once(daemon, 'close'));
    };
    await measure('autoStartVerifiedHandshakeMs', () => client.connect());
    assert.equal(client.instance.namespaceId, client.paths.namespaceId);
  } else {
  server = new ZyraAgentServer({ root, stateDirectory: join(directory, 'state'), channel: `perf-${process.pid}`,
    idleTimeoutMs: 5000,
    createWorker(options) {
      const worker = new AgentBridgeWorker(options);
      const request = worker.request.bind(worker);
      worker.request = async (...args) => {
        const start = performance.now();
        try { return await request(...args); }
        finally { requests.push({ type: args[0], wallMs: performance.now() - start }); }
      };
      const dispose = worker.dispose.bind(worker);
      worker.dispose = (...args) => {
        if (worker.child) exits.push(once(worker.child, 'close'));
        return dispose(...args);
      };
      return worker;
    },
  });
  await measure('serverStartMs', () => server.start());
  client = new ZyraAgentServerClient({ root, stateDirectory: join(directory, 'state'), channel: `perf-${process.pid}`,
    autoStart: false, verifyRuntimeRevision: true, clientId: 'desktop:perf', surface: 'desktop' });
  await measure('verifiedHandshakeMs', () => client.connect());
  const args = { project, cwd: project, model: fixtureModel, thinking: 'low', profile: 'default',
    runtimeMode: 'approval-required', skipMemoryStartup: true };
  const first = await measure('firstColdAttachMs', () => client.attach({ ...args, localThreadId: 'perf-first' }));
  assert.equal(first.connected.model, fixtureModel);
  const second = await measure('secondColdAttachMs', () => client.attach({ ...args, localThreadId: 'perf-second' }));
  assert.equal(second.connected.model, fixtureModel);
  const reused = await measure('existingChatAttachMs', () => client.attach({ ...args, session: first.canonicalChatId, localThreadId: 'perf-reused' }));
  assert.equal(reused.canonicalChatId, first.canonicalChatId);
  }
  isolation.assertOffline();
  const outputIndex = process.argv.indexOf('--output');
  const phases = process.env.ZYRA_PERF_TRACE_DIR ? readdirSync(process.env.ZYRA_PERF_TRACE_DIR).map(name => JSON.parse(readFileSync(join(process.env.ZYRA_PERF_TRACE_DIR, name), 'utf8'))) : [];
  const report = { protocol: 'Process-cold real bridge workers; filesystem cache uncontrolled. Real in-process server start, verified IPC handshake. No prompts/provider/network calls.', baselineSource: baselineIndex >= 0, node: process.version, timings, requests, phases, networkAttempts: 0 };
  if (outputIndex >= 0) writeFileSync(resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2));
} finally {
  client?.close();
  daemon?.kill();
  await server?.stop();
  await Promise.allSettled(exits);
  isolation.assertOffline();
  isolation.restore();
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-connection-perf-')) throw Error('Unexpected cleanup path');
  rmSync(directory, { recursive: true, force: true });
}
