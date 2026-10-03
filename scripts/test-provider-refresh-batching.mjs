import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isolateBridgeEnvironment } from './fixtures/agent-server-bridge-env.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'zyra-refresh-batch-'));
const isolation = isolateBridgeEnvironment(directory);
try {
  const { ModelRuntime } = await import('../src/runtime/engine/src/core/model-runtime.js');
  const runtime = await ModelRuntime.create({ authPath: path.join(directory, 'auth.json'), modelsPath: null, refreshOnCreate: false });
  const original = runtime.refresh.bind(runtime);
  const pending = [];
  runtime.refresh = options => { const result = original(options); pending.push(result); return result; };
  const add = id => runtime.registerProvider(id, { apiKey: 'synthetic-key', models: [{
    id: 'fixture', name: 'Fixture', api: 'openai-completions', baseUrl: 'https://fixture.invalid',
    reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 1024,
  }] });
  add('batch-first'); add('batch-second'); add('batch-third');
  assert.ok(runtime.getModel('batch-third', 'fixture'), 'model registration remains synchronous');
  await runtime.refresh({ allowNetwork: false });
  await Promise.resolve();
  assert.equal(pending.length, 1, 'the explicit catalog refresh covers all queued registrations');
  assert.ok(runtime.getModel('batch-first', 'fixture'));
  assert.ok(runtime.getModel('batch-second', 'fixture'));
  runtime.unregisterProvider('batch-first'); runtime.unregisterProvider('batch-second');
  await Promise.resolve(); await Promise.all(pending);
  assert.equal(pending.length, 2, 'a registration burst without an explicit refresh still refreshes once');
  assert.equal(runtime.getModel('batch-first', 'fixture'), undefined);
  assert.equal(runtime.getModel('batch-second', 'fixture'), undefined);
  assert.ok(runtime.getModel('batch-third', 'fixture'));
  add('batch-fourth');
  const scoped = runtime.refresh({ allowNetwork: false, providers: ['batch-third'] });
  await Promise.resolve(); await scoped; await Promise.all(pending);
  assert.equal(pending.length, 4, 'a provider-scoped refresh cannot discard other queued registrations');
  assert.ok(runtime.getModel('batch-fourth', 'fixture'));
  add('batch-after-cancel');
  const cancelled = new AbortController(); cancelled.abort();
  await runtime.refresh({ allowNetwork: false, signal: cancelled.signal }).catch(error => {
    assert.equal(error.name, 'AbortError');
  });
  await Promise.resolve(); await Promise.allSettled(pending);
  assert.equal(pending.length, 6, 'a cancellable explicit refresh cannot cancel independent registration work');
  assert.ok(runtime.getAvailableSnapshot().some(model => model.provider === 'batch-after-cancel'));
  isolation.assertOffline();
  console.log('Provider refresh batching: synchronous model updates, explicit full refresh, deferred bursts, scoped refresh isolation: ok');
} finally {
  isolation.restore(); await rm(directory, { recursive: true, force: true });
}
