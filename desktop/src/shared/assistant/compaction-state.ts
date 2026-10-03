import type { AssistantActivity } from './contracts'

export function hasActiveAssistantCompaction(activities: readonly AssistantActivity[]): boolean {
    let latest: AssistantActivity | null = null
    let latestTime = ''
    for (const activity of activities) {
        const payload = activity.payload || {}
        if (activity.kind !== 'context.compaction' && payload.category !== 'context-compaction'
            && payload.itemType !== 'context compaction') continue
        const time = String(payload.completedAt || payload.startedAt || activity.createdAt || '')
        if (!latest || time >= latestTime) { latest = activity; latestTime = time }
    }
    if (!latest || latest.tone === 'error') return false
    const payload = latest.payload || {}
    const status = String(payload.status || payload.state || payload.phase || latest.summary || '')
        .toLowerCase().replace(/[-_\s]/g, '')
    return ['running', 'inprogress', 'pending', 'started', 'autocompacting', 'compacting'].includes(status)
}
