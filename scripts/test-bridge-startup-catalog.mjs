import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { isolateBridgeEnvironment, fixtureModel } from './fixtures/agent-server-bridge-env.mjs';

const directory = mkdtempSync(join(tmpdir(), 'zyra-startup-catalog-'));
const isolation = isolateBridgeEnvironment(directory);
const project = join(directory, 'project');
mkdirSync(project, { recursive: true });
const pendingFetches = new Set();
let creation;
let runtime;
let deadline;
try {
    const sdk = await import('../src/zyra-sdk.mjs');
    // Warm imports without network access. The regression concerns discovery in
    // the real attachment path, not module-loader speed on the test machine.
    await sdk.warmupZyraRuntime({ skipAvailability: true });
    await sdk.prepareZyraSessionRuntime();
    const authPath = join(process.env.ZYRA_STATE_DIR, 'credentials', 'auth.json');
    const credentials = JSON.parse(readFileSync(authPath, 'utf8'));
    credentials.openai = { type: 'api_key', key: 'offline-startup-catalog-fixture' };
    writeFileSync(authPath, JSON.stringify(credentials));
    process.env.ZYRA_OFFLINE = '0';
    const { syncOpenAIModelCatalog } = await import('../src/openai-model-catalog.mjs');
    await syncOpenAIModelCatalog({
        authPath, forceRefresh: true,
        authStorage: { hasAuth: provider => provider === 'openai', getApiKey: async () => credentials.openai.key },
        pricingFetchImpl: async () => { throw new Error('Synthetic pricing unavailable'); },
        fetchImpl: async url => ({ ok: true, json: async () => url.includes('api.openai.com')
            ? { data: [{ id: 'gpt-startup-fixture' }] }
            : { models: [{ slug: 'gpt-startup-fixture', visibility: 'list', supported_in_api: true }] } }),
    });
    let networkCalls = 0;
    globalThis.fetch = (_url, options = {}) => {
        networkCalls += 1;
        return new Promise((_, reject) => {
            const abort = () => { pendingFetches.delete(abort); reject(options.signal?.reason || new Error('Synthetic request cancelled')); };
            pendingFetches.add(abort);
            if (options.signal?.aborted) abort();
            else options.signal?.addEventListener('abort', abort, { once: true });
        });
    };
    const started = performance.now();
    creation = sdk.createZyraSession({ project, noSession: true, memoryEnabled: false, model: fixtureModel,
        skipMemoryStartup: true, skipModelAvailability: true });
    runtime = await Promise.race([creation, new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error('Fast chat attachment waited for remote catalog discovery')), 8_000);
    })]);
    clearTimeout(deadline);
    assert.equal(networkCalls, 0, 'fast attachment reads saved capabilities and prices without fetching a catalog');
    assert.equal(runtime.session.model.id, 'bridge-reasoning', 'the requested chat model survives cached startup');
    assert.ok(performance.now() - started < 8_000);
    await assert.rejects(sdk.warmupZyraRuntime({ forceRefresh: true, skipAvailability: true, catalogRefreshTimeoutMs: 200 }), /timed out|timeout/i,
        'model refresh has its own total deadline instead of exhausting the worker attachment deadline');
    const providerDirectory = join(process.env.ZYRA_DATA_ROOT, '.zyra');
    mkdirSync(providerDirectory, { recursive: true });
    writeFileSync(join(providerDirectory, 'providers.json'), JSON.stringify({ 'opencode-harness': {
        label: 'Synthetic harness', model: 'opencode-harness/fixture-model',
        config: { models: [{ id: 'fixture-model', name: 'Synthetic model' }] },
    } }));
    let finishDetection;
    const beforeConcurrentRefresh = networkCalls;
    await assert.rejects(sdk.listAvailableModels({ forceRefresh: true, skipAvailability: true, catalogRefreshTimeoutMs: 200,
        harness: { findExecutable: () => new Promise(resolve => { finishDetection = resolve; }) },
    }), /timed out|timeout/i);
    assert.ok(networkCalls > beforeConcurrentRefresh, 'OpenAI discovery starts while saved-provider detection is still pending');
    finishDetection(null);
    isolation.assertOffline();
    console.log('Real SDK fast attachment bypasses stalled discovery; model warmup has a bounded refresh deadline.');
} finally {
    clearTimeout(deadline);
    for (const abort of pendingFetches) abort();
    const lateRuntime = creation ? await creation.catch(() => null) : null;
    await (runtime || lateRuntime)?.session.dispose?.();
    isolation.restore();
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-startup-catalog-')) throw new Error('Unexpected startup catalog cleanup path');
    rmSync(directory, { recursive: true, force: true });
}
