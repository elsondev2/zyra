import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const tools = readFileSync(new URL('../src/agents/tools.mjs', import.meta.url), 'utf8');
assert.match(tools, /case "models"/, 'the main agent can inspect delegation choices on demand');
const { readDelegationPreferences, saveDelegationPreferences } = await import('../src/agents/delegation-preferences.mjs');
const { buildDelegationModelOptions } = await import('../src/agents/delegation-model-options.mjs');
const dir = mkdtempSync(path.join(tmpdir(), 'zyra-delegation-'));
try {
 const file = path.join(dir, 'preferences.json');
 assert.deepEqual(readDelegationPreferences(file), { version: 1, preset: 'balanced', notes: '' });
 const saved = await saveDelegationPreferences({ preset: 'cost', notes: 'Use stronger reasoning for security reviews.' }, file);
 assert.equal(readDelegationPreferences(file).notes, saved.notes);
 await assert.rejects(saveDelegationPreferences({ preset: 'invalid', notes: '' }, file));
 await assert.rejects(saveDelegationPreferences({ preset: 'cost', notes: 'x'.repeat(4001) }, file));
 assert.equal(readDelegationPreferences(file).preset, 'cost');
 const item = (key, input, output, extra = {}) => ({ key, provider: key.split('/')[0], id: key.split('/')[1], name: key, eligible: true, authenticated: true, availability: 'available', contextWindow: 128000, reasoning: true, toolUse: true, model: { id: key.split('/')[1], provider: key.split('/')[0], reasoning: true, cost: { input, output, cacheRead: 0.1, cacheWrite: 0.2 } }, ...extra });
 const catalog = [item('openai-codex/gpt-5.6-sol', 5, 30), item('anthropic/efficient', 1, 3), item('custom-private/unknown', 0, 0), item('blocked/model', 0.1, 0.2, { eligible: false }), item('anonymous/model', 0.1, 0.2, { authenticated: false })];
 const result = buildDelegationModelOptions(catalog, saved, { limit: 3 });
 assert.equal(result.models[0].id, 'anthropic/efficient');
 assert.equal(result.models.length, 3);
 assert.equal(result.models.find(model => model.id === 'custom-private/unknown').estimatedApiCost, null, 'unknown rates are never advertised as free');
 assert.equal(result.models[1].estimatedApiCost.output, 30, 'subscription models use the same API-cost comparison');
 assert.equal(result.models[1].priceVerifiedAt, null, 'catalog estimates cannot claim a live billing verification date');
 assert.ok(result.guidance.includes(saved.notes));
 assert.ok(result.models[1].supportedEfforts.includes('high'));
 assert.ok(!JSON.stringify(result).includes('apiKey'));
 assert.equal(buildDelegationModelOptions(catalog, saved, { provider: 'anthropic' }).models.length, 1);
 const largeCatalog = Array.from({ length: 40 }, (_, index) => item(`fixture/model-${index}`, 1, 2, { name: 'x'.repeat(10000) }));
 const bounded = buildDelegationModelOptions(largeCatalog, saved, { limit: 1000 });
 assert.equal(bounded.models.length, 6); assert.ok(bounded.models.every(model => model.name.length === 120));
 assert.ok(JSON.stringify(bounded).length < 10000, 'large catalogs and remote display names cannot fill the main-agent context');
 assert.deepEqual(buildDelegationModelOptions([], saved).models, []);
 await saveDelegationPreferences({ notes: 'Updated guidance.' }, file);
 assert.equal(readDelegationPreferences(file).preset, 'cost', 'partial note updates preserve the current approach');
 const { AgentFleetController } = await import('../src/agents/runtime/fleet-controller.mjs');
 const rawModels = catalog.slice(0, 3).map(entry => ({ ...entry.model, name: entry.name, contextWindow: entry.contextWindow }));
 let currentModels = rawModels;
 const controller = new AgentFleetController({ project: dir, rootSession: { model: rawModels[0] },
   modelRegistry: { getAll: () => currentModels, getAvailable: async () => currentModels },
   modelCatalog: [], modelCatalogOptions: { availability: new Map(catalog.map(entry => [entry.key, { availability: 'available' }])) },
   readRoleModels: () => ({}), readDelegationPreferences: () => readDelegationPreferences(file),
   sessionFactory: {}, eventStore: { subscribe: () => () => {} }
 });
 const live = await controller.delegationModelOptions({ limit: 2 });
 assert.equal(live.models.length, 2); assert.ok(live.guidance.includes('Updated guidance.'));
 await saveDelegationPreferences({ preset: 'quality' }, file);
 currentModels = [rawModels[1]];
 const changed = await controller.delegationModelOptions();
 assert.equal(changed.preset, 'quality'); assert.equal(changed.models.length, 1);
 assert.equal(changed.models[0].id, 'anthropic/efficient', 'lookup refreshes authenticated registry state instead of retaining an old connection list');
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('Delegation preferences: isolated persistence, validation, bounded on-demand catalog, common API estimates and unknown-price handling: ok');
