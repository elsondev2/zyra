import type {
    AssistantAccountOverview,
    AssistantRateLimitSnapshot,
    AssistantRateLimitWindow
} from '@shared/assistant/contracts'

export type UsageMode = 'remaining' | 'used'

export type RateLimitCard = {
    id: string
    bucketLabel: string
    durationLabel: string
    percent: number
    percentLabel: string
    resetSummary: string
    resetAbsolute: string
    creditLabel: string | null
    planLabel: string | null
    bucketOrder: number
    durationOrder: number
    resetOrder: number
}

export function buildRateLimitCards(
    overview: AssistantAccountOverview | null,
    mode: UsageMode
): RateLimitCard[] {
    if (!overview) return []

    const buckets = normalizeBuckets(overview)
    const cards = buckets.flatMap((bucket, bucketIndex) => {
        const windows = [
            bucket.primary ? createRateLimitCard(bucket, bucket.primary, mode, bucketIndex) : null,
            bucket.secondary ? createRateLimitCard(bucket, bucket.secondary, mode, bucketIndex) : null
        ].filter((entry): entry is RateLimitCard => Boolean(entry))

        return windows.sort((left, right) =>
            left.durationOrder - right.durationOrder
            || left.resetOrder - right.resetOrder
            || left.bucketLabel.localeCompare(right.bucketLabel)
        )
    })

    return cards.sort((left, right) =>
        left.bucketOrder - right.bucketOrder
        || left.durationOrder - right.durationOrder
        || left.resetOrder - right.resetOrder
        || left.id.localeCompare(right.id)
    )
}

export function findBalanceLabel(overview: AssistantAccountOverview | null): string {
    const buckets = overview ? normalizeBuckets(overview) : []
    for (const bucket of buckets) {
        if (bucket.credits) return formatCredits(bucket.credits)
    }
    return 'Unavailable'
}

export function formatPlan(planType: string | null | undefined): string {
    if (!planType) return 'Unknown'
    return planType.charAt(0).toUpperCase() + planType.slice(1)
}

export function formatFetchedAt(value: string | null | undefined): string {
    if (!value) return 'Not synced yet'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

function normalizeBuckets(overview: AssistantAccountOverview): AssistantRateLimitSnapshot[] {
    const buckets = Object.values(overview.rateLimitsByLimitId)
    const stableBuckets = buckets.length > 0 ? buckets : overview.rateLimits ? [overview.rateLimits] : []

    return stableBuckets.slice().sort((left, right) =>
        getBucketSortKey(left).localeCompare(getBucketSortKey(right))
    )
}

function createRateLimitCard(
    bucket: AssistantRateLimitSnapshot,
    window: AssistantRateLimitWindow,
    mode: UsageMode,
    bucketOrder: number
): RateLimitCard {
    const durationOrder = window.windowDurationMins ?? Number.MAX_SAFE_INTEGER
    const percent = clampPercent(mode === 'remaining' ? window.remainingPercent : window.usedPercent)
    const bucketLabel = bucket.limitName || bucket.limitId || 'Codex'
    const durationLabel = formatWindowTitle(window.windowDurationMins)
    const resetSummary = formatResetSummary(window.resetsAt)
    const resetAbsolute = formatResetAbsolute(window.resetsAt)
    const percentLabel = `${Math.round(percent)}% ${mode}`

    return {
        id: `${bucket.limitId || bucketLabel}-${durationOrder}-${window.resetsAt ?? 'none'}`,
        bucketLabel,
        durationLabel,
        percent,
        percentLabel,
        resetSummary,
        resetAbsolute,
        creditLabel: bucket.credits ? formatCredits(bucket.credits) : null,
        planLabel: bucket.planType ? `Plan ${formatPlan(bucket.planType)}` : null,
        bucketOrder,
        durationOrder,
        resetOrder: window.resetsAt ?? Number.MAX_SAFE_INTEGER
    }
}

function getBucketSortKey(bucket: AssistantRateLimitSnapshot): string {
    const limitId = (bucket.limitId || '').toLowerCase()
    const limitName = (bucket.limitName || '').toLowerCase()
    const priority = limitId === 'codex' || limitName === 'codex' ? '0' : '1'
    return `${priority}:${limitName}:${limitId}`
}

function clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(100, value))
}

function formatWindowTitle(value: number | null): string {
    if (value == null || !Number.isFinite(value) || value <= 0) return 'Usage limit'
    if (value === 10080) return 'Weekly usage limit'
    if (value === 1440) return 'Daily usage limit'
    if (value < 60) return `${value} minute usage limit`
    if (value % 1440 === 0) {
        const days = value / 1440
        return `${days} day usage limit`
    }
    if (value % 60 === 0) {
        const hours = value / 60
        return `${hours} hour usage limit`
    }
    return `${Math.floor(value / 60)} hour usage limit`
}

function formatResetSummary(timestamp: number | null): string {
    const date = normalizeTimestamp(timestamp)
    if (!date) return 'Reset time unavailable'

    const diffMs = date.getTime() - Date.now()
    const diffMinutes = Math.round(diffMs / 60000)
    if (diffMinutes <= 1) return 'Resets in <1 min'
    if (diffMinutes < 60) return `Resets in ${diffMinutes} min`

    const diffHours = Math.round(diffMinutes / 60)
    if (diffHours < 24) return `Resets in ${diffHours} hr`

    return `Resets ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
}

function formatResetAbsolute(timestamp: number | null): string {
    const date = normalizeTimestamp(timestamp)
    if (!date) return 'Reset unknown'

    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    })
}

function normalizeTimestamp(value: number | null): Date | null {
    if (value == null || !Number.isFinite(value)) return null
    const milliseconds = value > 10_000_000_000 ? value : value * 1000
    const date = new Date(milliseconds)
    return Number.isNaN(date.getTime()) ? null : date
}

function formatCredits(credits: AssistantRateLimitSnapshot['credits'] | null): string {
    if (!credits) return 'Credits unavailable'
    if (credits.unlimited) return 'Unlimited credits'
    if (!credits.hasCredits) return 'No credits'
    return credits.balance ? `Balance ${credits.balance}` : 'Credits available'
}
