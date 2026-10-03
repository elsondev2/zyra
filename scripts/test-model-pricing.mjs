import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { estimateModelCost, getModelPricing, getPricingSnapshot, installPricingSnapshot } from '../src/model-pricing/index.mjs';
import { parseOpenAIPricing } from '../src/model-pricing/parser.mjs';
import { refreshModelPricing } from '../src/model-pricing/refresh.mjs';
import { assistantMessageCost } from '../src/model-pricing/message-cost.mjs';
import { calculateSessionUsage } from '../src/zyra-sdk.mjs';
import { priceRecord, aggregateUsage, usageRecord } from '../mobile/gateway/src/usage-records.mjs';
import { normalizeCanonicalMessageSourceId } from '../src/message-identity.mjs';
import { renderStatusLine } from '../src/status-line.mjs';

const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-12, `${a} != ${b}`);
const separate = { input: 100000, cacheRead: 20000, cacheWrite: 5000, output: 3000, reasoning: 2000 };
const inclusive = { inputTokens: 125000, cachedInputTokens: 20000, cacheWriteTokens: 5000, outputTokens: 3000, inputIncludesCachedTokens: true };
const standard = estimateModelCost('gpt-6.1-sol', separate);
near(standard.total, .2445);
near(estimateModelCost('openai/gpt-6.1-sol', inclusive).total, standard.total);
near(estimateModelCost('openai-codex/gpt-6.1-sol', separate, 'priority').total, .489);
near(estimateModelCost('gpt-6.1-sol', separate, 'flex').total, .12225);
near(estimateModelCost('gpt-6.1-sol', { ...separate, input: 272001 }).total, 1.162004);
near(estimateModelCost('gpt-6.1-sol', { input: 272000, output: 1 }).total, .54401);
assert.equal(estimateModelCost('gpt-new-release', separate), null);
assert.equal(estimateModelCost('other-provider/gpt-6.1-sol', separate), null);
assert.equal(estimateModelCost('gpt-5.5', separate), null, 'undocumented cache writes cannot be borrowed from another model');
assert.equal(estimateModelCost('gpt-5.5', { input: 300000, output: 1000 }, 'priority'), null, 'missing long-context priority pricing stays unknown');
assert.equal(estimateModelCost('gpt-6.1-sol', separate, 'scale'), null);
assert.equal(estimateModelCost('gpt-6.1-sol', { ...inclusive, inputTokens: 1 }), null);
assert.equal(getModelPricing('gpt-6.1-sol-preview'), null, 'opaque suffixes are not price aliases');
assert.ok(getModelPricing('gpt-5.4-2026-03-05'), 'dated snapshots may use their published family rates');

const message = { role: 'assistant', provider: 'openai-codex', model: 'gpt-6.1-sol', usage: { ...separate, cost: { total: 0 } } };
near(assistantMessageCost(message).total, standard.total, 'old fake zero prices are corrected');
const pinned = { ...message, usage: { ...message.usage, cost: { ...standard, total: .5, pricingFetchedAt: '2026-09-29T00:00:00Z' } } };
near(assistantMessageCost(pinned).total, .5, 'recorded pricing versions keep historical per-response estimates');
const session = calculateSessionUsage({ getEntries: () => [{ type: 'message', message }, { type: 'message', message: { ...message, model: 'gpt-unknown' } }] });
near(session.cost, standard.total); assert.equal(session.costComplete, false);
const completed = { ...message, timestamp: 12345, responseId: 'synthetic-response' };
const pendingTotal = calculateSessionUsage({ getEntries: () => [] }, completed);
near(pendingTotal.cost, standard.total); assert.equal(pendingTotal.costComplete, true);
near(calculateSessionUsage({ getEntries: () => [{ type: 'message', message: completed }] }, completed).cost, standard.total, 'completion and persistence count the same response once');
const statusRuntime = { project: '/synthetic', thinkingState: { value: 'medium' }, session: {
  model: { provider: 'openai-codex', id: 'gpt-6.1-sol', contextWindow: 400000 },
  modelRegistry: { isUsingOAuth: () => true },
  sessionManager: { getEntries: () => [{ type: 'message', message: completed }], getCwd: () => '/synthetic' },
  getContextUsage: () => ({ tokens: 1000, contextWindow: 400000, percent: .25 }),
} };
assert.ok(renderStatusLine(statusRuntime, 160).includes(`~$${standard.total.toFixed(3)} sub`), 'the actual TUI footer uses the shared per-response cost');
const row = usageRecord('zyra', { type: 'message', id: 'synthetic', timestamp: new Date().toISOString(), message }, { cwd: '/synthetic', session: 'synthetic' });
near(row.reportedCostUsd, standard.total);
near(priceRecord(row), standard.total);
near(aggregateUsage([row]).totals.estimatedCostUsd, standard.total);
assert.equal(aggregateUsage([row]).totals.reportedResponses, 0, 'API-equivalent estimates are not billed spend');

const baseline = getPricingSnapshot();
const header = '| Model | Short context input | Short context cached input | Short context cache writes | Short context output | Long context input | Long context cached input | Long context cache writes | Long context output |';
const table = '### Standard pricing data\n'+header+'\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'+Array.from({ length: 10 }, (_, i) => `| gpt-synthetic-${i} | $3.00 | $0.30 | $3.75 | $8.00 | $9.00 | $0.90 | $11.25 | $20.00 |`).join('\n');
assert.equal(parseOpenAIPricing(table).models['gpt-synthetic-0'].tiers.standard.long.input, 9);
assert.throws(() => parseOpenAIPricing(table.replace('$3.00', '$oops')), /Invalid/);
assert.throws(() => parseOpenAIPricing('login page'), /Invalid/);
const directory = await mkdtemp(join(tmpdir(), 'zyra-pricing-'));
try {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++; assert.equal(url, 'https://developers.openai.com/api/docs/pricing.md');
    assert.equal(init.headers.Authorization, undefined, 'public pricing never receives user credentials');
    return { ok: true, text: async () => table };
  };
  await refreshModelPricing({ directory, forceRefresh: true, fetchImpl });
  assert.equal(calls, 1);
  assert.ok(JSON.parse(await readFile(join(directory, 'openai-pricing.json'))).models['gpt-synthetic-9']);
  await refreshModelPricing({ directory, fetchImpl }); assert.equal(calls, 1, 'warm pricing cache');
  const fallback = await refreshModelPricing({ directory, forceRefresh: true, fetchImpl: async () => { throw new Error('offline'); } });
  assert.ok(fallback.models['gpt-synthetic-9']);
  const offline = await refreshModelPricing({ directory, forceRefresh: true, env: { ZYRA_OFFLINE: '1' }, fetchImpl });
  assert.ok(offline.models['gpt-synthetic-9']); assert.equal(calls, 1);
  const incomplete = await refreshModelPricing({ directory, forceRefresh: true, fetchImpl: async () => ({ ok: true, text: async () => 'login' }) });
  assert.ok(incomplete.models['gpt-synthetic-9']);
} finally { installPricingSnapshot(baseline); await rm(directory, { recursive: true, force: true }); }
assert.equal(normalizeCanonicalMessageSourceId('pi-message:assistant:123'), 'zyra-message:assistant:123');
assert.equal(normalizeCanonicalMessageSourceId('provider-tool-pi-123'), 'provider-tool-pi-123');
console.log('Model pricing: official table refresh/cache, token categories, tiers, per-response costs, unknowns, and mobile/runtime parity: ok');
