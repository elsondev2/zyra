import type {
    AssistantAuthMode,
    AssistantSessionTurnUsageEntry,
    AssistantTurnUsage
} from './contracts'

type AssistantModelPricing = {
    inputUsdPerMillion: number
    cachedInputUsdPerMillion: number
    outputUsdPerMillion: number
    fastUsdMultiplier?: number
}

type AssistantPricingServiceTier = AssistantSessionTurnUsageEntry['serviceTier'] | null | undefined

export type AssistantSessionCostEstimate = {
    totalUsd: number | null
    meteredTurnCount: number
    pricedTurnCount: number
    unpricedTurnCount: number
}

const MODEL_PRICING: Record<string, AssistantModelPricing> = {
    'gpt-5.5': {
        inputUsdPerMillion: 5,
        cachedInputUsdPerMillion: 0.5,
        outputUsdPerMillion: 30,
        fastUsdMultiplier: 2.5
    },
    'gpt-5.4': {
        inputUsdPerMillion: 2.5,
        cachedInputUsdPerMillion: 0.25,
        outputUsdPerMillion: 15
    },
    'gpt-5.4-mini': {
        inputUsdPerMillion: 0.75,
        cachedInputUsdPerMillion: 0.075,
        outputUsdPerMillion: 4.5
    },
    'gpt-5.3-codex': {
        inputUsdPerMillion: 1.75,
        cachedInputUsdPerMillion: 0.175,
        outputUsdPerMillion: 14
    },
    'gpt-5.2-codex': {
        inputUsdPerMillion: 1.75,
        cachedInputUsdPerMillion: 0.175,
        outputUsdPerMillion: 14
    },
    'gpt-5.2': {
        inputUsdPerMillion: 1.75,
        cachedInputUsdPerMillion: 0.175,
        outputUsdPerMillion: 14
    },
    'gpt-5.1': {
        inputUsdPerMillion: 1.25,
        cachedInputUsdPerMillion: 0.125,
        outputUsdPerMillion: 10
    },
    'gpt-5.1-codex': {
        inputUsdPerMillion: 1.25,
        cachedInputUsdPerMillion: 0.125,
        outputUsdPerMillion: 10
    },
    'gpt-5.1-codex-max': {
        inputUsdPerMillion: 1.25,
        cachedInputUsdPerMillion: 0.125,
        outputUsdPerMillion: 10
    },
    'gpt-5.1-codex-mini': {
        inputUsdPerMillion: 0.25,
        cachedInputUsdPerMillion: 0.025,
        outputUsdPerMillion: 2
    }
}

function normalizePricingModel(model: string): string {
    const trimmed = String(model || '').trim().toLowerCase()
    if (!trimmed) return ''
    const withoutProvider = trimmed.includes('/') ? trimmed.split('/').pop() || trimmed : trimmed
    const withoutMetadata = withoutProvider.split(/[:@]/)[0] || withoutProvider
    return withoutMetadata
}

function getUsageNumber(value: number | null | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function getServiceTierMultiplier(pricing: AssistantModelPricing, serviceTier: AssistantPricingServiceTier): number {
    if (serviceTier === 'flex') return 0.5
    if (serviceTier === 'fast') return pricing.fastUsdMultiplier ?? 2
    return 1
}

export function getAssistantModelPricing(model: string): AssistantModelPricing | null {
    return MODEL_PRICING[normalizePricingModel(model)] || null
}

export function estimateAssistantTurnCostUsd(
    model: string,
    usage: AssistantTurnUsage | null | undefined,
    serviceTier: AssistantPricingServiceTier = null
): number | null {
    if (!usage) return null
    const pricing = getAssistantModelPricing(model)
    if (!pricing) return null

    const inputTokens = getUsageNumber(usage.inputTokens)
    const cachedInputTokens = Math.min(getUsageNumber(usage.cachedInputTokens), inputTokens)
    const uncachedInputTokens = Math.max(inputTokens - cachedInputTokens, 0)
    const outputTokens = getUsageNumber(usage.outputTokens)

    if (inputTokens === 0 && outputTokens === 0) return null

    const subtotal = (uncachedInputTokens / 1_000_000) * pricing.inputUsdPerMillion
        + (cachedInputTokens / 1_000_000) * pricing.cachedInputUsdPerMillion
        + (outputTokens / 1_000_000) * pricing.outputUsdPerMillion

    return subtotal * getServiceTierMultiplier(pricing, serviceTier)
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
