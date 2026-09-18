import type { AssistantAccountOverview, AssistantRateLimitWindow } from '@shared/assistant/contracts'

function windowLabel(window: AssistantRateLimitWindow): string {
    const minutes = window.windowDurationMins
    if (!minutes || minutes <= 0) return 'Current window'
    if (minutes % 1440 === 0) return `${minutes / 1440}d`
    if (minutes % 60 === 0) return `${minutes / 60}h`
    return `${minutes}m`
}

export function extensionQuotaText(overview: AssistantAccountOverview): string {
    if (overview.requiresOpenaiAuth) return 'ChatGPT not connected'
    if (overview.usageError) return 'Quota unavailable'
    const byId = Object.values(overview.rateLimitsByLimitId || {})
    const buckets = byId.length ? byId : overview.rateLimits ? [overview.rateLimits] : []
    const values = buckets.flatMap(bucket => [bucket.primary, bucket.secondary]
        .filter((window): window is AssistantRateLimitWindow => Boolean(window && Number.isFinite(window.remainingPercent)))
        .map(window => `${buckets.length > 1 ? `${bucket.limitName || bucket.limitId || 'Codex'} ` : ''}${windowLabel(window)}: ${Math.round(Math.max(0, Math.min(100, window.remainingPercent)))}% left`))
    return values.length ? values.join(' · ') : 'Quota unavailable'
}
