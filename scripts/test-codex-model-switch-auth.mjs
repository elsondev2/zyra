import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZyraCredentialStore } from '../src/zyra-auth-store.mjs';
import { ModelRuntime } from '../src/runtime/engine/src/core/model-runtime.js';
import { ModelRegistry } from '../src/runtime/engine/src/core/model-registry.js';
import { setModel } from '../src/zyra-sdk.mjs';

const root = await mkdtemp(join(tmpdir(), 'zyra-codex-model-switch-'));
const previousState = process.env.ZYRA_STATE_DIR;
process.env.ZYRA_STATE_DIR = root;
try {
    const authPath = join(root, 'credentials', 'auth.json');
    const first = new ZyraCredentialStore({ authPath }), second = new ZyraCredentialStore({ authPath });
    await first.modify('openai-codex', async () => ({ type: 'oauth', access: 'fixture-expired', refresh: 'fixture-refresh', expires: Date.now() - 1000 }));
    let refreshes = 0;
    const fresh = { type: 'oauth', access: 'fixture-fresh', refresh: 'fixture-rotated', expires: Date.now() + 3600000 };
    const oauth = { refresh: async () => { refreshes++; await new Promise(resolve => setTimeout(resolve, 40)); return fresh; }, toAuth: credential => ({ apiKey: credential.access }) };
    const runtimes = await Promise.all([first, second].map(credentials => ModelRuntime.create({ credentials, modelsPath: null, refreshOnCreate: false, allowModelNetwork: false })));
    const original = runtimes[0].getProvider('openai-codex');
    const base = original.getModels()[0];
    const models = ['gpt-6.1-sol', 'gpt-6-astra'].map(id => ({ ...base, id, name: id, reasoning: true }));
    for (const runtime of runtimes) runtime.registerNativeProvider({ ...original, auth: { oauth }, getModels: () => models });
    // Two real runtime callers observe the old token; the second lock holder must
    // treat the first caller's refresh as a no-op, not remove subscription auth.
    await Promise.all(runtimes.map(runtime => runtime.getAuth(models[0])));
    const session = { modelRegistry: new ModelRegistry(runtimes[0]), model: models[0], setModel: async function(model) { this.model = model; }, setThinkingLevel: () => {} };
    const selected = await setModel({ session, project: join(root, 'project'), thinkingState: { value: 'high' } }, 'openai-codex/gpt-6-astra', { skipAvailabilityCheck: true });
    assert.equal(selected.id, 'gpt-6-astra', 'Astra remains selectable after concurrent subscription refresh');
    assert.equal(session.model.id, 'gpt-6-astra');
    assert.equal(refreshes, 1);
    assert.deepEqual(second.read('openai-codex'), fresh);
    await second.delete('openai-codex');
    await assert.rejects(setModel({ session, project: join(root, 'project'), thinkingState: { value: 'high' } }, 'openai-codex/gpt-6.1-sol', { skipAvailabilityCheck: true }), /not found or not authenticated/, 'a genuine disconnect must still prevent a different model selection');
    assert.equal(session.model.id, 'gpt-6-astra', 'failed model changes preserve the current selection');
    console.log('Codex model switching: Sol to Astra after real concurrent refresh, plus genuine-disconnect rejection and selection preservation passed.');
} finally {
    if (previousState === undefined) delete process.env.ZYRA_STATE_DIR; else process.env.ZYRA_STATE_DIR = previousState;
    await rm(root, { recursive: true, force: true });
}
