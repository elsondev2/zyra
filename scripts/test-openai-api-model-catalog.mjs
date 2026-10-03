import assert from 'node:assert/strict';
import { listAccountOpenAIModelIds, retainAccountOpenAIModels } from '../src/openai-api-model-catalog.mjs';

const requested = [];
const response = { data: [{ id: 'gpt-6-astra' }, { id: 'gpt-5.6-sol' }, { id: 'text-embedding-3-large' }, { id: '' }] };
const ids = await listAccountOpenAIModelIds({
  authStorage: {
    hasAuth: (provider) => provider === 'openai',
    getApiKey: async () => 'test-key',
  },
  fetchImpl: async (url, init) => {
    requested.push({ url, init });
    return { ok: true, json: async () => response };
  },
});
assert.deepEqual([...ids].sort(), ['gpt-5.6-sol', 'gpt-6-astra', 'text-embedding-3-large']);
assert.equal(requested[0].url, 'https://api.openai.com/v1/models');
assert.equal(requested[0].init.headers.Authorization, 'Bearer test-key');
const models = [
  { id: 'openai/gpt-5.6-sol' }, { id: 'openai/gpt-5.5' },
  { id: 'openai/gpt-6-astra' }, { id: 'openai-codex/gpt-5.5' },
];
assert.deepEqual(retainAccountOpenAIModels(models, ids), [models[0], models[2], models[3]], 'Only the API-key group follows the account endpoint.');
assert.equal(await listAccountOpenAIModelIds({ authStorage: { hasAuth: () => false }, fetchImpl: () => { throw new Error('Should not fetch without a key.'); } }), null);
await assert.rejects(() => listAccountOpenAIModelIds({
  authStorage: { hasAuth: () => true, getApiKey: async () => 'test-key' },
  fetchImpl: async () => ({ ok: false, status: 503 }),
}), /HTTP 503/);
await assert.rejects(() => listAccountOpenAIModelIds({
  authStorage: { hasAuth: () => true, getApiKey: async () => 'test-key' },
  fetchImpl: async () => ({ ok: true, json: async () => ({ models: [] }) }),
}), /invalid model list/);
assert.deepEqual(retainAccountOpenAIModels(models, null), models, 'Without an API key, other model groups stay available.');
console.log('OpenAI account model catalog: endpoint IDs, filtering and failure handling: ok');
