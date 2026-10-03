import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createZyraRuntime } from '../src/zyra-runtime.mjs';
import { disconnectModelProvider, connectModelProvider, normalizeProviderInput, refreshSavedProviderModels, registerSavedProviders, listModelProviders } from '../src/provider-connections.mjs';
const root = await mkdtemp(path.join(tmpdir(), 'zyra-providers-'));
let testError;
try {
 const file = path.join(root, 'providers.json');
 const registered = new Map(), keys = new Map(), requests = [];
 let catalogIds = ['claude-sonnet-fixture'];
 let modelsUnavailable = false;
 const runtime = { modelRegistry: { registerProvider(id, config) { registered.set(id, config); } }, authStorage: { async loginApiKey(id, key) { keys.set(id, key); }, async getApiKey(id) { return keys.get(id); }, hasAuth(id) { return keys.has(id); } } };
 const fetch = async (url, init) => { requests.push({ url, ...init }); return { ok: !modelsUnavailable, status: modelsUnavailable ? 503 : 200, json: async () => url.endsWith('/models') ? { data: catalogIds.map(id => ({ id })) } : { content: [{ type: 'text', text: 'OK' }] } }; };
 await connectModelProvider({ provider: 'anthropic', apiKey: 'test-key-only' }, { file, runtime, fetch });
 assert.equal(requests[1].url, 'https://api.anthropic.com/v1/messages'); assert.equal(requests[1].headers['x-api-key'], 'test-key-only');
 const initialSaved = await readFile(file, 'utf8'); assert.ok(!initialSaved.includes('test-key-only'));
 catalogIds = ['claude-sonnet-fixture', 'claude-sonnet-new'];
 const refreshed = await registered.get('anthropic').refreshModels();
 assert.deepEqual(refreshed.map(model => model.id), catalogIds);
 assert.ok(JSON.parse(await readFile(file, 'utf8')).anthropic.config.models.some(model => model.id === 'claude-sonnet-new'));
 assert.equal((await listModelProviders({ file, runtime }))[0].verified, true);
 const restored = new Map(); registerSavedProviders({ registerProvider: (id, config) => restored.set(id, config) }, file, { authStorage: runtime.authStorage, fetch }); assert.equal(restored.get('anthropic').models[0].id, 'claude-sonnet-fixture');
 catalogIds = ['claude-sonnet-fixture', 'claude-sonnet-restored'];
 assert.ok((await restored.get('anthropic').refreshModels()).some(model => model.id === 'claude-sonnet-restored'));
 const saved = await readFile(file, 'utf8');
 catalogIds = [];
 assert.ok((await restored.get('anthropic').refreshModels()).some(model => model.id === 'claude-sonnet-restored'), 'An empty upstream catalog must retain the last known models');
 modelsUnavailable = true;
 assert.ok((await restored.get('anthropic').refreshModels()).some(model => model.id === 'claude-sonnet-restored'), 'A failed refresh must retain the last known models');
 assert.equal(await readFile(file, 'utf8'), saved);
 modelsUnavailable = false;
 await assert.rejects(connectModelProvider({ provider: 'custom', name: 'Example', baseUrl: 'https://example.com/v1', model: 'fixture', apiKey: 'bad-key' }, { file, runtime, fetch: async () => ({ ok: false, status: 401 }) }));
 assert.equal(await readFile(file, 'utf8'), saved); assert.equal(keys.size, 1);
 for (const baseUrl of ['http://remote.example/v1', 'https://user:pass@example.com/v1', 'https://example.com/v1?key=secret']) assert.throws(() => normalizeProviderInput({ provider: 'custom', name: 'test', apiKey: 'test', baseUrl }));
 const authPath = path.join(root, 'fixture-auth.json'), modelsPath = path.join(root, 'fixture-models.json');
 const legacyPiAuthPath = path.join(root, 'legacy-auth.json');
 const real = await createZyraRuntime({ authPath, modelsPath, legacyPiAuthPath, loadSavedProviders: false });
 const customFile = path.join(root, 'custom-providers.json');
 const existing = await createZyraRuntime({ authPath, modelsPath, legacyPiAuthPath, providerConfigPath: customFile });
  catalogIds = ['fixture-model'];
 await connectModelProvider({ provider: 'custom', name: 'Fixture', baseUrl: 'https://example.com/v1', model: 'fixture-model', apiKey: 'fixture-key-not-real' }, { file: customFile, runtime: real, fetch });
  registerSavedProviders(existing.modelRegistry, customFile, { fetch });
  catalogIds = ['fixture-model', 'runtime-discovered-model'];
  await refreshSavedProviderModels({ file: customFile, authStorage: existing.authStorage, fetchImpl: fetch });
  const boundedFile = path.join(root, 'bounded-providers.json');
  const savedEntry = JSON.parse(await readFile(customFile, 'utf8'))['custom-fixture'];
  await writeFile(boundedFile, JSON.stringify(Object.fromEntries(['custom-first', 'custom-second'].map(provider => [provider, { ...savedEntry, model: `${provider}/${savedEntry.config.models[0].id}` }]))));
  const boundedBefore = await readFile(boundedFile, 'utf8');
  const delayedRequests = [];
  const cachedRefresh = await refreshSavedProviderModels({ file: boundedFile, refreshTimeoutMs: 100,
    authStorage: { getApiKey: async () => 'synthetic-bounded-key' },
    fetchImpl: () => new Promise(resolve => delayedRequests.push(resolve)),
  });
  assert.equal(delayedRequests.length, 2, 'Saved providers refresh concurrently');
  assert.equal(cachedRefresh.length, 2, 'A stalled refresh returns saved catalogs at the total deadline');
  assert.deepEqual(cachedRefresh[0].models, savedEntry.config.models);
  for (const resolve of delayedRequests) resolve({ ok: true, json: async () => ({ data: [{ id: 'late-unwanted-model' }] }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await readFile(boundedFile, 'utf8'), boundedBefore, 'Expired discovery cannot overwrite saved models later');
  const cancelled = new AbortController(); cancelled.abort(new Error('Fixture provider refresh cancelled'));
  await assert.rejects(refreshSavedProviderModels({ file: boundedFile, signal: cancelled.signal }), /Fixture provider refresh cancelled/);
  const harnessFile = path.join(root, 'bounded-harness.json');
  await writeFile(harnessFile, JSON.stringify({ 'opencode-harness': { ...savedEntry, model: `opencode-harness/${savedEntry.config.models[0].id}` } }));
  let finishDetection, spawnCount = 0;
  const harnessCached = await refreshSavedProviderModels({ file: harnessFile, refreshTimeoutMs: 50,
    harness: { findExecutable: () => new Promise(resolve => { finishDetection = resolve; }), spawn: () => { spawnCount++; throw new Error('Expired discovery must not start a service'); } },
  });
  assert.deepEqual(harnessCached[0].models, savedEntry.config.models);
  finishDetection('fixture-executable');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(spawnCount, 0, 'An expired harness refresh cannot start a service after detection completes');
  registerSavedProviders(existing.modelRegistry, customFile, { authStorage: existing.authStorage, fetch });
  const requestCountBeforeLocalSync = requests.length;
  await existing.modelRegistry.refresh({ allowNetwork: false });
  assert.equal(requests.length, requestCountBeforeLocalSync, 'Applying a refreshed catalog must not request provider models again');
 assert.ok(existing.modelRegistry.getAvailable().some(model => model.provider === 'custom-fixture' && model.id === 'runtime-discovered-model'), 'Existing sessions must refresh models from a newly connected provider');
  const reopened = await createZyraRuntime({ authPath, modelsPath, legacyPiAuthPath, providerConfigPath: customFile });
  assert.ok(reopened.modelRegistry.getAvailable().some(model => model.provider === 'custom-fixture' && model.id === 'fixture-model'));
  assert.equal((await listModelProviders({ file: customFile, authPath }))[0].verified, true, 'Provider listing reads Zyra credentials without creating a Pi runtime');
  await disconnectModelProvider('custom-fixture', { file: customFile, authPath });
  await existing.modelRegistry.refresh({ allowNetwork: false });
  assert.ok(!existing.modelRegistry.getAvailable().some(model => model.provider === 'custom-fixture'), 'Existing sessions must observe credential removal');
  const nativeFile = path.join(root, 'native-providers.json');
  catalogIds = ['native-fixture-model'];
  const nativeConnection = await connectModelProvider({ provider: 'custom', name: 'Native Fixture', baseUrl: 'https://example.com/v1', model: 'native-fixture-model', apiKey: 'native-fixture-key' }, { file: nativeFile, authPath, fetch });
  const nativeSaved = JSON.parse(await readFile(nativeFile, 'utf8'))[nativeConnection.provider];
  assert.equal(Object.hasOwn(nativeSaved.config.models[0], 'cost'), false, 'Unknown model prices stay unset when no runtime metadata is provided');
  assert.equal((await listModelProviders({ file: nativeFile, authPath }))[0].verified, true);
  await disconnectModelProvider(nativeConnection.provider, { file: nativeFile, authPath });
  assert.equal((await listModelProviders({ file: nativeFile, authPath })).length, 0);
  const removed = await createZyraRuntime({ authPath, modelsPath, legacyPiAuthPath, providerConfigPath: customFile });
 assert.ok(!removed.modelRegistry.getAvailable().some(model => model.provider === 'custom-fixture'));
 await assert.rejects(disconnectModelProvider('openai-codex', { file: customFile, runtime: removed }));
 const damaged = path.join(root, 'damaged.json');
 await writeFile(damaged, 'null');
 const requestCount = requests.length;
 await assert.rejects(connectModelProvider({ provider: 'anthropic', apiKey: 'test-key-only' }, { file: damaged, runtime, fetch }), /could not be read/);
 assert.equal(requests.length, requestCount, 'Damaged metadata must be detected before verification or credential changes');
 assert.doesNotThrow(() => registerSavedProviders(runtime.modelRegistry, damaged));
 console.log('Provider verification, formats, persistence and failure isolation passed.');
} catch (error) {
 testError = error;
 throw error;
} finally {
 try { await rm(root, { recursive: true, force: true }); }
 catch (cleanupError) {
  if (!testError) throw cleanupError;
  console.error('Provider test cleanup failed after the primary error:', cleanupError);
 }
}
