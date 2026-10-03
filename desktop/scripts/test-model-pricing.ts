import assert from 'node:assert/strict'
import { estimateAssistantTurnCostUsd, getAssistantModelPricing, installModelCatalogPricing } from '../src/shared/assistant/pricing'
import { buildUsageSummary } from '../src/shared/assistant/usage-summary'
import { estimateModelCost, getModelPricing, getPricingSnapshot } from '../../src/model-pricing/index.mjs'
import { calculateCost } from '../../src/runtime/providers/src/models.js'
import { priceRecord } from '../../mobile/gateway/src/usage-records.mjs'
import { projectSessionDetails } from '../../mobile/gateway/src/session-details.mjs'

const near = (a: number | null, b: number) => assert.ok(a != null && Math.abs(a-b) < 1e-12, `${a} != ${b}`)
const model = 'openai-codex/gpt-6.1-sol'
const usage = { inputTokens: 100000, cachedInputTokens: 20000, cacheWriteTokens: 5000, outputTokens: 3000, inputIncludesCachedTokens: false }
const providerUsage = { input: 100000, cacheRead: 20000, cacheWrite: 5000, output: 3000, totalTokens: 128000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
const runtimeModel = { id: 'gpt-6.1-sol', provider: 'openai-codex', cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } } as Parameters<typeof calculateCost>[0]
const expected = estimateModelCost(model, providerUsage)!.total
near(estimateAssistantTurnCostUsd(model, usage), expected)
near(calculateCost(runtimeModel, providerUsage).total, expected)
near(priceRecord({ model, ...usage }), expected)
near(calculateCost(runtimeModel, providerUsage, 'priority').total, expected*2)
near(estimateAssistantTurnCostUsd(model, usage, 'fast'), expected*2)
const turn = { id: 'synthetic', model, requestedAt: '2026-09-30T00:00:00Z', usage }
const summary = buildUsageSummary([turn], { days: 7 }, new Date('2026-09-30T12:00:00Z'))
near(summary.totals.costUsd, expected)
assert.equal(summary.totals.tokens, 128000)
near(projectSessionDetails({ model, turns: [turn] }).usage.estimatedCostUsd, expected)
const unpriced = buildUsageSummary([{ ...turn, model: 'openai/new-model', usage: { ...usage, costUsd: 0 } }], {}, new Date('2026-09-30T12:00:00Z'))
assert.equal(unpriced.totals.pricedTurns, 0)
assert.equal(estimateAssistantTurnCostUsd(model, { ...usage, inputIncludesCachedTokens: true, inputTokens: 125000 }), expected)
assert.equal(getAssistantModelPricing(model)?.cacheWriteUsdPerMillion, 2.5)
const multiResponseUsage = { inputTokens: 300000, outputTokens: 0, inputIncludesCachedTokens: false, responseCount: 2, costUsd: .6, costSource: 'api-equivalent' as const }
near(estimateAssistantTurnCostUsd(model, multiResponseUsage), .6)
assert.equal(estimateAssistantTurnCostUsd(model, { ...multiResponseUsage, costUsd: null }), null, 'an aggregate cannot reconstruct the request-wise context threshold')
near(projectSessionDetails({ model, turns: [{ ...turn, usage: multiResponseUsage }] }).usage.estimatedCostUsd, .6)
const rate = getModelPricing(model)!
installModelCatalogPricing([{ id: 'openai/gpt-synthetic-release', pricing: rate, pricingFetchedAt: getPricingSnapshot().fetchedAt }])
near(estimateAssistantTurnCostUsd('openai/gpt-synthetic-release', usage), expected)
console.log('Cross-surface model pricing: provider transport, desktop usage/details, mobile account/session, and catalog metadata parity: ok')
