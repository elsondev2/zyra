import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createZyraCredentialAuthStorage } from '../src/zyra-auth-store.mjs';
import { createZyraRuntime } from '../src/zyra-runtime.mjs';
import { listAvailableModels, registerZyraRuntimeModels, setModel, getZyraThinkingLevel } from '../src/zyra-sdk.mjs';

const root = await mkdtemp(join(tmpdir(), 'zyra-model-runtime-'));
try {
  const options = { stateDirectory: root, authPath: join(root, 'credentials', 'auth.json'), providerConfigPath: join(root, 'providers.json'), loadSavedProviders: false, env: {} };
  const auth = await createZyraCredentialAuthStorage(options);
  await auth.loginApiKey('openai', 'synthetic-test-key');
  const values = await listAvailableModels({ ...options, forceRefresh: true, skipAvailability: true,
    fetchImpl: async url => ({ ok: true, json: async () => url.includes('api.openai.com')
      ? { data: [{ id: 'future-unlisted-model' }] }
      : { models: [{ slug: 'future-unlisted-model', visibility: 'list', supported_in_api: true, display_name: 'Future model', input_modalities: ['text', 'image'], context_window: 333000, supported_reasoning_levels: [{ effort: 'high' }, { effort: 'max' }] }] } }),
  });
  assert.deepEqual(values.filter(model => model.id.startsWith('openai/')).map(model => model.id), ['openai/future-unlisted-model']);
  const runtime = await createZyraRuntime(options);
  registerZyraRuntimeModels(runtime.modelRegistry);
  assert.equal(runtime.modelRegistry.find('openai', 'gpt-5.6-sol'), undefined, 'Zyra overrides cannot resurrect a model removed by the provider.');
  assert.equal(runtime.modelRegistry.find('openai', 'future-unlisted-model').contextWindow, 333000);
  const session = { modelRegistry: runtime.modelRegistry, model: null, setModel: async function(model) { this.model = model; }, setThinkingLevel: () => {} };
  const selection = { session, project: join(root, 'project'), thinkingState: { value: 'max' } };
  await setModel(selection, 'openai/future-unlisted-model', { skipAvailabilityCheck: true });
  assert.equal(session.model.id, 'future-unlisted-model');
  assert.equal(getZyraThinkingLevel(selection), 'max', 'Endpoint capabilities survive native registry composition and model selection.');
  const offline = await listAvailableModels({ ...options, env: { ZYRA_OFFLINE: '1' }, forceRefresh: true, skipAvailability: true, fetchImpl: async () => { throw new Error('Offline discovery must not contact a provider.'); } });
  assert.ok(offline.some(model => model.id === 'openai/future-unlisted-model'), 'Offline discovery keeps the account-specific saved catalog.');
  console.log('OpenAI model runtime integration: new endpoint models are selectable without built-in definitions: ok');
} finally { await rm(root, { recursive: true, force: true }); }
