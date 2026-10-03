import type { AssistantAuthMode, AssistantSessionTurnUsageEntry, AssistantTurnUsage } from './contracts'
import { estimateModelCost, getModelPricing } from '../../../../src/model-pricing/index.mjs'
export { installModelCatalogPricing } from '../../../../src/model-pricing/index.mjs'
type AssistantPricingServiceTier = AssistantSessionTurnUsageEntry['serviceTier'] | null | undefined
export type AssistantSessionCostEstimate = { totalUsd: number | null; meteredTurnCount: number; pricedTurnCount: number; unpricedTurnCount: number }
const getUsageNumber = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
export function getAssistantModelPricing(model: string) {
    const rates = getModelPricing(model)?.tiers.standard?.short
    return rates ? { inputUsdPerMillion: rates.input, cachedInputUsdPerMillion: rates.cacheRead, cacheWriteUsdPerMillion: rates.cacheWrite, outputUsdPerMillion: rates.output } : null
}
export function estimateAssistantTurnCostUsd(model: string, usage: AssistantTurnUsage | null | undefined, serviceTier: AssistantPricingServiceTier = null): number | null {
    if (!usage || ![usage.inputTokens, usage.cachedInputTokens, usage.cacheWriteTokens, usage.outputTokens].some(value => getUsageNumber(value) > 0)) return null
    // A turn may contain several provider requests. Adding their input first
    // can invent a long-context charge that none of those requests incurred.
    if ((usage.responseCount ?? 1) > 1) return usage.costSource === 'api-equivalent' && typeof usage.costUsd === 'number' ? usage.costUsd : null
    return estimateModelCost(model, usage, usage.pricingServiceTier ?? serviceTier)?.total ?? null
}

export function estimateAssistantSessionCostUsd(turns: AssistantSessionTurnUsageEntry[]): AssistantSessionCostEstimate {
    let totalUsd = 0
    let meteredTurnCount = 0
    let pricedTurnCount = 0
    let unpricedTurnCount = 0

    for (const turn of turns) {
        if (!turn.usage) continue
        const hasMeteredTokens = getUsageNumber(turn.usage.inputTokens) > 0 || getUsageNumber(turn.usage.outputTokens) > 0
        if (!hasMeteredTokens) continue
        meteredTurnCount += 1
        const turnCost = estimateAssistantTurnCostUsd(turn.model, turn.usage, turn.serviceTier)
        if (turnCost == null) {
            unpricedTurnCount += 1
            continue
        }
        pricedTurnCount += 1
        totalUsd += turnCost
    }

    return {
        totalUsd: pricedTurnCount > 0 ? totalUsd : null,
        meteredTurnCount,
        pricedTurnCount,
        unpricedTurnCount
    }
}

export function getAssistantCostLabel(authMode: AssistantAuthMode | null | undefined): string {
    return authMode === 'apikey' ? 'API cost' : 'Est. API cost'
}

export function formatAssistantUsd(amount: number | null | undefined): string {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'Unavailable'
    const magnitude = Math.abs(amount)
    const maximumFractionDigits = magnitude >= 1 ? 2 : magnitude >= 0.01 ? 4 : 6
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits
    }).format(amount)
}
